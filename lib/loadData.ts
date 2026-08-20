import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import {
  computeAccuracy,
  statusFromProb,
  statusFromThreshold,
  thresholdFor,
  verdictFor,
  verdictFromPrediction,
  type BeachData,
  type Conditions,
  type DashboardData,
  type Driver,
  type FactorDirection,
  type ForecastDay,
  type LocationConfig,
  type RawAccuracySample,
  type Status,
  type Verdict,
} from "./data";
import { factorLabel, isEnvironmentalFactor } from "./factors";
import { normalizeInsight } from "./insight";

interface NowcastRow {
  StationCode: string;
  // Present on the CA boards, which carry coordinates in the nowcast itself.
  // Locations with a roster file (LocationConfig.rosterFile) omit these and
  // supply coordinates there instead.
  Latitude?: number;
  Longitude?: number;
  // Some backends publish the threshold they classified against on each row.
  // When present it wins over thresholds.csv, so the dashboard's call and the
  // backend's own `prediction` column can never be computed from different
  // numbers.
  threshold?: number;
  prediction_date: string;
  exc_probability: number;
  mpn_label?: string;
  last_result?: number | string | null;
  days_since_sample?: number | null;
  top_factor_1?: string | null;
  top_factor_2?: string | null;
  top_factor_3?: string | null;
  insight?: string;
  // The model's own Safe/Unsafe decision for this row.
  prediction?: unknown;
  // Boston publishes this: the model had no recent lab sample for the station,
  // so the prediction rests on environmental signal alone. Parsed loosely
  // because CSV booleans arrive as "True"/"true"/true depending on the writer.
  no_recent_sample?: unknown;
  [key: string]: unknown;
}

// One row of accuracy.csv: a lab sample (date with a measured Actual_MPN) and
// the model's exceedance probability for that date (stored as a fraction).
interface AccuracyRow {
  StationCode: string;
  date: string;
  exc_probability: number;
  actual_mpn: number;
}

interface ForecastRow {
  StationCode: string;
  day1_date: string;
  day1_probability: number;
  day1_mpn_label?: string;
  day2_date: string;
  day2_probability: number;
  day2_mpn_label?: string;
  day3_date: string;
  day3_probability: number;
  day3_mpn_label?: string;
  // history_3day.csv is a superset of forecast_3day.csv: each day also carries
  // day{i}_top_factor_1..3, day{i}_last_result, day{i}_days_since_sample, and
  // day{i}_insight. Boston's forecast instead carries day{i}_threshold. All are
  // read via computed keys through the index signature.
  [key: string]: unknown;
}

async function readCsv<T>(slug: string, relPath: string): Promise<T[]> {
  const filePath = path.join(process.cwd(), "public", "data", slug, relPath);
  const text = await readFile(filePath, "utf8");
  const parsed = Papa.parse<T>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  return parsed.data.filter(
    (row): row is T => row !== null && typeof row === "object"
  );
}

// Like readCsv but resolves to [] if the file is missing — used for optional inputs.
async function readCsvOptional<T>(slug: string, relPath: string): Promise<T[]> {
  try {
    return await readCsv<T>(slug, relPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw err;
  }
}

// Like readCsvOptional but for JSON — resolves to null if the file is missing.
async function readJsonOptional<T>(
  slug: string,
  relPath: string
): Promise<T | null> {
  const filePath = path.join(process.cwd(), "public", "data", slug, relPath);
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
}

// One beach in a backend-published roster (see LocationConfig.rosterFile). Only
// the fields the dashboard renders are typed here.
interface RosterBeach {
  name: string;
  town?: string;
  // The station whose nowcast row represents this beach. A beach may map to
  // several stations (`stations`), but exactly one drives the display.
  primary_station: string;
  stations?: string[];
  lat: number;
  lon: number;
  // Long-run descriptive stats over this beach's whole sampling record.
  exc_rate_pct?: number;
  n_samples?: number;
}

interface RosterFile {
  region?: string;
  display_name?: string;
  beaches?: RosterBeach[];
}

// A beach to render, resolved from either the static config or a roster file.
// Coordinates are optional: the CA boards leave them undefined and fall back to
// the nowcast's own Latitude/Longitude columns.
interface RosterEntry {
  code: string;
  name: string;
  latitude?: number;
  longitude?: number;
  excRatePct?: number;
  nSamples?: number;
}

// Resolve which beaches to render. Locations with a rosterFile take their list
// from whatever the backend last published; everything else uses the static
// stations/beachNames in LOCATIONS. A configured-but-missing roster file yields
// an empty list, which the page renders as a "no data yet" state.
async function resolveRoster(config: LocationConfig): Promise<RosterEntry[]> {
  if (config.rosterFile) {
    const roster = await readJsonOptional<RosterFile>(
      config.slug,
      config.rosterFile
    );
    return (roster?.beaches ?? [])
      .filter((b) => b?.primary_station)
      .map((b) => ({
        code: String(b.primary_station),
        // Town disambiguates the several "Town Beach"-style names in the roster.
        name: b.town ? `${b.name} — ${b.town}` : b.name,
        latitude: Number(b.lat),
        longitude: Number(b.lon),
        excRatePct: numOrUndefined(b.exc_rate_pct),
        nSamples: numOrUndefined(b.n_samples),
      }));
  }
  return config.stations.map((code) => ({
    code,
    name: config.beachNames[code] ?? code,
  }));
}

async function loadThresholds(slug: string): Promise<Record<string, number>> {
  const rows = await readCsvOptional<{
    StationCode: string;
    threshold: number;
  }>(slug, "thresholds.csv");
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (r.StationCode != null && r.threshold != null) {
      map[String(r.StationCode)] = Number(r.threshold);
    }
  }
  return map;
}

