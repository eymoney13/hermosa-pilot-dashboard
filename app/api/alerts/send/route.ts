import { isAlertSendingConfigured, sendAllAlerts } from "@/lib/alertSend";

// Vercel Cron entrypoint for the daily alert pass. Runs after the morning
// refresh has published, and mails everyone whose beaches turned today.
//
// Deliberately separate from /api/trigger: that one only dispatches the
// GitHub workflows that GENERATE the day's data, and this one reads the result.
// Running them from one route would mean sending alerts off whatever data
// happened to be committed before the workflows finished.

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
    console.error("[cron/alerts] DATABASE_URL or RESEND_API_KEY not configured");
    return new Response("Alert sending is not configured", { status: 500 });
  }

  const today = todayUtc();
  try {
    const results = await sendAllAlerts(today);
    // Surfaces in Vercel function logs, so a morning with no mail can be told
    // apart from a morning the job never ran.
    console.log("[cron/alerts]", JSON.stringify({ today, results }));
    const failed = results.reduce((n, r) => n + r.failed, 0);
    return Response.json({ today, results }, { status: failed > 0 ? 502 : 200 });
  } catch (err) {
    console.error("[cron/alerts] run failed", err);
    return new Response("Alert run failed", { status: 500 });
  }
}
