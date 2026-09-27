export interface LocationConfig {
  slug: string;
  displayName: string; // e.g. "Hermosa Beach, CA" — used in BeachCard + header + metadata
  stations: string[]; // station codes for this location
  beachNames: Record<string, string>;
  mapFallbackCenter: [number, number]; // [lat, lng] used by MapView when no beaches loaded
  // Optional per-location news filter (case-insensitive substring match against
  // an article's title/snippet/source/url). This is the in-code default; it can
  // be overridden at runtime by a NEWS_FILTER_TERMS_<SLUG> env var (e.g.
  // NEWS_FILTER_TERMS_MANHATTAN). Both override the global NEWS_FILTER_* config
  // for this location only; omit all three to use the global behavior.
  newsFilterTerms?: string[];
  // Optional: the beach roster (which stations to show, their display names and
  // coordinates) is published by the backend as a JSON file at
  // public/data/<slug>/<rosterFile>, rather than hand-listed in `stations` /
  // `beachNames` above. Locations that set this leave those two empty — the
  // roster is whatever the backend last published. See RosterFile in loadData.ts.
  rosterFile?: string;
  // Optional: classify status against this location's own per-station threshold
  // instead of the shared fixed tiers (see statusFromProb). Opt-in, because the
  // CA locations are calibrated to the fixed 30/50 cutoffs and must not move.
  statusFromThreshold?: boolean;
  // IANA zone for this board's coast. Dates elsewhere are date-only and format
  // as UTC, but a run time is a moment: shown in the runner's UTC it would read
  // hours off, and on an early-morning run it can land on the wrong day.
  timeZone: string;
  // Official advisory authority linked in the page footer. Defaults to LA County
  // (the CA locations) when omitted.
  advisory?: { label: string; href: string };
  // Optional: station codes pinned to the top of the List tab, in this order.
  // Everything else follows in the board's usual north-to-south order (see
  // orderForList). The List tab only — the Map, the tabs and the card picker
  // stay on the coastline order, which is the one that matches the geography
  // they draw.
  listTopStations?: string[];
  // Optional: read this board's published files from public/data/<dataSlug>
  // instead of public/data/<slug>. Lets one board mirror another's live data
  // with no copied files and nothing added to project-neptune — the mirror is
  // current the moment the original's daily refresh lands. Defaults to `slug`,
  // so every board that does not set it is unaffected.
  dataSlug?: string;
  // Optional: ask search engines not to index this board. For the boards that
  // are not the real thing — an experiment showing another board's data under
  // a different name is exactly what should not turn up in a search for it.
  noindex?: boolean;
}

/** Where a board's published files live. See LocationConfig.dataSlug. */
export function dataSlugFor(config: LocationConfig): string {
  return config.dataSlug ?? config.slug;
}

