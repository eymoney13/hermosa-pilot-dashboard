import type { Status } from "./data";
export type AlertState = Record<string, { kind: "high" | "low"; date: string }>;
export type AlertBeach = { code: string; name: string; status: Status };
export function selectSandboxAlerts(beaches: AlertBeach[], state: AlertState, date: string) {
  const high: AlertBeach[] = [], cleared: AlertBeach[] = [];
  for (const beach of beaches) {
    const previous = state[beach.code];
    // Never replay or overwrite a newer forecast, including same-date corrections.
    if (previous && previous.date >= date) continue;
    if (beach.status === "Not recommended") high.push(beach);
    else if (beach.status === "Normal" && previous?.kind === "high") cleared.push(beach);
    // Moderate is not a clear-up. Keep the high state until a low forecast arrives.
  }
  return { high, cleared };
}
function esc(s: string) { return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!)); }
export function sandboxAlertEmail(high: AlertBeach[], cleared: AlertBeach[], date: string, unsubscribeUrl: string) {
  const subject = high.length && cleared.length ? "Your Neptune beach update" : high.length ? "Neptune forecast: elevated bacteria" : "Neptune forecast: back to low bacteria";
  const lines = ["NEPTUNE PRO", `Forecast update for ${date}`, "",
    ...(high.length ? ["High bacteria forecast", ...high.map(b => b.name), ""] : []),
    ...(cleared.length ? ["Back to a low bacteria forecast", ...cleared.map(b => b.name), ""] : []),
    "These are model forecasts, not lab results or confirmation that an official advisory has cleared. Always follow official beach advisories.",
    "View your beaches: https://dashboard.projectneptune.co/sandbox",
    `Unsubscribe: ${unsubscribeUrl}`, "Questions? ethan@projectneptune.co"];
  const section = (title: string, beaches: AlertBeach[]) => beaches.length ? `<h2 style="font-size:18px">${title}</h2><ul>${beaches.map(b => `<li style="margin:8px 0">${esc(b.name)}</li>`).join("")}</ul>` : "";
  return { subject, text: lines.join("\n"), html: `<!doctype html><html lang="en"><body style="background:#f4f6f5;font-family:Arial,sans-serif;color:#183b3b;padding:24px"><main style="max-width:540px;margin:auto;background:white;padding:28px;border-top:4px solid #176b65"><p>NEPTUNE PRO</p><h1 style="font-size:26px">Your beach update</h1><p>Forecast for ${esc(date)}</p>${section("High bacteria forecast", high)}${section("Back to a low bacteria forecast", cleared)}<p style="line-height:1.6">These are model forecasts, not lab results or confirmation that an official advisory has cleared. Always follow official beach advisories.</p><p><a href="https://dashboard.projectneptune.co/sandbox" style="display:inline-block;background:#176b65;color:white;padding:14px 20px;text-decoration:none;border-radius:6px">View your beaches</a></p><p style="font-size:13px"><a href="${esc(unsubscribeUrl)}">Unsubscribe</a> · <a href="mailto:ethan@projectneptune.co">Contact Neptune</a></p></main></body></html>` };
}
