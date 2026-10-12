import { alertSender, isAlertSendingConfigured, sendAllAlerts, type SendSummary } from "@/lib/alertSend";

// The daily alert pass: mails everyone whose beaches turned elevated today.
//
// Deliberately separate from /api/trigger: that one only dispatches the GitHub
// workflows that GENERATE the day's data, and this one reads the result.
// Running them from one route would mean sending alerts off whatever data
// happened to be committed before the workflows finished.
//
// TWO WAYS IN, and both are safe to fire because alert_notifications makes a
// repeat run a no-op:
//
//  1. project-neptune's daily-refresh workflow curls this endpoint as its last
//     step, once the day's predictions are published. This is the one that
//     matters: it fires the moment the data exists rather than at a guessed
//     hour, and it covers a MANUALLY re-run refresh too, which a clock-based
//     cron cannot.
//
//  2. A once-daily Vercel Cron, as a backstop for a workflow that published but
//     never called in. This project is on the Hobby plan, where crons are
//     limited to one run per day, so this cannot poll for late data - which is
//     exactly why path 1 is the primary.
//
// A run where no beach is elevated sends nothing, and a run where the day's
// predictions have not been published yet sends nothing and waits. There is no
// catch-up: yesterday's exceedance is not mailed out today.

export const dynamic = "force-dynamic";
// One fetch to Resend per recipient, plus a write each. Well inside the
// default, but the ceiling costs nothing and a slow upstream should not
// truncate the run partway through the list.
export const maxDuration = 300;

// The date the run treats as today, in UTC. The published forecasts are stamped
// in UTC by the backend, so the comparison has to be made in the same frame -
// see the staleness check in sendAlertsForLocation.
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
  // Reject anything else so the public cannot make the site send email.
  if (
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isAlertSendingConfigured()) {
    console.error("[cron/alerts] DATABASE_URL or GMAIL_APP_PASSWORD not configured");
    return new Response("Alert sending is not configured", { status: 500 });
  }

  // A rehearsal: run the whole selection and report who WOULD be mailed,
  // without sending or recording anything. Stays behind the same auth as a
  // real run, because the response names subscribers.
  //
  // Note the workflow that triggers this must never pass it: a dry-run
  // response looks like a successful run to a caller checking for results, so
  // a dry-run URL in the workflow would report success while sending nothing.
  const params = new URL(request.url).searchParams;
  const dryRunParam = params.get("dryRun");
  const dryRun = dryRunParam === "1" || dryRunParam === "true";

  const today = todayUtc();

  // KILL SWITCH. Two separate things can reach this route with a valid secret:
  // the GitHub notify step after the morning refresh, and the Vercel cron in
  // vercel.json at 14:00 UTC. Both authenticate automatically, so neither can
  // be stopped by not calling it.
  //
  // That matters during a provider migration more than it looks. Repairing the
  // cached-transport bug makes the OLD Gmail path start working again, so
  // deploying the fix with ALERT_EMAIL_PROVIDER still on gmail would quietly
  // resume subscriber mail that has not gone out for a week. Setting
  // ALERTS_PAUSED=1 closes both doors with one variable, before a line of this
  // is deployed.
  //
  // ?test=1 is deliberately still allowed through: it only ever reaches
  // ALERT_TEST_RECIPIENT, which is the whole point of being able to validate a
  // transport while subscriber mail stays off.
  const paused = process.env.ALERTS_PAUSED === "1";
  if (paused && params.get("test") !== "1") {
    console.log("[cron/alerts] paused; no subscriber mail attempted");
    return Response.json(
      { today, outcome: "paused", detail: "ALERTS_PAUSED=1" },
      { status: 200 }
    );
  }

  // A real send to one configured internal address, recording nothing. This is
  // the rollout step between a dry run and switching production over.
  if (params.get("test") === "1") {
    const to = process.env.ALERT_TEST_RECIPIENT;
    if (!to) {
      return Response.json(
        { outcome: "misconfigured", detail: "ALERT_TEST_RECIPIENT is not set" },
        { status: 500 }
      );
    }
    const sender = alertSender();
    // Timestamped so a second test actually sends rather than being replayed
    // out of the provider's 24h idempotency window.
    const outcome = await sender.send(
      {
        to,
        subject: "Project Neptune — alert transport test",
        html: "<p>Transport test. If you can read this, the alert sender is working.</p>",
        text: "Transport test. If you can read this, the alert sender is working.",
        oneClickUrl: "https://dashboard.projectneptune.co/api/alerts/unsubscribe/test",
      },
      `alert-test:${Date.now()}`
    );
    console.log("[cron/alerts] transport test", JSON.stringify({ provider: sender.name, ok: outcome.ok }));
    return Response.json(
      { outcome: outcome.ok ? "test_accepted" : "test_rejected", provider: sender.name, result: outcome },
      { status: outcome.ok ? 200 : 502 }
    );
  }

  try {
    const results = await sendAllAlerts(today, dryRun);
    // Surfaces in Vercel function logs, so a morning with no mail can be told
    // apart from a morning the job never ran. No addresses, by construction.
    console.log("[cron/alerts]", JSON.stringify({ today, dryRun, results: results.map(({ wouldNotify, ...summary }) => ({ ...summary, ...(wouldNotify ? { wouldNotifyCount: wouldNotify.length } : {}) })) }));

    const { outcome, status } = classify(results, dryRun);
    return Response.json({ today, dryRun, outcome, results }, { status });
  } catch (err) {
    // A database failure lands here. 503 rather than 500 because it is worth
    // another attempt, and the caller is told which kind of failure it was.
    const dbish = err instanceof Error && /database|connect|ECONN|timeout/i.test(err.message);
    console.error("[cron/alerts] run failed", err instanceof Error ? err.message : "unknown");
    return Response.json(
      { outcome: dbish ? "infrastructure_error" : "application_error" },
      { status: dbish ? 503 : 500 }
    );
  }
}

/**
 * One machine-readable outcome for the whole run, so the caller never has to
 * infer intent from a status code alone.
 *
 * This is the fix for the 2026-10-12 report: delivery failures used to return
 * a bare 502 that the workflow had no branch for, so it fell through to a
 * message about predictions being unavailable -- which was not what happened.
 * "Predictions not ready" and "the provider rejected the mail" are different
 * answers and now say so.
 */
function classify(
  results: SendSummary[],
  dryRun: boolean
): { outcome: string; status: number } {
  const considered = results.filter((r) => !r.skipped);
  const stale = results.filter((r) => r.skipped);
  const sent = results.reduce((n, r) => n + r.sent, 0);
  const failed = results.reduce((n, r) => n + r.failed, 0);
  const dupes = results.reduce((n, r) => n + (r.skippedDuplicates ?? 0), 0);
  const recipients = results.reduce((n, r) => n + r.recipients, 0);

  if (dryRun) return { outcome: "dry_run", status: 200 };

  // Nothing could even be evaluated: every location is on a stale forecast.
  // 425 Too Early, because the right response is to wait, not to re-send.
  if (considered.length === 0 && stale.length > 0) {
    return { outcome: "predictions_not_ready", status: 425 };
  }
  if (failed > 0 && sent > 0) return { outcome: "partial_failure", status: 502 };
  if (failed > 0) return { outcome: "delivery_failed", status: 502 };
  // Everything was already claimed: another run owns this date.
  if (sent === 0 && dupes > 0) return { outcome: "already_in_progress", status: 409 };
  if (recipients === 0) return { outcome: "nothing_to_send", status: 200 };
  return { outcome: "sent", status: 200 };
}