export const LOCATIONS: Record<string, LocationConfig> = {
  hermosa: {
    slug: "hermosa",
    displayName: "Hermosa Beach, CA",
    stations: ["DHS114", "DHS115"],
    beachNames: {
      DHS114: "Hermosa Beach - 26th St",
      DHS115: "Hermosa Beach - TK",
    },
    mapFallbackCenter: [33.862, -118.403],
    timeZone: "America/Los_Angeles",
  },
  manhattan: {
    slug: "manhattan",
    displayName: "Manhattan Beach, CA",
    stations: ["DHS113"],
    beachNames: {
      DHS113: "Manhattan Beach - 28th St",
    },
    mapFallbackCenter: [33.8945, -118.418],
    timeZone: "America/Los_Angeles",
    // News tab shows only Manhattan Beach + LA-area coverage. Includes local
    // place names and LA news domains (matched against the article URL) to
    // catch stories that never spell out the city/state.
    newsFilterTerms: [
      "manhattan beach",
      "el porto",
      "el segundo",
      "south bay",
      "los angeles",
      "l.a.",
      "la county",
      "santa monica bay",
      "latimes.com",
      "ktla.com",
      "dailybreeze.com",
      "easyreadernews",
      "kfiam640",
      "lacounty.gov",
      "abc7.com",
    ],
  },
  // South Bay overview: one dashboard spanning Dockweiler (seven stations),
  // Manhattan, Hermosa (two stations), and Redondo. Tab order follows the coast
  // north → south. Plain Manhattan-style UI (no feature flags — see
  // lib/features.ts).
  //
  // Dockweiler runs ~4.6 km from Culver Blvd. down to the south jetty and is
  // sampled by two overlapping programs — LA County's DHS110-112B and the Santa
  // Monica Bay SMB-2-* shoreline stations — so the two families interleave down
  // the coast rather than sitting in separate blocks. Neither program publishes
  // a display name, so every Dockweiler label below is ours. The storm-drain and
  // Culver Blvd. names are the sampling landmarks; (North)/(Central)/(South)/
  // (South Jetty) are positional, assigned by latitude, and do not correspond to
  // any posted sign at the beach.
  //
  // SMB-2-11 and DHS110 sit 468 m apart and agreed on the exceedance call on all
  // 75 days both were sampled — near-duplicate pins by design, kept because each
  // program samples on its own schedule.
  southbay: {
    slug: "southbay",
    displayName: "South Bay, CA",
    //
    // HIDDEN, NOT RETIRED. Three stations are deliberately absent from
    // `stations` below while the backend keeps publishing them:
    //
    //   DHS110  "Dockweiler State Beach (North)"
    //   DHS111  "Dockweiler State Beach (Central)"
    //   DHS112  "Dockweiler State Beach (South)"
    //
    // Their BEACH_FILTER entries in project-neptune's daily-refresh-southbay.yml
    // are untouched on purpose, so nowcast/forecast/history/accuracy rows keep
    // accruing and any of them can be shown again by re-adding it here — no
    // backfill, no waiting for history to rebuild. resolveRoster drives the
    // display off `stations`, so a published station that is not listed simply
    // never renders (see loadData.ts).
    //
    // DHS110 and DHS112 cost no coverage: each has a near-twin still on the
    // board that agrees with it on nearly every lab sample — DHS110 with
    // SMB-2-11 (468 m, agreed on all 75 co-sampled days) and DHS112 with
    // DHS112B (114 m, agreed on 97.6% of 745 co-sampled days).
    //
    // DHS111 has no twin, so hiding it genuinely thins the middle of Dockweiler
    // rather than deduplicating it: SMB-2-13 to DHS112B becomes a single 1.83 km
    // hop where it was two of ~0.9 km. That is in line with the rest of the
    // board (1.57, 1.65 and 2.56 km between its other neighbours), so the
    // spacing stays even — there is just one less pin in the middle.
    stations: [
      "SMB-2-10",
      "SMB-2-11",
      "SMB-2-13",
      "DHS112B",
      "DHS113",
      "DHS114",
      "DHS115",
      "DHS116",
    ],
    beachNames: {
      "SMB-2-10": "Dockweiler State Beach (Culver Blvd.)",
      "SMB-2-11": "Dockweiler State Beach (Westchester Storm Drain)",
      "SMB-2-13": "Dockweiler State Beach (Imperial HWY Storm Drain)",
      DHS112B: "Dockweiler State Beach (South Jetty)",
      DHS113: "Manhattan Beach - 28th st",
      DHS114: "Hermosa Beach - 26th St",
      DHS115: "Hermosa Beach - Herondo St",
      DHS116: "Redondo Beach - Topaz",
    },
    // The List leads with the four city beaches - Manhattan, both Hermosa
    // stations and Redondo - and puts the Dockweiler pins under them. Strict
    // north-to-south order opened the list with four Dockweiler rows whose
    // names differ only by their landmark in parentheses, so a reader looking
    // for their own beach scrolled past half the board to reach it. The map
    // keeps the coastline order; a list is read top-down, not geographically.
    //
    // Only the four are pinned, so the three hidden Dockweiler stations above
    // slot back into the block below in latitude order if they are ever
    // re-added, with no change here.
    listTopStations: ["DHS113", "DHS114", "DHS115", "DHS116"],
    // Recentered for the Dockweiler additions: the roster now spans 33.8321
    // (Redondo) to 33.9570 (Culver Blvd.). Only used when no beaches load.
    mapFallbackCenter: [33.895, -118.42],
    timeZone: "America/Los_Angeles",
  },
  // A copy of South Bay to experiment on.
  //
  // /southbay has real readers, so there is nowhere to try a layout change
  // without shipping it to them. This board shows THE SAME LIVE DATA — dataSlug
  // points its reads at public/data/southbay, so there is no second copy of the
  // files, nothing for project-neptune to publish twice, and no way for the two
  // to drift — but carries its own entry in FEATURES_BY_LOCATION, which is the
  // whole point: flags can be flipped here without touching the real board.
  //
  // The roster below is duplicated rather than shared. It is the one thing that
  // SHOULD be free to diverge: reordering the list or hiding a station is
  // exactly the kind of change this board exists to try out.
  //
  // Alerts and the Pro offer are deliberately off (see lib/features.ts).
  sandbox: {
    slug: "sandbox",
    // Named in full, because the two boards are otherwise identical on screen
    // and this name is the only thing in a screenshot that tells them apart.
    displayName: "South Bay Sandbox, CA",
    dataSlug: "southbay",
    noindex: true,
    stations: [
      "SMB-2-10",
      "SMB-2-11",
      "SMB-2-13",
      "DHS112B",
      "DHS113",
      "DHS114",
      "DHS115",
      "DHS116",
    ],
    beachNames: {
      "SMB-2-10": "Dockweiler State Beach (Culver Blvd.)",
      "SMB-2-11": "Dockweiler State Beach (Westchester Storm Drain)",
      "SMB-2-13": "Dockweiler State Beach (Imperial HWY Storm Drain)",
      DHS112B: "Dockweiler State Beach (South Jetty)",
      DHS113: "Manhattan Beach - 28th st",
      DHS114: "Hermosa Beach - 26th St",
      DHS115: "Hermosa Beach - Herondo St",
      DHS116: "Redondo Beach - Topaz",
    },
    // Copied from South Bay so the board starts as a faithful duplicate. This
    // is one of the things most worth reordering here first.
    listTopStations: ["DHS113", "DHS114", "DHS115", "DHS116"],
    mapFallbackCenter: [33.895, -118.42],
    timeZone: "America/Los_Angeles",
  },
  // Cabrillo Beach (San Pedro) overview: three stations. Multi-beach, so the
  // dashboard opens to the all-locations Map tab (like South Bay). Station
  // coordinates come from the data files; the names below are placeholders —
  // confirm the real display names.
  cabrillo: {
    slug: "cabrillo",
    displayName: "Cabrillo Beach, CA",
    stations: ["CB-01", "CB-02", "SMB-7-9"],
    beachNames: {
      "CB-01": "Inner Cabrillo Beach (boatlaunch)",
      "CB-02": "Inner Cabrillo Beach (restrooms)",
      "SMB-7-9": "Outer Cabrillo Beach",
    },
    mapFallbackCenter: [33.707, -118.283],
    timeZone: "America/Los_Angeles",
  },
  // Boston-area beaches (Massachusetts). Unlike the CA locations, the roster is
  // owned by the backend and published as boston_display.json — so `stations`
  // and `beachNames` stay empty here and are resolved at load time. Boston's
  // model ships its own Safe/Unsafe call against a per-beach threshold
  // (DEFAULT 0.29), so it classifies on that threshold rather than the shared
  // fixed tiers, keeping the dashboard in agreement with the backend.
  boston: {
    slug: "boston",
    displayName: "Boston, MA",
    stations: [],
    beachNames: {},
    rosterFile: "boston_display.json",
    statusFromThreshold: true,
    mapFallbackCenter: [42.33, -71.02],
    timeZone: "America/New_York",
    advisory: {
      label: "Massachusetts Department of Public Health",
      href: "https://www.mass.gov/info-details/interactive-beach-water-quality-dashboard",
    },
  },
};

