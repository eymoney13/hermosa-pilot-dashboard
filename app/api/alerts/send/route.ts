import { isAlertSendingConfigured, sendAllAlerts } from "@/lib/alertSend";

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
  try {
    const results = await sendAllAlerts(today, dryRun);
    // Surfaces in Vercel function logs, so a morning with no mail can be told
    // apart from a morning the job never ran.
    console.log("[cron/alerts]", JSON.stringify({ today, dryRun, results }));
    const failed = results.reduce((n, r) => n + r.failed, 0);
    return Response.json(
      { today, dryRun, results },
      { status: failed > 0 ? 502 : 200 }
    );
  } catch (err) {
    console.error("[cron/alerts] run failed", err);
    return new Response("Alert run failed", { status: 500 });
  }
}
