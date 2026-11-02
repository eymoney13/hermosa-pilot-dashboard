import { STATUS_BAND, type BeachData } from "./data";
import { PRO_PLANS, type ProPlan } from "./proPlans";

// Shared PostHog property shapes, so every event describes a beach or a plan
// the same way. A few well-typed properties on a handful of events answer more
// questions later than a new event name per question.

// The moment that brought a reader to the Pro card. The header, banner and
// locked-forecast links only scroll to the card, so the card's own events carry
// the moment forward; california_bottom means the reader scrolled there alone.
// This is the product question: what makes someone want Pro?
export type CtaLocation = "california_bottom" | "header_get_pro" | "list_banner" | "beach_forecast_lock";

// A paid feature a free reader tried to open: locked_feature_clicked. Kept out
// of the purchase funnel on purpose; it is diagnostic, answering which
// information people actually want enough to pay for. Name new locks here so
// the values stay comparable across releases.
export type LockedFeature = "three_day_forecast" | "water_quality_history" | "email_alerts";

// Which view the card sat under when it was seen or clicked.
export type PageContext = "beach_page" | "list" | "map" | "news";

export function beachProperties(beach: BeachData, region: string) {
  return {
    beach_id: beach.code,
    beach_name: beach.name,
    region,
    // The same three words the legend shows: low / moderate / high.
    risk_level: STATUS_BAND[beach.status].short.toLowerCase(),
    // The 0-100 number BeachCard draws as the Neptune Index.
    neptune_index: Math.round(Math.max(0, Math.min(1, beach.probability)) * 100),
  };
}

export function planProperties(plan: ProPlan) {
  return {
    plan: plan === "yearly" ? "annual" : "monthly",
    price: PRO_PLANS[plan].cents / 100,
  };
}

// First-touch acquisition source, kept on every later event from this browser:
// utm_source when the link carried one, else the referring site, else direct.
export function acquisitionSource(): string {
  const utm = new URLSearchParams(window.location.search).get("utm_source");
  if (utm) return utm.toLowerCase();
  try {
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    if (host && host !== window.location.hostname.replace(/^www\./, "")) return host;
  } catch {
    // No referrer, or not a URL.
  }
  return "direct";
}

// utm_medium and utm_campaign alongside source, e.g. qr / beach_sign /
// hermosa_26th. Only set when the landing link carried them, so a later visit
// with no UTMs cannot blank out the first one.
export function acquisitionCampaign(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const [param, key] of [["utm_medium", "medium"], ["utm_campaign", "campaign"]] as const) {
    const value = params.get(param);
    if (value) out[key] = value.toLowerCase();
  }
  return out;
}
