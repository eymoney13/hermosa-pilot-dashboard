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

// LA County's per-beach grade listing. Note this is NOT the same page as the
// advisory link in the site footer (which points at the press-release feed);
// this one lands a reader on the official grade for the beach they just read
// about, which is what someone holding an alert actually wants.
const ADVISORY_URL =
  "http://publichealth.lacounty.gov/phcommon/public/eh/water_quality/beach_grades.cfm";
const ADVISORY_LABEL = "LA County Department of Public Health";

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

// Every beach in an alert is there because it crossed into the top tier, so the
// reading is always "High" - it is a label for the number beside it, not a
// varying grade. If a lower tier ever becomes mailable this has to become
// conditional, or it will call a 31% beach High.

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

// "may have", not "has". These are model output, not a lab result, and the
// subject line is the part most people read without opening anything - it is
// the one place the hedge has to be carried explicitly.
export function subjectFor(
  beaches: AlertedBeach[],
  cleared: AlertedBeach[] = []
): string {
  // Both at once gets its own line rather than leading with one and burying
  // the other.
  if (beaches.length && cleared.length) return "Your Neptune beach update";
  if (!beaches.length && cleared.length) {
    return cleared.length === 1
      ? `${cleared[0].name} is back to low bacteria levels`
      : `${cleared.length} of your beaches are back to low bacteria levels`;
  }
  if (beaches.length === 1) {
    return `${beaches[0].name} may have elevated bacteria levels`;
  }
  return `${beaches.length} of your beaches may have elevated bacteria levels`;
}

/**
 * Compose one subscriber's alert.
 *
 * `locationPath` is the dashboard slug the beaches belong to, so the link lands
 * on the board the reader signed up from rather than a generic home page.
 */
export interface ComposeOptions {
  /**
   * Beaches that have come back down. Pro only -- sendSandboxAlerts passes an
   * empty array for free subscribers, so they never learn a beach cleared.
   */
  cleared?: AlertedBeach[];
  /** Swap the masthead for paid subscribers. Layout is identical either way. */
  pro?: boolean;
}

export function composeAlertEmail(
  beaches: AlertedBeach[],
  predictionDate: string,
  locationPath: string,
  unsubscribeUrl: string,
  options: ComposeOptions = {}
): ComposedEmail {
  const cleared = options.cleared ?? [];
  const when = formatMonthDayYear(predictionDate);
  // UTMs so PostHog can count visits that came from an alert email: mail
  // clients rarely send a referrer, so without them a click looks direct.
  const boardUrl = `${SITE_ORIGIN}/${locationPath}?utm_source=email&utm_medium=alert&utm_campaign=beach_alert`;
  const masthead = options.pro
    ? "NEPTUNE PRO"
    : "PROJECT NEPTUNE (The Neptune Index)";

  // With no cleared beaches this is word-for-word what it has always been, so
  // the 198 grandfathered subscribers see no change at all.
  const highLead =
    beaches.length === 1
      ? `Our forecast for ${when} predicts one of the beaches you follow may have high levels of bacteria.`
      : `Our forecast for ${when} predicts ${beaches.length} of the beaches you follow may have high levels of bacteria.`;
  const clearedLead =
    cleared.length === 1
      ? `Our forecast for ${when} has one of the beaches you follow back at low levels of bacteria.`
      : `Our forecast for ${when} has ${cleared.length} of the beaches you follow back at low levels of bacteria.`;
  const lead = beaches.length
    ? (cleared.length ? `${highLead} ${clearedLead}` : highLead)
    : clearedLead;

  const row = (b: AlertedBeach, label: string, colour: string) => `      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:15px;color:#0f172a;">${esc(b.name)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:15px;color:${colour};font-weight:600;text-align:right;white-space:nowrap;">${label} ${pct(b.probability)}%</td>
      </tr>`;

  const rows = beaches.map((b) => row(b, "High", "#7A1F1F")).join("\n");
  // Appended only when there is something to append, so the high-only email is
  // byte-for-byte unchanged.
  const clearedRows = cleared.length
    ? `\n    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">\n` +
      cleared.map((b) => row(b, "Low", "#15607A")).join("\n") +
      `\n    </table>`
    : "";

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:28px;">
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#2C8487;letter-spacing:.02em;">${masthead}</p>
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0f172a;">Beach Water Quality</h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#475569;">${esc(lead)}</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
${rows}
    </table>${clearedRows}
    <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#475569;">
      The percentage is our estimated chance that bacteria exceed the EPA safe-swimming limit. It is a forecast, not an actual test result.
    </p>
    <a href="${esc(boardUrl)}" style="display:inline-block;background:#2C8487;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:11px 20px;border-radius:6px;">See the full forecast</a>
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eee;font-size:12px;line-height:1.6;color:#94a3b8;">
      You receive these alerts when these beaches show elevated bacteria levels.
      For official beach advisories, consult the
      <a href="${ADVISORY_URL}" style="color:#94a3b8;">${ADVISORY_LABEL}</a>.
      <br><br>
      <a href="${esc(unsubscribeUrl)}" style="color:#94a3b8;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;

  const text = [
    masthead,
    "Beach Water Quality",
    "",
    lead,
    "",
    ...beaches.map((b) => `  ${b.name}: High ${pct(b.probability)}%`),
    ...cleared.map((b) => `  ${b.name}: Low ${pct(b.probability)}%`),
    "",
    "The percentage is our estimated chance that bacteria exceed the EPA",
    "safe-swimming limit. It is a forecast, not an actual test result.",
    "",
    `See the full forecast: ${boardUrl}`,
    "",
    "---",
    "You receive these alerts when these beaches show elevated bacteria",
    `levels. For official beach advisories, consult the ${ADVISORY_LABEL}:`,
    ADVISORY_URL,
    "",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject: subjectFor(beaches, cleared), html, text };
}
