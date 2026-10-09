import "server-only";
import { neon } from "@neondatabase/serverless";
import type { BeachData } from "./data";
import type { SendSummary } from "./alertSend";
import { selectSandboxAlerts, sandboxAlertEmail, type AlertState } from "./sandboxAlertPolicy";

type Send = (to: string, subject: string, html: string, text: string, unsubscribe: string) => Promise<boolean>;
// Caller has already validated forecast freshness. Verified free followers and explicitly linked paid
// Pro followers qualify. The historical storage key remains stable across public routes.
export async function sendSandboxAlerts(beaches: BeachData[], date: string, dryRun: boolean, send: Send): Promise<SendSummary> {
  const sql = neon(process.env.DATABASE_URL!);
  const summary: SendSummary = {location:"california", predictionDate:date, elevated:beaches.filter(b => b.status === "Not recommended").map(b => b.code), recipients:0,sent:0,failed:0,...(dryRun ? {dryRun:true,wouldNotify:[]} : {})};
  const rows = await sql`
    SELECT s.id, s.email, s.unsubscribe_token, d.states, d.clerk_user_id, array_agg(x.station_code) AS stations
    FROM alert_subscribers s
    JOIN sandbox_alert_delivery d ON d.subscriber_id = s.id
    JOIN alert_subscriptions x ON x.subscriber_id = s.id
    WHERE s.location = 'sandbox' AND ((d.free_enabled AND d.clerk_user_id IS NULL) OR EXISTS (
      SELECT 1 FROM pro_subscriptions p WHERE p.clerk_user_id = d.clerk_user_id
      AND p.status IN ('active','trialing','past_due')
      AND (p.current_period_end IS NULL OR p.current_period_end > now())
    )) GROUP BY s.id, d.states, d.clerk_user_id
  `;
  for (const row of rows) {
    let state = row.states as AlertState;
    if (!dryRun) {
      // Lease exceeds the route's 300s runtime. Concurrent cron/workflow calls
      // cannot both deliver. Failed sends release it; a killed run expires it.
      const claimed = await sql`UPDATE sandbox_alert_delivery SET lease_until = now() + interval '10 minutes'
        WHERE subscriber_id = ${row.id} AND (lease_until IS NULL OR lease_until < now()) RETURNING states`;
      if (!claimed.length) continue;
      state = claimed[0].states as AlertState;
    }
    try {
      const followed = beaches.filter(b => (row.stations as string[]).includes(b.code));
      // Preserve a preceding legacy high event for clear-up eligibility and
      // prevent a same-day duplicate when a free subscriber upgrades.
      const prior = await sql`SELECT n.station_code, max(n.last_notified_date)::text AS date
        FROM alert_subscribers s JOIN alert_notifications n ON n.subscriber_id=s.id
        WHERE s.email=${row.email} AND s.location IN ('southbay','sandbox')
        GROUP BY n.station_code`;
      state = {...state};
      for (const old of prior) {
        const current = state[old.station_code];
        if (!current || old.date > current.date) state[old.station_code] = {kind:"high",date:old.date};
      }
      const selected = selectSandboxAlerts(followed, state, date);
      const high = selected.high;
      const cleared = row.clerk_user_id ? selected.cleared : [];
      if (!high.length && !cleared.length) continue;
      summary.recipients++;
      if (dryRun) { summary.wouldNotify!.push({email:row.email,stations:[...high,...cleared].map(b => b.code)}); continue; }
      const base = "https://dashboard.projectneptune.co";
      const mail = sandboxAlertEmail(high, cleared, date, `${base}/unsubscribe/${row.unsubscribe_token}`, Boolean(row.clerk_user_id));
      if (!(await send(row.email, mail.subject, mail.html, mail.text, `${base}/api/alerts/unsubscribe/${row.unsubscribe_token}`))) {summary.failed++;continue;}
      const next = {...state};
      for (const b of high) next[b.code] = {kind:"high",date};
      for (const b of cleared) next[b.code] = {kind:"low",date};
      await sql`UPDATE sandbox_alert_delivery SET states = ${JSON.stringify(next)}::jsonb, updated_at = now() WHERE subscriber_id = ${row.id}`;
      // Shared history lets a grandfathered alert resume without repeating a
      // high email already delivered by Pro earlier on the same date.
      for (const b of high) await sql`INSERT INTO alert_notifications(subscriber_id,station_code,last_notified_date)
        VALUES (${row.id},${b.code},${date}::date)
        ON CONFLICT(subscriber_id,station_code) DO UPDATE SET last_notified_date=EXCLUDED.last_notified_date,updated_at=now()`;
      summary.sent++;
    } finally {
      if (!dryRun) await sql`UPDATE sandbox_alert_delivery SET lease_until = NULL WHERE subscriber_id = ${row.id}`;
    }
  }
  return summary;
}