// Helper: resolve a slug to a config, or undefined.
export function getLocation(slug: string): LocationConfig | undefined {
  return LOCATIONS[slug];
}

/**
 * The internal 3-tier classification. These values are IDENTIFIERS, not display
 * text: they key the colour, tint and icon maps, decide which beaches an alert
 * goes out for, and are compared against in a dozen places. What a reader
 * actually sees is STATUS_LABEL[status].
 *
 * They were the display strings until the key was renamed to describe bacteria
 * levels. Renaming them too would have meant editing the alert filter and every
 * palette map to no purpose, so they stayed put and the labels moved out.
 */
export type Status = "Normal" | "Slightly elevated" | "Not recommended";

// The read used by boards whose model publishes a straight Safe/Unsafe call
// against a per-beach probability cutoff (see verdictFor). Locations opt into
// showing it via the `binaryVerdict` feature flag; `Status` stays the internal
// 3-tier value every board computes, so nothing keyed to it changes.
//
// "Moderate" sits below the model's own cutoff, so it never contradicts the
// backend's Safe/Unsafe call - it subdivides what the backend already called
// Safe. See MODERATE_BAND_RATIO.
export type Verdict = "Good" | "Moderate" | "Poor";

// Where the Moderate band opens, as a fraction of the beach's own cutoff.
//
// 0.75 is measured, not chosen for looks. Across the Boston roster's full
// sampling record, among days the model did NOT flag, the actual lab-exceedance
// rate is flat at 0.2-0.5% all the way up to 75% of the cutoff and then steps up
// 4-6x:
//
//     p / threshold     days   exceedances   rate
//     < 50%             6322            12   0.2%
//     50-60%            1364             7   0.5%
//     60-70%            1075             3   0.3%
//     70-75%            1071             2   0.2%
//     75-80%             447             7   1.6%
//     80-90%             948             8   0.9%
//     95-100%            889            21   2.4%
//
// So below 0.75 the model is not distinguishing anything: those days exceed at
// the same rate as a quiet one. Above it, exceedances become several times more
// likely while still being far short of a flagged day (~1.5% in the band, vs
// 11.8% overall and 31% on flagged days) - which is what "elevated, usually
// still fine" should mean.
//
// The CA tiers imply 0.6 (their 30/50 split). That was carried over here purely
// so a differently-calibrated board kept familiar proportions, and it lands
// inside the flat region - flagging days that exceed at 0.3%, indistinguishable
// from clean. Do not revert it to match CA without re-running the numbers.
export const MODERATE_BAND_RATIO = 0.75;

