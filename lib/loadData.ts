import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import {
  statusFromProb,
  thresholdFor,
  type BeachData,
  type DashboardData,
  type ForecastDay,
  type LocationConfig,
} from "./data";
import { factorLabel, isEnvironmentalFactor } from "./factors";
import { normalizeInsight } from "./insight";

interface NowcastRow {
  StationCode: string;
  Latitude: number;
  Longitude: number;
  prediction_date: string;
  exc_probability: number;
  mpn_label?: string;
  last_result?: number | string | null;
  days_since_sample?: number | null;
  top_factor_1?: string | null;
  top_factor_2?: string | null;
  top_factor_3?: string | null;
  insight?: string;
  [key: string]: unknown;
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
  // day{i}_insight. Those are read via computed keys through the index signature.
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

async function loadThresholds(slug: string): Promise<Record<string, number>> {
  const rows = await readCsv<{ StationCode: string; threshold: number }>(
    slug,
    "thresholds.csv"
  );
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (r.StationCode != null && r.threshold != null) {
      map[String(r.StationCode)] = Number(r.threshold);
    }
  }
  return map;
}

// Build the filtered, de-duplicated list of environmental top factors from up to
// three raw factor cells. Shared by the live nowcast and each past-day snapshot.
function buildFactors(raws: unknown[]): string[] {
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
  }
  return factors;
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
  const [nowcastRows, forecastRows, historyRows, thresholdMap] =
    await Promise.all([
      readCsv<NowcastRow>(config.slug, "nowcast_latest.csv"),
      readCsv<ForecastRow>(config.slug, "forecast_3day.csv"),
      readCsvOptional<ForecastRow>(config.slug, "history_3day.csv"),
      loadThresholds(config.slug),
    ]);

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
  for (const code of config.stations) {
    const now = nowcastByCode.get(code);
    if (!now) continue;
    const prob = Number(now.exc_probability);
    const status = statusFromProb(prob, code, thresholdMap);
    if (!status) continue;

    const factors = buildFactors([
      now.top_factor_1,
      now.top_factor_2,
      now.top_factor_3,
    ]);

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
        const dayStatus = statusFromProb(p, code, thresholdMap);
        if (!dayStatus) continue;
        // Forecast days carry top contributing factors (why the model predicts
        // this), but no lab sample — there is no future water-quality test.
        forecast.push({
          date: String(date),
          probability: p,
          mpnLabel: mpn,
          status: dayStatus,
          factors: buildFactors([
            fcRow[`day${i}_top_factor_1`],
            fcRow[`day${i}_top_factor_2`],
            fcRow[`day${i}_top_factor_3`],
          ]),
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
        const dayStatus = statusFromProb(p, code, thresholdMap);
        if (!dayStatus) continue;
        // Replay that day's saved nowcast: same factors + the lab result that
        // was latest as of that date (no future sample leaks backward).
        pastDays.push({
          date: String(date),
          probability: p,
          mpnLabel: mpn,
          status: dayStatus,
          factors: buildFactors([
            histRow[`day${i}_top_factor_1`],
            histRow[`day${i}_top_factor_2`],
            histRow[`day${i}_top_factor_3`],
          ]),
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
      name: config.beachNames[code] ?? code,
      latitude: Number(now.Latitude),
      longitude: Number(now.Longitude),
      predictionDate: String(now.prediction_date),
      probability: prob,
      mpnLabel: now.mpn_label,
      lastResult: parseLastResult(now.last_result),
      daysSinceSample: days,
      factors,
      insight: normalizeInsight(String(now.insight ?? ""), status),
      status,
      threshold: thresholdFor(code, thresholdMap),
      pastDays,
      forecast,
    });
  }

  beaches.sort((a, b) => b.latitude - a.latitude);

  const predictionDate = beaches[0]?.predictionDate ?? "";

  return { beaches, predictionDate };
}
