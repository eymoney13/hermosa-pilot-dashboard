import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import {
  BEACH_NAMES,
  HERMOSA_STATIONS,
  statusFromProb,
  thresholdFor,
  type BeachData,
  type DashboardData,
  type ForecastDay,
} from "./data";
import { factorLabel } from "./factors";
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
  [key: string]: unknown;
}

async function readCsv<T>(relPath: string): Promise<T[]> {
  const filePath = path.join(process.cwd(), "public", "data", relPath);
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
async function readCsvOptional<T>(relPath: string): Promise<T[]> {
  try {
    return await readCsv<T>(relPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw err;
  }
}

async function loadThresholds(): Promise<Record<string, number>> {
  const rows = await readCsv<{ StationCode: string; threshold: number }>(
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

export async function loadDashboardData(): Promise<DashboardData> {
  const [nowcastRows, forecastRows, historyRows, thresholdMap] =
    await Promise.all([
      readCsv<NowcastRow>("nowcast_latest.csv"),
      readCsv<ForecastRow>("forecast_3day.csv"),
      readCsvOptional<ForecastRow>("history_3day.csv"),
      loadThresholds(),
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
  for (const code of HERMOSA_STATIONS) {
    const now = nowcastByCode.get(code);
    if (!now) continue;
    const prob = Number(now.exc_probability);
    const status = statusFromProb(prob, code, thresholdMap);
    if (!status) continue;

    const factors: string[] = [];
    const seen = new Set<string>();
    for (const key of ["top_factor_1", "top_factor_2", "top_factor_3"] as const) {
      const raw = String(now[key] ?? "").trim();
      if (!raw) continue;
      const canonical = factorLabel(raw);
      if (canonical == null || seen.has(canonical)) continue;
      seen.add(canonical);
      factors.push(canonical);
    }

    const days =
      now.days_since_sample == null ||
      Number.isNaN(Number(now.days_since_sample))
        ? null
        : Number(now.days_since_sample);

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
        forecast.push({
          date: String(date),
          probability: p,
          mpnLabel: mpn,
          status: dayStatus,
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
        pastDays.push({
          date: String(date),
          probability: p,
          mpnLabel: mpn,
          status: dayStatus,
        });
      }
      pastDays.sort((a, b) => a.date.localeCompare(b.date));
    }

    beaches.push({
      code,
      name: BEACH_NAMES[code] ?? code,
      latitude: Number(now.Latitude),
      longitude: Number(now.Longitude),
      predictionDate: String(now.prediction_date),
      probability: prob,
      mpnLabel: now.mpn_label,
      lastResult:
        now.last_result == null ||
        (typeof now.last_result === "number" && Number.isNaN(now.last_result))
          ? null
          : now.last_result,
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