// EPA single-sample safe-swimming standard for ocean water (MPN/100mL).
// A lab result above this is classified as an exceedance ("actually unsafe").
export const EPA_MPN_THRESHOLD = 104;

// What the dashboard calls each risk band, defined once and referenced by both
// the legend and the per-status lookup below so the two can never drift.
//
// These name the BACTERIA LEVEL, not a swimming recommendation. An earlier set
// ("Normal", "Not recommended") mixed the two: the first three described a
// reading and the fourth gave advice, so the key changed subject halfway down.
// Describing the level throughout leaves the advice to the subtitle, which can
// say it in a full sentence with the EPA threshold attached.
// Three lengths of the same name, because the name has to fit three places: the
// key and the card heading take the full phrase, a day cell takes the bare word,
// and a day cell on a phone is about 44px wide, where "Moderate" would be
// clipped mid-word and read as a rendering bug.
export const TIER_LABEL = {
  low: { full: "Low bacteria levels", short: "Low", abbr: "Low" },
  moderate: { full: "Moderate bacteria levels", short: "Moderate", abbr: "Mod" },
  high: { full: "High bacteria levels", short: "High", abbr: "High" },
  veryHigh: {
    full: "Very high bacteria levels",
    short: "Very high",
    abbr: "V.high",
  },
} as const;

// Risk tiers keyed to exceedance percent — the single source of truth shared by
// the exceedance-scale legend (BeachCard) and the forecast-accuracy detail
// (ForecastAccuracy), so a sample's tier label always matches the legend.
export interface RiskTier {
  label: string; // legend / detail label, e.g. "Slightly elevated"
  range: string; // percent range for the legend, WITHOUT the % sign (e.g. "0–29")
  color: string; // swatch color, keyed to the gradient bar's discrete tiers
  textColor: string; // readable, saturated color for large tier-colored text
  maxExclusive: number; // upper bound (exclusive), in percent
}

export const RISK_TIERS: RiskTier[] = [
  { label: TIER_LABEL.low.full, range: "0–29", color: "#97C459", textColor: "#2D5A0B", maxExclusive: 30 },
  { label: TIER_LABEL.moderate.full, range: "30–49", color: "#D5C82E", textColor: "#6B5F0E", maxExclusive: 50 },
  { label: TIER_LABEL.high.full, range: "50–74", color: "#E24B4A", textColor: "#7A1F1F", maxExclusive: 75 },
  { label: TIER_LABEL.veryHigh.full, range: "75–100", color: "#A32D2D", textColor: "#5A1414", maxExclusive: Infinity },
];

