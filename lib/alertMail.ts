// What an alert email says.
//
// Pure composition, deliberately free of any mail client or database: given the
// beaches that came back elevated and a link to unsubscribe, produce a subject,
// an HTML body and a plain-text body. That keeps the wording reviewable and
// testable without sending anything.
//
// Every alert carries the same three things, in this order: which beach, how to
// see it for yourself, and how to stop receiving these. The number is included
// because "elevated" on its own tells a reader nothing about whether this is
// borderline or severe.

import { formatMonthDayYear, type Status } from "./data";

// The dashboard a "see the full forecast" link points at.
const SITE_ORIGIN = "https://dashboard.projectneptune.co";

// One beach worth telling somebody about.
export interface AlertedBeach {
  code: string;
  name: string;
  probability: number; // 0-1, as published
  status: Status;
}

export interface ComposedEmail {
  subject: string;
  html: string;
  text: string;
}

function pct(probability: number): number {
  return Math.round(probability * 100);
}

// Escape anything interpolated into the HTML body. Beach names come from our
// own config today, but this function must stay safe if a name ever arrives
// from a backend-published roster file.
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function subjectFor(beaches: AlertedBeach[]): string {
  if (beaches.length === 1) {
    return `${beaches[0].name}: elevated bacteria forecast`;
  }
  return `${beaches.length} of your beaches have elevated bacteria levels`;
}

/**
 * Compose one subscriber's alert.
 *
 * `locationPath` is the dashboard slug the beaches belong to, so the link lands
 * on the board the reader signed up from rather than a generic home page.
 */
export function composeAlertEmail(
  beaches: AlertedBeach[],
  predictionDate: string,
  locationPath: string,
  unsubscribeUrl: string
): ComposedEmail {
  const when = formatMonthDayYear(predictionDate);
  const boardUrl = `${SITE_ORIGIN}/${locationPath}`;
  const lead =
    beaches.length === 1
      ? `Our forecast for ${when} puts one of the beaches you follow above the level where we would not recommend swimming.`
      : `Our forecast for ${when} puts ${beaches.length} of the beaches you follow above the level where we would not recommend swimming.`;

  const rows = beaches
    .map(
      (b) => `      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:15px;color:#0f172a;">${esc(b.name)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:15px;color:#7A1F1F;font-weight:600;text-align:right;white-space:nowrap;">${pct(b.probability)}%</td>
      </tr>`
    )
    .join("\n");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:28px;">
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#2C8487;letter-spacing:.02em;">PROJECT NEPTUNE</p>
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0f172a;">Elevated bacteria forecast</h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#475569;">${esc(lead)}</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
${rows}
    </table>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#475569;">
      The percentage is our estimated chance that bacteria exceed the EPA safe-swimming limit. It is a forecast, not a measurement.
    </p>
    <a href="${esc(boardUrl)}" style="display:inline-block;background:#2C8487;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:11px 20px;border-radius:6px;">See the full forecast</a>
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eee;font-size:12px;line-height:1.6;color:#94a3b8;">
      You asked us to email you when these beaches show elevated bacteria levels.
      For official beach advisories, consult the
      <a href="http://publichealth.lacounty.gov/phcommon/public/media/mediapubOdisplay.cfm" style="color:#94a3b8;">LA County Department of Public Health</a>.
      <br><br>
      <a href="${esc(unsubscribeUrl)}" style="color:#94a3b8;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;

  const text = [
    "PROJECT NEPTUNE",
    "Elevated bacteria forecast",
    "",
    lead,
    "",
    ...beaches.map((b) => `  ${b.name}: ${pct(b.probability)}%`),
    "",
    "The percentage is our estimated chance that bacteria exceed the EPA",
    "safe-swimming limit. It is a forecast, not a measurement.",
    "",
    `See the full forecast: ${boardUrl}`,
    "",
    "---",
    "You asked us to email you when these beaches show elevated bacteria",
    "levels. For official beach advisories, consult the LA County Department",
    "of Public Health.",
    "",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject: subjectFor(beaches), html, text };
}
