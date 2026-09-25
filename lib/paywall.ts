import "server-only";
import type { BeachData, ForecastDay } from "./data";
import type { FeatureFlags } from "./features";
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
//   the days either side of today, and everything under “What’s affecting the
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
    accuracy: {
      windowSize: 0,
      matches: 0,
      samples: [],
      totalSamples: 0,
      totalMatches: 0,
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