// The risk tier for an exceedance percentage (0–100).
export function riskTier(pct: number): RiskTier {
  return (
    RISK_TIERS.find((t) => pct < t.maxExclusive) ??
    RISK_TIERS[RISK_TIERS.length - 1]
  );
}

// What a reader sees for an internal Status. Drawn from the same TIER_LABEL
// constants the legend uses, so the hero and the key cannot disagree.
//
// Status has three values where the legend shows four: "Not recommended" covers
// everything from 50% up, while the legend splits that at 75%. So a beach above
// 75% reads "High bacteria levels" here and the key lists "Very high" as a
// separate band. That gap predates this rename (Status has always been 3-way
// and the legend 4-way); the new names only make it easier to notice.
export const STATUS_LABEL: Record<Status, string> = {
  Normal: TIER_LABEL.low.full,
  "Slightly elevated": TIER_LABEL.moderate.full,
  "Not recommended": TIER_LABEL.high.full,
};

// The same three bands at day-cell length. A cell is scored on the internal
// 3-tier status rather than the key's four bands, so a 90% day reads "High"
// here while the key still lists "Very high" as its own row.
export const STATUS_BAND: Record<Status, { short: string; abbr: string }> = {
  Normal: TIER_LABEL.low,
  "Slightly elevated": TIER_LABEL.moderate,
  "Not recommended": TIER_LABEL.high,
};

// The fill for a band, keyed by the internal status. Read off RISK_TIERS rather
// than written out again: the legend, the day cells and this are the same three
// colours, and there are already several hand-copied tables of them around the
// components that should fold into this one.
export const STATUS_COLOR: Record<Status, string> = {
  Normal: RISK_TIERS[0].color,
  "Slightly elevated": RISK_TIERS[1].color,
  "Not recommended": RISK_TIERS[2].color,
};

// Text colour for a band word laid across its own tier fill, wherever that
// happens: the card's day cells and the list's reading column. Near-black is
// fine on the green and the yellow and close to unreadable on the red, so the
// red takes white. Lives here rather than in either component because the two
// draw the same word on the same fill and must not drift apart.
export const STATUS_BAND_TEXT: Record<Status, string> = {
  Normal: "#173404",
  "Slightly elevated": "#3f3a05",
  "Not recommended": "#ffffff",
};

/**
 * A published run timestamp as a clock time on the board's own coast, e.g.
 * "4:57 AM". Null for anything unparseable, so a malformed cell drops the line
 * rather than printing "Invalid Date" at a reader.
 */
export function formatRunTime(
  iso: string | null | undefined,
  timeZone: string
): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

// The tier label for an exceedance percentage (0–100).
export function riskTierLabel(pct: number): string {
  return riskTier(pct).label;
}

// How many of the most recent lab samples the forecast-accuracy card scores and
// shows as dots — the last 7. Single source of truth so the score and the dot
// strip (and its screen-reader summary) always describe the same set of samples.
export const ACCURACY_WINDOW = 7;

// Below this many samples we show "not enough data yet" instead of a score that
// would be too small to be meaningful.
export const ACCURACY_MIN_SAMPLES = 5;

// One scored lab sample: the model's call vs. what the lab actually measured.
export interface AccuracySample {
  date: string; // ISO date the lab sample was taken
  predictedExceedance: number; // our exceedance probability that day, as a percent (0-100)
  predictedUnsafe: boolean; // our call: prob >= threshold (stored, not re-derived from the rounded percent)
  labMpn: number; // the lab result, MPN/100mL
  match: boolean; // predicted class === actual class (both safe or both unsafe)
}

export interface Accuracy {
  windowSize: number; // number of samples scored (= samples.length)
  matches: number; // how many of them matched
  samples: AccuracySample[]; // chronological, oldest → newest
  // The same scoring run over EVERY paired lab sample on record for this
  // station, not just the last ACCURACY_WINDOW. The dot strip stays short
  // because a reader can only take in so many dots; the site's headline
  // accuracy percentage is drawn from the full record, where one miss doesn't
  // swing the figure fourteen points.
  totalSamples: number; // every scored sample on record
  totalMatches: number; // how many of those matched
}

// A site's accuracy as a whole percent, or null when there are too few samples
// to report one. Rounded for display only — never re-derive matches from it.
export function accuracyPercent(accuracy: Accuracy): number | null {
  if (accuracy.totalSamples < ACCURACY_MIN_SAMPLES) return null;
  return Math.round((accuracy.totalMatches / accuracy.totalSamples) * 100);
}