// Pair each top factor with the direction the model's SHAP value gave it, so a
// summary can say a driver pushed risk up rather than only that it mattered.
// Backends that publish factors without directions (the CA boards) yield [] —
// callers fall back to the plain `factors` list.
function buildDrivers(raws: unknown[], directions: unknown[]): Driver[] {
  const drivers: Driver[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raws.length; i++) {
    const text = String(raws[i] ?? "").trim();
    if (!text) continue;
    const canonical = factorLabel(text);
    if (canonical == null || seen.has(canonical)) continue;
    if (!isEnvironmentalFactor(canonical)) continue;
    const dir = String(directions[i] ?? "").trim().toLowerCase();
    if (dir !== "increasing risk" && dir !== "decreasing risk") continue;
    seen.add(canonical);
    drivers.push({ factor: canonical, direction: dir as FactorDirection });
  }
  return drivers;
}

// A finite number from a CSV cell, or undefined. Blank cells are the backend
// saying "this feed is too stale to describe that day" (see
// env_conditions_region.py) — NOT zero, which is why every Conditions field is
// optional rather than defaulted.
function condNum(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

const RIVER_FLOW_STATES = ["low", "moderate", "high", "very high"] as const;

// Read one day's environmental snapshot. `prefix` is "" for the nowcast's own
// columns and "day1_"/"day2_"/"day3_" for the forecast's per-horizon copies.
function buildConditions(row: Record<string, unknown>, prefix = ""): Conditions {
  const at = (name: string) => row[`${prefix}${name}`];
  const flowRaw = String(at("river_flow") ?? "").trim().toLowerCase();
  const spring = condNum(at("spring_tide"));
  return {
    rainTodayMm: condNum(at("rain_today_mm")),
    rainPrior3dMm: condNum(at("rain_prior3d_mm")),
    windKph: condNum(at("wind_kph")),
    airTempC: condNum(at("air_temp_c")),
    solarMj: condNum(at("solar_mj")),
    waterTempC: condNum(at("water_temp_c")),
    waveHeightM: condNum(at("wave_height_m")),
    tideRangeM: condNum(at("tide_range_m")),
    springTide: spring == null ? undefined : spring === 1,
    riverFlow: (RIVER_FLOW_STATES as readonly string[]).includes(flowRaw)
      ? (flowRaw as Conditions["riverFlow"])
      : undefined,
    csoDistKm: condNum(at("cso_dist_km")),
  };
}

// How many ranked drivers the backend publishes per day (env_conditions_region
// .TOP_N). Reading all of them gives the written summary real choice: the
// strongest features cluster into families, so a shallower list collapses to
// two or three distinct subjects.
const PUBLISHED_FACTORS = 15;

// How many to show in the card's visible "Top contributing factors" list. That
// list is a glance, not an inventory — the summary is where the depth goes, so
// reading more factors must not silently turn a 3-item list into a 15-item one.
const DISPLAYED_FACTORS = 3;

// Build the filtered, de-duplicated list of environmental top factors for the
// card's visible list. Shared by the live nowcast and each past-day snapshot.
function buildFactors(raws: unknown[], limit = DISPLAYED_FACTORS): string[] {
  const factors: string[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    const canonical = factorLabel(text);
    // Skip empties, duplicates, and non-environmental factors (bacteria
    // history / sampling metadata) — the latest lab result is shown separately.
    if (canonical == null || seen.has(canonical)) continue;
    if (!isEnvironmentalFactor(canonical)) continue;
    seen.add(canonical);
    factors.push(canonical);
    if (factors.length === limit) break;
  }
  return factors;
}

// A finite number, or undefined for missing/unparseable roster stats.
function numOrUndefined(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// CSV booleans arrive as a real boolean (dynamicTyping) or as the strings
// Python's csv writer emits ("True"/"False"). Treat anything else as false.
function parseBool(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  return String(raw ?? "").trim().toLowerCase() === "true";
}

// The binary call for a row: the backend's own decision when it publishes one,
// otherwise derived from the probability. See verdictFromPrediction for why the
// published value has to win where both exist.
function resolveVerdict(
  published: unknown,
  prob: number,
  cutoff: number
): Verdict | null {
  return verdictFromPrediction(published) ?? verdictFor(prob, cutoff);
}

// 1..PUBLISHED_FACTORS, for building the column names. Backends that publish
// fewer simply yield undefined cells, which the builders skip.
const factorSlots = Array.from({ length: PUBLISHED_FACTORS }, (_, i) => i + 1);

// The raw factor / direction cells for one horizon of a wide day1/2/3 row.
function dayFactors(row: ForecastRow, i: number): unknown[] {
  return factorSlots.map((n) => row[`day${i}_top_factor_${n}`]);
}

function dayDirections(row: ForecastRow, i: number): unknown[] {
  return factorSlots.map((n) => row[`day${i}_shap_direction_${n}`]);
}

// The cutoff a forecast/history day was classified against. Backends that
// re-tune per horizon publish day{i}_threshold; everyone else falls back to the
// beach's single nowcast threshold.
function dayThreshold(row: ForecastRow, i: number, fallback: number): number {
  const raw = row[`day${i}_threshold`];
  const n = Number(raw);
  return raw != null && Number.isFinite(n) ? n : fallback;
}

// Normalize a raw days_since_sample cell to a number or null.
function parseDaysSince(raw: unknown): number | null {
  return raw == null || Number.isNaN(Number(raw)) ? null : Number(raw);
}

// Normalize a raw last_result cell to a value or null.
function parseLastResult(raw: unknown): number | string | null {
  return raw == null || (typeof raw === "number" && Number.isNaN(raw))
    ? null
    : (raw as number | string);
}

export async function loadDashboardData(
  config: LocationConfig
): Promise<DashboardData> {
  // Every input is optional. A location whose backend hasn't published yet (or
  // that never ships a given file — not every model produces a 3-day forecast)
  // loads as an empty dashboard rather than throwing ENOENT and 500-ing the page.
  const [
    roster,
    nowcastRows,
    forecastRows,
    historyRows,
    accuracyRows,
    thresholdMap,
  ] = await Promise.all([
    resolveRoster(config),
    readCsvOptional<NowcastRow>(config.slug, "nowcast_latest.csv"),
    readCsvOptional<ForecastRow>(config.slug, "forecast_3day.csv"),
    readCsvOptional<ForecastRow>(config.slug, "history_3day.csv"),
    readCsvOptional<AccuracyRow>(config.slug, "accuracy.csv"),
    loadThresholds(config.slug),
  ]);

  // Group the lab samples by station, chronological (oldest → newest), so each
  // beach scores its own forecast-vs-lab accuracy from its own history.
  const accuracyByCode = new Map<string, RawAccuracySample[]>();
  for (const row of accuracyRows) {
    if (!row?.StationCode || !row?.date) continue;
    const excProbability = Number(row.exc_probability);
    const labMpn = Number(row.actual_mpn);
    if (Number.isNaN(excProbability) || Number.isNaN(labMpn)) continue;
    const code = String(row.StationCode);
    const list = accuracyByCode.get(code) ?? [];
    list.push({ date: String(row.date), excProbability, labMpn });
    accuracyByCode.set(code, list);
  }
  for (const list of accuracyByCode.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const nowcastByCode = new Map<string, NowcastRow>();
  for (const row of nowcastRows) {
    if (row?.StationCode) nowcastByCode.set(String(row.StationCode), row);
  }
  const forecastByCode = new Map<string, ForecastRow>();
  for (const row of forecastRows) {
    if (row?.StationCode) forecastByCode.set(String(row.StationCode), row);
  }
  const historyByCode = new Map<string, ForecastRow>();
  for (const row of historyRows) {
    if (row?.StationCode) historyByCode.set(String(row.StationCode), row);
  }

  const beaches: BeachData[] = [];
  for (const entry of roster) {
    const code = entry.code;
    const now = nowcastByCode.get(code);
    if (!now) continue;

    // Prefer the threshold the backend classified this row against; fall back to
    // thresholds.csv (a DEFAULT row plus per-beach overrides).
    const rowThreshold = Number(now.threshold);
    const threshold =
      now.threshold != null && !Number.isNaN(rowThreshold)
        ? rowThreshold
        : thresholdFor(code, thresholdMap);

    // Locations that opt in classify against their own threshold, so the banner
    // agrees with the backend's own Safe/Unsafe call. Everything else keeps the
    // shared fixed tiers the CA boards are calibrated to.
    //
    // The cutoff is a parameter rather than a closed-over constant because a
    // backend may re-tune it per forecast horizon (see dayThreshold): scoring
    // day 3 against the nowcast's cutoff would disagree with the model's own
    // call for that day.
    const classify = (p: number, cutoff: number = threshold): Status | null =>
      config.statusFromThreshold
        ? statusFromThreshold(p, cutoff)
        : statusFromProb(p, code, thresholdMap);

    const prob = Number(now.exc_probability);
    const status = classify(prob);
    if (!status) continue;

    const rawFactors = factorSlots.map((n) => now[`top_factor_${n}`]);
    const factors = buildFactors(rawFactors);
    const drivers = buildDrivers(
      rawFactors,
      factorSlots.map((n) => now[`shap_direction_${n}`])
    );
    const conditions = buildConditions(now);

    const days = parseDaysSince(now.days_since_sample);

    const fcRow = forecastByCode.get(code);
    const forecast: ForecastDay[] = [];
    if (fcRow) {
      for (const i of [1, 2, 3] as const) {
        const date = fcRow[`day${i}_date`] as string | undefined;
        const probRaw = fcRow[`day${i}_probability`];
        const mpn = fcRow[`day${i}_mpn_label`] as string | undefined;
        if (!date || probRaw == null) continue;
        const p = Number(probRaw);
        const cutoff = dayThreshold(fcRow, i, threshold);
        const dayStatus = classify(p, cutoff);
        if (!dayStatus) continue;
        // Forecast days carry top contributing factors (why the model predicts
        // this), but no lab sample — there is no future water-quality test.
        forecast.push({
          date: String(date),
          probability: p,
          mpnLabel: mpn,
          status: dayStatus,
          threshold: cutoff,
          verdict: resolveVerdict(fcRow[`day${i}_prediction`], p, cutoff),
          factors: buildFactors(dayFactors(fcRow, i)),
          drivers: buildDrivers(dayFactors(fcRow, i), dayDirections(fcRow, i)),
          conditions: buildConditions(fcRow, `day${i}_`),
        });
      }
    }

    // history_3day.csv shape mirrors forecast_3day.csv, where day1 = most recent past day.
    // We re-sort ascending so the array reads past → present left-to-right.
    const histRow = historyByCode.get(code);
    const pastDays: ForecastDay[] = [];
    if (histRow) {
      for (const i of [1, 2, 3] as const) {
        const date = histRow[`day${i}_date`] as string | undefined;
        const probRaw = histRow[`day${i}_probability`];
        const mpn = histRow[`day${i}_mpn_label`] as string | undefined;
        if (!date || probRaw == null) continue;
        const p = Number(probRaw);
        const cutoff = dayThreshold(histRow, i, threshold);
        const dayStatus = classify(p, cutoff);
        if (!dayStatus) continue;
        // Replay that day's saved nowcast: same factors + the lab result that
        // was latest as of that date (no future sample leaks backward).
        pastDays.push({
          date: String(date),
          probability: p,
          mpnLabel: mpn,
          status: dayStatus,
          threshold: cutoff,
          verdict: resolveVerdict(histRow[`day${i}_prediction`], p, cutoff),
          factors: buildFactors(dayFactors(histRow, i)),
          drivers: buildDrivers(dayFactors(histRow, i), dayDirections(histRow, i)),
          conditions: buildConditions(histRow, `day${i}_`),
          insight: normalizeInsight(
            String(histRow[`day${i}_insight`] ?? ""),
            dayStatus
          ),
          lastResult: parseLastResult(histRow[`day${i}_last_result`]),
          daysSinceSample: parseDaysSince(histRow[`day${i}_days_since_sample`]),
        });
      }
      pastDays.sort((a, b) => a.date.localeCompare(b.date));
    }

    beaches.push({
      code,
      name: entry.name,
      // Roster coordinates win when present; the CA boards carry theirs in the
      // nowcast itself.
      latitude: entry.latitude ?? Number(now.Latitude),
      longitude: entry.longitude ?? Number(now.Longitude),
      predictionDate: String(now.prediction_date),
      probability: prob,
      mpnLabel: now.mpn_label,
      lastResult: parseLastResult(now.last_result),
      daysSinceSample: days,
      factors,
      drivers,
      conditions,
      insight: normalizeInsight(String(now.insight ?? ""), status),
      status,
      threshold,
      verdict: resolveVerdict(now.prediction, prob, threshold),
      noRecentSample: parseBool(now.no_recent_sample),
      excRatePct: entry.excRatePct ?? null,
      nSamples: entry.nSamples ?? null,
      pastDays,
      forecast,
      accuracy: computeAccuracy(accuracyByCode.get(code) ?? [], threshold),
    });
  }

  beaches.sort((a, b) => b.latitude - a.latitude);

  const predictionDate = beaches[0]?.predictionDate ?? "";

  return { beaches, predictionDate };
}
