import type { BeachData } from "../data";
import type {
  BeachSite,
  GrandfatherReason,
  LabResult,
  OutlookHeadlineKey,
  OutlookInfluence,
  OutlookNetwork,
  Reliability,
  SiteStation,
  StationInfo,
  StationOutlook,
} from "./types";

/**
 * Pure parsing and assembly for Water Quality Outlooks: no file system, no env.
 *
 * Every object is built field by field from an allow-list. Rows are never
 * spread, so an unexpected CSV column (say a probability someone adds to the
 * pipeline later) cannot ride along into an outlook. `assertNoPredictionFields`
 * re-checks the finished outlook objects as a second line of defence.
 */

export type CsvRow = Record<string, string | undefined>;

/** How old the newest outlook may be before the UI must call it out. */
export const STALE_AFTER_HOURS = 36;
/** Recent lab results sent with the page; the full history can be fetched per beach later. */
export const LABS_PER_STATION = 12;

const HEADLINE_KEYS: ReadonlySet<string> = new Set<OutlookHeadlineKey>([
  "data_unavailable", "runoff_today", "post_storm", "recent_rain", "river_discharge",
  "multiple", "large_tide", "dry", "typical",
]);
const RELIABILITY: ReadonlySet<string> = new Set<Reliability>(["strong", "fair", "grandfathered"]);
const REASONS: ReadonlySet<string> = new Set<GrandfatherReason>([
  "insufficient_exceedances", "below_requirements",
]);
const INFLUENCE_STATUS = new Set(["notable", "context", "unavailable"]);
const DATA_STATUS = new Set(["complete", "partial", "unavailable"]);

/** Keys that would mean a prediction reached an outlook object. */
const FORBIDDEN_KEY = /prob|predict|risk|neptune_?index|mpn_?label|estimated|threshold|shap|top_?factor|verdict|status_?band|accuracy|forecast/i;

function str(v: string | undefined): string {
  return (v ?? "").trim();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "DHS104-Santa Monica State Beach, Los Angeles" → "Santa Monica State Beach". */
export function cleanStationName(code: string, cedenName: string): string {
  let n = cedenName.trim();
  if (n.startsWith(`${code}-`)) n = n.slice(code.length + 1);
  n = n.replace(/,\s*[^,]+$/, "").trim();
  return n || code;
}

export function parseInfluences(json: string): OutlookInfluence[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r): OutlookInfluence[] => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const status = String(o.status ?? "");
    if (!INFLUENCE_STATUS.has(status)) return [];
    return [{
      key: String(o.key ?? ""),
      label: String(o.label ?? ""),
      value: num(o.value),
      unit: String(o.unit ?? ""),
      display: String(o.display ?? ""),
      status: status as OutlookInfluence["status"],
      detail: String(o.detail ?? ""),
      ageDays: num(o.age_days),
    }];
  });
}

export function parseOutlook(row: CsvRow): StationOutlook | null {
  const key = str(row.headline_key);
  const status = str(row.data_status);
  if (!HEADLINE_KEYS.has(key) || !DATA_STATUS.has(status)) return null;
  return {
    inputsDate: str(row.inputs_date) || null,
    generatedAt: str(row.generated_at),
    dataStatus: status as StationOutlook["dataStatus"],
    headlineKey: key as OutlookHeadlineKey,
    headline: str(row.headline),
    explanation: str(row.explanation),
    influences: parseInfluences(row.influences ?? "[]"),
    disclaimer: str(row.disclaimer),
  };
}

export function parseLab(row: CsvRow): LabResult | null {
  const date = str(row.sample_date);
  const mpn = num(row.result_mpn);
  const standard = num(row.standard_mpn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || mpn === null || standard === null) return null;
  return {
    sampleDate: date,
    display: str(row.display),
    resultMpn: mpn,
    qualifier: str(row.qualifier),
    exceedsStandard: str(row.exceeds_standard) === "1",
    standardMpn: standard,
    units: str(row.units) || "MPN/100 mL",
  };
}