// Which way a contributing factor pushed the model's risk estimate. Published
// by backends that ship SHAP directions alongside their top factors.
export type FactorDirection = "increasing risk" | "decreasing risk";

// A ranked driver of one day's prediction: what the model keyed on, and whether
// it pushed risk up or down.
export interface Driver {
  factor: string; // canonical display label (see lib/factors.ts)
  direction: FactorDirection;
}

// The measured environmental conditions behind one day's prediction, in human
// units. Every field is optional: the backend blanks any value whose source
// feed is too stale to describe that day (an NDBC buoy that stopped reporting,
// say), and the dashboard must then say nothing rather than guess. See
// scripts/env_conditions_region.py in project-neptune.
export interface Conditions {
  rainTodayMm?: number; // rain on the day itself
  rainPrior3dMm?: number; // rain over the three days before it
  windKph?: number;
  airTempC?: number;
  solarMj?: number; // shortwave radiation — sunlight, which inactivates bacteria
  waterTempC?: number;
  waveHeightM?: number;
  tideRangeM?: number; // the day's tidal range; bigger range flushes harder
  springTide?: boolean;
  riverFlow?: "low" | "moderate" | "high" | "very high";
  // Distance to the nearest combined sewer overflow outfall. Geometry, not an
  // observation, so it never goes stale — a standing property of the beach.
  csoDistKm?: number;
}

export interface ForecastDay {
  date: string;
  probability: number;
  mpnLabel?: string;
  status: Status;
  // The cutoff this day was classified against. Boston's model re-tunes its
  // threshold per forecast horizon (day 1 and day 3 can differ by 8 points), so
  // a day must be scored against its own value, not the nowcast's. Backends
  // that publish one fixed cutoff leave this equal to BeachData.threshold.
  threshold?: number;
  // The Good/Moderate/Poor call for this day, resolved at load time — the
  // backend's published decision where it ships one, otherwise derived. Only
  // meaningful on boards that render it (see the `binaryVerdict` flag).
  verdict?: Verdict | null;
  // Per-day snapshot fields — populated for past days (from the history archive)
  // and for today (from the live nowcast); omitted for forecast/future days.
  factors?: string[];
  insight?: string;
  lastResult?: number | string | null;
  daysSinceSample?: number | null;
  // Ranked drivers with the direction each pushed risk, and the conditions
  // themselves. Unlike `factors` these are populated for FUTURE days too — a
  // forecast has no lab sample but it does have forecast weather, and that is
  // exactly what the written summary explains the day in terms of.
  drivers?: Driver[];
  conditions?: Conditions;
  /**
   * This day exists but its values were withheld from the payload for an
   * unentitled reader (see lib/paywall.ts). Distinct from a day that is simply
   * absent: a beach the backend never published a Thursday for must not be
   * dressed up as something you could buy.
   */
  locked?: boolean;
}

export interface BeachData {
  code: string;
  name: string;
  /**
   * The name the written summary says out loud. Usually identical to `name`;
   * it differs only on a board whose roster appends a disambiguator meant for
   * tab labels rather than for sentences (see resolveRoster).
   */
  proseName: string;
  latitude: number;
  longitude: number;
  predictionDate: string;
  probability: number;
  mpnLabel?: string;
  lastResult: number | string | null;
  daysSinceSample: number | null;
  factors: string[];
  insight: string;
  // Today's ranked drivers and measured conditions — see ForecastDay.
  drivers: Driver[];
  conditions: Conditions;
  status: Status;
  threshold: number;
  // Today's Good/Moderate/Poor call — see ForecastDay.verdict.
  verdict: Verdict | null;
  // The model had no recent lab sample to anchor this beach's prediction, so it
  // leans entirely on environmental signal. Surfaced as a caveat in the summary.
  noRecentSample: boolean;
  // Long-run descriptive stats from the backend's roster file: what share of
  // every lab sample ever taken here exceeded the EPA limit, and how many
  // samples that is. null for locations without a roster file.
  excRatePct: number | null;
  nSamples: number | null;
  pastDays: ForecastDay[];
  forecast: ForecastDay[];
  accuracy: Accuracy;
  /**
   * The paid half of this beach was withheld before the page was serialised.
   * The card reads this to draw the locked state; it is not a styling hint, it
   * is a statement that the data is genuinely not here.
   */
  locked?: boolean;
  /**
   * "What we're seeing", rendered server-side because the client can no longer
   * build it: the drivers it is written from are exactly what a locked beach
   * withholds. Only set on a locked beach — everywhere else BeachCard builds
   * the summary itself, per selected day, exactly as before.
   */
  summary?: string[];
}

