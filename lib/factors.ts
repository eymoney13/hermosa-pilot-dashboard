// Maps contributing-factor values to a small set of clean display buckets.
//
// Input can be either a human label from project-neptune's factor_labels.py
// (e.g. "Water temperature (3 days ago)") or — for older archived nowcast
// snapshots that predate a label — a raw feature name (e.g. "tide_range",
// "wtemp3"). Both are normalized here so the card never shows three
// near-identical entries or a raw snake_case name. This is the single source of
// truth for what a factor is *called on the dashboard*.

// Raw lag-feature prefixes (e.g. "wtemp3", "rad1", "lograin5") → bucket.
const RAW_LAG_BUCKET: Record<string, string> = {
  wtemp: "Water temperature",
  temp: "Air temperature",
  rad: "Solar radiation",
  WVHT: "Wave height",
  DPD: "Wave period",
  APD: "Wave period",
  owave: "Onshore wave energy",
  awave: "Alongshore wave energy",
  owind: "Onshore wind",
  awind: "Alongshore wind",
  windspeed: "Wind speed",
  logflow: "River discharge",
  lograin: "Recent rainfall",
};

// Remove a trailing temporal qualifier from a human label: " today",
// " yesterday", " N days ago", with or without surrounding parentheses.
function stripLag(label: string): string {
  return label
    .replace(/\s*\(?\s*(?:\d+\s+days?\s+ago|yesterday)\s*\)?$/i, "")
    .replace(/\s+today$/i, "")
    .trim();
}

// Both raw feature names and human (lag-stripped) labels → display bucket.
const CANONICAL: Record<string, string> = {
  // Rainfall — one bucket
  precip: "Recent rainfall",
  wet: "Recent rainfall",
  rain_tide: "Recent rainfall",
  lograin1: "Recent rainfall",
  Rainfall: "Recent rainfall",
  "Rainfall today": "Recent rainfall",
  "Yesterday rainfall": "Recent rainfall",
  "Rain and high tide combination": "Recent rainfall",
  "Recent wet weather": "Recent rainfall",

  // Tides
  tide_range: "Tidal range",
  tide_range1: "Tidal range",
  "Tidal range": "Tidal range",
  tide_max: "High tide level",
  tide_max1: "High tide level",
  "High tide level": "High tide level",
  tide_min: "Low tide level",
  tide_min1: "Low tide level",
  "Low tide level": "Low tide level",
  tide_sample: "Tide level at sample time",
  "Tide level at sample time": "Tide level at sample time",
  hours_since_high: "Hours since high tide",
  "Hours since high tide": "Hours since high tide",
  tide_spring: "Spring tide conditions",
  "Spring tide conditions": "Spring tide conditions",

  // Waves
  WVHT_mean: "Wave height",
  WVHT_q75: "Wave height",
  "Wave height": "Wave height",
  "Higher waves": "Wave height",
  DPD_mean: "Wave period",
  DPD_q75: "Wave period",
  APD_mean: "Wave period",
  "Wave period": "Wave period",
  "Average wave period": "Wave period",
  "Longer wave periods": "Wave period",
  MWD_mean: "Mean wave direction",
  "Mean wave direction": "Mean wave direction",
  owave: "Onshore wave energy",
  "Onshore wave energy": "Onshore wave energy",
  awave: "Alongshore wave energy",
  "Alongshore wave energy": "Alongshore wave energy",

  // Wind
  windspeed_max: "Wind speed",
  windgust_max: "Wind speed",
  "Wind speed": "Wind speed",
  "Wind gusts": "Wind speed",
  winddir: "Wind direction",
  "Wind direction": "Wind direction",
  owind: "Onshore wind",
  owind_bin: "Onshore wind",
  "Onshore wind": "Onshore wind",
  awind: "Alongshore wind",
  "Alongshore wind": "Alongshore wind",

  // Sun & temperature
  solar_rad: "Solar radiation",
  "Solar radiation": "Solar radiation",
  temp_mean: "Air temperature",
  temp_max: "Air temperature",
  temp_min: "Air temperature",
  "Air temperature": "Air temperature",
  "Daytime high temperature": "Air temperature",
  "Overnight low temperature": "Air temperature",
  wtemp_mean: "Water temperature",
  "Water temperature": "Water temperature",

  // River flow
  logflow: "River discharge",
  discharge: "River discharge",
  "River discharge": "River discharge",
  flow1_q75: "High river flow",
  flow1_q90: "High river flow",
  "High river flow": "High river flow",
  "Very high river flow": "High river flow",
  flow1_q50: "Moderate river flow",
  "Moderate river flow": "Moderate river flow",

  // Calendar / location
  doy_sin: "Seasonal pattern",
  doy_cos: "Seasonal pattern",
  month: "Seasonal pattern",
  "Seasonal pattern": "Seasonal pattern",
  "Time of year": "Seasonal pattern",
  days_since_full_moon: "Lunar cycle",
  "Lunar cycle": "Lunar cycle",
  beach_angle: "Beach orientation",
  "Beach orientation": "Beach orientation",
  weekend: "Weekend",
  Weekend: "Weekend",

  // Bacteria / sampling — collapsed (excluded from display, see below)
  logFIB1: "Prior bacteria level",
  logFIB2: "Prior bacteria level",
  exc_rolling3: "Prior bacteria level",
  "Recent bacteria level": "Prior bacteria level",
  "Prior bacteria level": "Prior bacteria level",
  "Recent exceedance history": "Prior bacteria level",
  exc_last: "Last sample was unsafe",
  "Last sample was unsafe": "Last sample was unsafe",
  days_since_last: "Days since last sample",
  "Days since last sample": "Days since last sample",
};

export function factorLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Raw lag feature name with no underscore (wtemp3, rad1, lograin30T, DPD2).
  const lag = trimmed.match(/^([A-Za-z]+?)\d+T?$/);
  if (lag && RAW_LAG_BUCKET[lag[1]]) return RAW_LAG_BUCKET[lag[1]];

  // Direct hit on a raw name or human label (before stripping).
  if (CANONICAL[trimmed]) return CANONICAL[trimmed];

  // Human label with a temporal suffix, or a cumulative-rainfall variant.
  const base = stripLag(trimmed);
  if (/cumulative rainfall/i.test(base)) return "Recent rainfall";
  return CANONICAL[base] ?? base;
}

// Bacteria-history and sampling factors — these are NOT environmental drivers.
// The most recent lab result is surfaced separately on the card, so contributing
// factors should reflect only the environmental conditions driving the
// exceedance probability. The upstream model already excludes these before
// ranking; this is a defensive net for stale/cached CSVs. Values here are the
// canonical (post-factorLabel) forms.
const NON_ENVIRONMENTAL_FACTORS = new Set<string>([
  "Prior bacteria level",
  "Last sample was unsafe",
  "Days since last sample",
]);

export function isEnvironmentalFactor(label: string | null | undefined): boolean {
  if (label == null) return false;
  return !NON_ENVIRONMENTAL_FACTORS.has(String(label).trim());
}