export function assertNoPredictionFields(value: unknown, path = "outlook"): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoPredictionFields(v, `${path}[${i}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(k)) throw new Error(`Prediction field "${k}" found at ${path}`);
    assertNoPredictionFields(v, `${path}.${k}`);
  }
}

export interface AssembleInput {
  registry: CsvRow[];
  outlooks: CsvRow[];
  labs: CsvRow[];
  forecastBeaches: BeachData[];
  displayNames: Record<string, string>;
  now: Date;
}

export function assembleNetwork(input: AssembleInput): OutlookNetwork {
  const outlookBy = new Map<string, StationOutlook>();
  for (const r of input.outlooks) {
    const o = parseOutlook(r);
    if (o) outlookBy.set(str(r.StationCode), o);
  }
  const labsBy = new Map<string, LabResult[]>();
  for (const r of input.labs) {
    const l = parseLab(r);
    if (!l) continue;
    const code = str(r.StationCode);
    const list = labsBy.get(code) ?? [];
    list.push(l);
    labsBy.set(code, list);
  }
  for (const list of labsBy.values()) list.sort((a, b) => b.sampleDate.localeCompare(a.sampleDate));
  const beachBy = new Map(input.forecastBeaches.map((b) => [b.code, b]));

  const sites = new Map<string, { name: string; county: string; verified: boolean; stations: SiteStation[] }>();
  for (const r of input.registry) {
    const code = str(r.StationCode);
    const cls = str(r.classification);
    const siteId = str(r.site_id);
    const lat = num(r.Latitude);
    const lon = num(r.Longitude);
    if (!code || !siteId || lat === null || lon === null) continue;
    if (cls !== "forecast" && cls !== "outlook") continue;   // unreleased never leaves the server
    const station: StationInfo = {
      code,
      name: input.displayNames[code] ?? cleanStationName(code, str(r.StationName)),
      latitude: lat,
      longitude: lon,
      county: str(r.county),
      siteId,
    };
    const outlook = outlookBy.get(code) ?? null;
    const labs = (labsBy.get(code) ?? []).slice(0, LABS_PER_STATION);
    let entry: SiteStation;
    if (cls === "forecast") {
      const rel = str(r.reliability);
      const why = str(r.reliability_reason);
      if (!RELIABILITY.has(rel)) continue;   // a forecast without a valid label is not shown
      entry = {
        kind: "forecast",
        station,
        reliability: rel as Reliability,
        reliabilityReason: rel === "grandfathered" && REASONS.has(why) ? (why as GrandfatherReason) : null,
        beach: beachBy.get(code) ?? null,
        outlook,
        labs,
      };
    } else {
      entry = { kind: "outlook", station, outlook, labs };
      assertNoPredictionFields(entry, `station ${code}`);
    }
    const site = sites.get(siteId) ?? {
      name: str(r.site_name) || station.name,
      county: station.county,
      verified: str(r.site_verified) === "true",
      stations: [],
    };
    site.stations.push(entry);
    site.verified = site.verified && str(r.site_verified) === "true";
    sites.set(siteId, site);
  }

  const out: BeachSite[] = [...sites.entries()].map(([id, s]) => {
    const stations = [...s.stations].sort((a, b) =>
      a.kind === b.kind ? b.station.latitude - a.station.latitude : a.kind === "forecast" ? -1 : 1);
    const lat = stations.reduce((t, x) => t + x.station.latitude, 0) / stations.length;
    const lon = stations.reduce((t, x) => t + x.station.longitude, 0) / stations.length;
    return {
      id,
      name: s.name,
      county: s.county,
      latitude: lat,
      longitude: lon,
      stations,
      hasForecast: stations.some((x) => x.kind === "forecast"),
      leadStationCode: stations[0].station.code,
      multiStation: stations.length > 1,
      verified: s.verified,
    };
  }).sort((a, b) => b.latitude - a.latitude);

  const all = out.flatMap((s) => s.stations);
  const generated = [...outlookBy.values()].map((o) => o.generatedAt).filter(Boolean).sort();
  const inputs = [...outlookBy.values()].map((o) => o.inputsDate).filter((d): d is string => !!d).sort();
  const newest = generated.at(-1) ?? null;
  const ageHours = newest ? (input.now.getTime() - Date.parse(newest)) / 3_600_000 : Infinity;
  return {
    sites: out,
    generatedAt: newest,
    inputsDate: inputs.at(-1) ?? null,
    stale: !(ageHours <= STALE_AFTER_HOURS),
    counts: {
      stations: all.length,
      forecastStations: all.filter((x) => x.kind === "forecast").length,
      outlookStations: all.filter((x) => x.kind === "outlook").length,
      beaches: out.length,
    },
  };
}