// The List tab's row order. Beaches named in `topCodes` lead, in that order;
// every other beach follows in the order it arrived, which is the board's
// north-to-south coastline order (loadDashboardData sorts by latitude). Boards
// that name no pinned stations keep that order untouched.
export function orderForList<T extends { code: string }>(
  beaches: T[],
  topCodes: string[] | undefined
): T[] {
  if (!topCodes?.length) return beaches;
  const pinned = topCodes
    .map((code) => beaches.find((b) => b.code === code))
    // A pinned code that is not on the board - a station hidden from
    // `stations`, or one the backend stopped publishing - is simply skipped,
    // rather than leaving a hole at the top of the list.
    .filter((b): b is T => b != null);
  const pinnedCodes = new Set(pinned.map((b) => b.code));
  return [...pinned, ...beaches.filter((b) => !pinnedCodes.has(b.code))];
}

export interface DashboardData {
  beaches: BeachData[];
  predictionDate: string;
  /**
   * When the model run behind these figures finished, as published by the
   * backend (ISO-8601, UTC). Null on a board whose pipeline does not publish it
   * yet, which the card renders as no run time rather than a guessed one.
   */
  generatedAt: string | null;
}

export function thresholdFor(
  code: string,
  thresholdMap: Record<string, number>
): number {
  if (thresholdMap[code] != null) return thresholdMap[code];
  if (thresholdMap["DEFAULT"] != null) return thresholdMap["DEFAULT"];
  return 0.5;
}

export function statusFromProb(
  prob: number | null | undefined,
  code: string,
  thresholdMap: Record<string, number>
): Status | null {
  if (prob == null || Number.isNaN(prob)) return null;
  // Classify on the same rounded percent the dashboard displays, so the banner
  // can never disagree with the number shown. Comparing the raw fraction here
  // let a value like 0.497 round up to "50" on screen while still falling under
  // the 0.5 cutoff and reading "Slightly elevated".
  const pct = Math.round(prob * 100);
  if (pct >= 50) return "Not recommended";
  if (pct >= 30) return "Slightly elevated";
  return "Normal";
}

// Status for locations whose backend publishes its own Safe/Unsafe call against
// a per-station threshold (LocationConfig.statusFromThreshold). "Not
// recommended" starts exactly at that threshold, so the banner can never
// disagree with the backend's own verdict for the same beach.
//
// Comparison happens on the rounded percent both sides display, matching
// statusFromProb — see the note there on why the raw fraction is the wrong
// thing to compare.
export function statusFromThreshold(
  prob: number | null | undefined,
  threshold: number
): Status | null {
  if (prob == null || Number.isNaN(prob)) return null;
  const pct = Math.round(prob * 100);
  const unsafePct = Math.round(threshold * 100);
  if (pct >= unsafePct) return "Not recommended";
  // Same band as the Moderate verdict, deliberately: this function and
  // verdictFor classify the same beach off the same threshold, and the only
  // board using it is the same one showing Moderate. Two different ratios would
  // let a beach read "Slightly elevated" internally while showing Good.
  if (pct >= Math.round(unsafePct * MODERATE_BAND_RATIO)) {
    return "Slightly elevated";
  }
  return "Normal";
}

// Fallback call, derived from a probability and its cutoff. Only used
// when the backend does not publish its own decision for the row — prefer
// verdictFromPrediction, which cannot drift from the model.
//
// Comparison is on the rounded percent, matching statusFromProb /
// statusFromThreshold, so the call agrees with any number shown alongside it.
export function verdictFor(
  prob: number | null | undefined,
  threshold: number
): Verdict | null {
  if (prob == null || Number.isNaN(prob)) return null;
  const pct = Math.round(prob * 100);
  const cutoff = Math.round(threshold * 100);
  if (pct >= cutoff) return "Poor";
  return pct >= Math.round(cutoff * MODERATE_BAND_RATIO) ? "Moderate" : "Good";
}

