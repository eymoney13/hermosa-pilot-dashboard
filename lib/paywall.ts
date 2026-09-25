import "server-only";
import { getLocation, type BeachData, type ForecastDay } from "./data";
import { featuresFor, type FeatureFlags } from "./features";
import { buildSummary } from "./summary";

// The paywall itself.
//
// THIS IS THE SECURITY BOUNDARY, and it is the only one. `beaches` is handed
// whole to DashboardTabs, a client component, so every field left on it is
// serialised into the page and readable from view-source. Blurring in CSS hides
// nothing. So the paid half is removed here, on the server, before the page is
// rendered — what the locked UI draws is the absence, not a cover over
// something still present.
//
// Free, on a locked beach:
//   the list, the map, and today's reading — the number, its tier, the beach
//   and the date — plus "What we're seeing" for today, minus its last sentence.
//
// Paid:
//   the days either side of today, the individual lab samples behind the
//   confidence figure, and everything under “What’s affecting the
//   water quality?” — the ranked drivers, the measured conditions, the last
//   lab sample and the forecast-accuracy record.

/**
 * A day that exists but whose values are withheld.
 *
 * The date survives so the strip still shows the right number of cells in the
 * right order; nothing else does. No placeholder probability and no placeholder
 * status: a made-up reading on a public-health board is not acceptable even
 * when it is behind a blur, because a blur is a visual effect and screen
 * readers, the DOM and a screenshot at the wrong moment are not fooled by it.
 */
function lockDay(day: ForecastDay): ForecastDay {
  return {
    date: day.date,
    locked: true,
    // Placeholders, NOT this day's values. `status` and `probability` are
    // required by ForecastDay, and carrying the real ones through would hand
    // over the reading itself — the tier is most of what the forecast is worth.
    // Nothing renders them: every consumer branches on `locked` first. If you
    // are reading these two fields on a locked day, that is the bug.
    status: "Normal",
    probability: 0,
  };
}

export interface RedactOptions {
  entitled: boolean;
  features: FeatureFlags;
}

/**
 * Strip the paid half from every beach, unless the reader is entitled.
 *
 * A no-op on boards without the paywall flag and for entitled readers — it
 * returns the same array, so every other board is untouched by construction
 * rather than by care.
 */
export function redactForEntitlement(
  beaches: BeachData[],
  { entitled, features }: RedactOptions
): BeachData[] {
  if (!features.paywall || entitled) return beaches;
  return beaches.map((beach) => redactBeach(beach, features));
}

function redactBeach(beach: BeachData, features: FeatureFlags): BeachData {
  return {
    ...beach,
    locked: true,

    // Built here because it cannot be built later. BeachCard writes this from
    // beach.drivers, which is about to be emptied, so the sentences are
    // composed while the inputs still exist and only the prose travels to the
    // client. The reader gets the explanation; the payload does not get the
    // ranked drivers it was written from.
    summary: features.predictionSummary ? freeSummary(beach, features) : undefined,

    // The days either side of today. Same count, same dates, no values.
    pastDays: beach.pastDays.map(lockDay),
    forecast: beach.forecast.map(lockDay),

    // Everything the water-quality panel renders.
    factors: [],
    drivers: [],
    conditions: {},
    lastResult: null,
    daysSinceSample: null,
    // Not zeroed. The headline percentage is what a free reader is meant to
    // see — it is the board's claim about itself, and hiding it would be
    // charging for the answer to "should I believe any of this". It is derived
    // from totalMatches/totalSamples alone (see accuracyPercent), so those two
    // stay and the detail behind them goes:
    //
    //   samples     the individual lab results, which is the panel a free
    //               reader cannot open
    //   windowSize  "matched 6 of the last 7" is a summary OF those samples,
    //   matches     so it goes with them
    accuracy: {
      ...beach.accuracy,
      samples: [],
      windowSize: 0,
      matches: 0,
    },
    excRatePct: null,
    nSamples: null,

    // Not the written summary — this is the backend's own one-liner, and it
    // describes the drivers too.
    insight: "",
  };
}

// Today's paragraph, and only today's. includeOutlook: false drops the closing
// "the next few days..." sentence, which is the one line in the summary that
// would narrate the forecast this beach has just locked.
function freeSummary(beach: BeachData, features: FeatureFlags): string[] {
  return buildSummary({
    name: beach.proseName,
    verdict: features.binaryVerdict ? beach.verdict : null,
    date: beach.predictionDate,
    timeframe: "today",
    noRecentSample: beach.noRecentSample,
    drivers: beach.drivers,
    conditions: beach.conditions,
    forecast: beach.forecast,
    status: features.binaryVerdict ? null : beach.status,
    includeOutlook: false,
  });
}

/**
 * Validate a `from=` path and return the board it names, but only if that board
 * is actually selling something.
 *
 * Every paid entry point — starting a checkout, opening the billing portal —
 * goes through this. Without it those routes are global: /pro/start is reachable
 * by URL from anywhere, so /pro/start?from=/southbay would create a LIVE Stripe
 * Checkout for a board with no paywall, and whoever paid would unlock nothing
 * because /southbay redacts nothing. Real money for no product is the worst
 * failure this system can produce, and it needs no attacker — a stale link or a
 * shared URL is enough.
 *
 * Three ways to be rejected, all returning null:
 *   - not a plain relative path (so `//evil.example.com` and any absolute URL
 *     cannot turn our own domain into an open redirect via Stripe's return_url)
 *   - not a board we know
 *   - a board whose paywall flag is off
 *
 * Returns the normalised "/<slug>", so anything trailing the slug is discarded
 * rather than carried into a redirect.
 */
export function paywalledReturnPath(from: string | undefined): string | null {
  if (!from || !/^\/[A-Za-z0-9/_-]*$/.test(from)) return null;
  const slug = from.split("/").filter(Boolean)[0];
  if (!slug || !getLocation(slug)) return null;
  if (!featuresFor(slug).paywall) return null;
  return `/${slug}`;
}