/**
 * Subdivide a Safe call into Good or Moderate.
 *
 * Kept separate from verdictFor because the backend's own Safe/Unsafe decision
 * is authoritative for the Poor boundary and must not be recomputed: the model
 * compares raw fractions where everything here is rounded to whole percent, so
 * 13.8% against a 14% cutoff is Safe to the model but reads as "14 >= 14" to us.
 * Inside that half-point band the model wins.
 *
 * So Moderate is purely additive detail BELOW the cutoff. A day the backend
 * called Unsafe can never come out as Moderate, and a day it called Safe can
 * never come out as Poor.
 */
export function refineSafeVerdict(
  verdict: Verdict | null,
  prob: number | null | undefined,
  threshold: number
): Verdict | null {
  if (verdict !== "Good") return verdict;
  if (prob == null || Number.isNaN(prob)) return verdict;
  const pct = Math.round(prob * 100);
  const cutoff = Math.round(threshold * 100);
  return pct >= Math.round(cutoff * MODERATE_BAND_RATIO) ? "Moderate" : "Good";
}

// The model's own Safe/Unsafe decision for a row, as published in the
// `prediction` / `day{i}_prediction` columns.
//
// This is authoritative and beats recomputing from the probability. The two can
// legitimately differ: the model compares raw fractions, while everything the
// dashboard displays is rounded to whole percent, so a 13.8% probability
// against a 14% cutoff is Safe to the model but rounds to "14 >= 14" here.
// Inside that half-point band the model's call wins.
export function verdictFromPrediction(raw: unknown): Verdict | null {
  const text = String(raw ?? "").trim().toLowerCase();
  if (text === "unsafe") return "Poor";
  if (text === "safe") return "Good";
  return null;
}

// Good/Poor reuses the Normal / Not-recommended palette rather than
// introducing a second green and a second red. Callers style a verdict by
// mapping it through this.
export const VERDICT_AS_STATUS: Record<Verdict, Status> = {
  Good: "Normal",
  Moderate: "Slightly elevated",
  Poor: "Not recommended",
};

// A raw (prediction, lab result) pair for one sampled day. `excProbability` is a
// fraction (0-1), matching nowcast_latest.csv's convention.
export interface RawAccuracySample {
  date: string;
  excProbability: number;
  labMpn: number;
}

// Score the model's classification against the lab for the most recent samples.
// A sample MATCHES when our predicted class equals the actual class:
//   predicted unsafe := round(excProbability*100) >= round(threshold*100)  (the
//                       same rounded-percent boundary statusFromProb uses, so
//                       the score never disagrees with the number on screen)
//   actually unsafe  := labMpn > EPA_MPN_THRESHOLD
// We compare classes, never the probability against the raw MPN directly.
export function computeAccuracy(
  rawSamples: RawAccuracySample[],
  threshold: number,
  windowN: number = ACCURACY_WINDOW
): Accuracy {
  // Classify on the same rounded percent the dashboard displays (see
  // statusFromProb), never the raw fraction. Otherwise a probability like 0.497
  // shows on screen as "50% — Not recommended" but scores as "predicted safe",
  // so a genuine miss reads as "Matched".
  const thresholdPct = Math.round(threshold * 100);
  // Score every sample on record, then take the last N for the dot strip — one
  // scoring rule, so the site's percentage and its recent dots can never
  // disagree about whether a given day matched.
  const scored: AccuracySample[] = rawSamples.map((s) => {
    const predictedExceedance = Math.round(s.excProbability * 100);
    const predictedUnsafe = predictedExceedance >= thresholdPct;
    const actualUnsafe = s.labMpn > EPA_MPN_THRESHOLD;
    return {
      date: s.date,
      predictedExceedance,
      predictedUnsafe,
      labMpn: s.labMpn,
      match: predictedUnsafe === actualUnsafe,
    };
  });
  // rawSamples arrive chronological (oldest → newest); the strip shows the last N.
  const samples = scored.slice(-windowN);
  const matches = samples.filter((s) => s.match).length;
  return {
    windowSize: samples.length,
    matches,
    samples,
    totalSamples: scored.length,
    totalMatches: scored.filter((s) => s.match).length,
  };
}

export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMonthDayYear(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatWeekdayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date
    .toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" })
    .toUpperCase();
}

export function formatMonthDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

export function subtractDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
