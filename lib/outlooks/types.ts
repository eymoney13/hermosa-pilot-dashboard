import type { BeachData } from "../data";

/**
 * Water Quality Outlooks: shared types.
 *
 * A station is either a public bacteria FORECAST or an environmental OUTLOOK.
 * The two are separate types on purpose. `OutlookStation` has no field that
 * can hold a probability, risk level, status colour or forecast, and
 * `beach?: never` stops a forecast payload being attached to it. A component
 * that only accepts an OutlookStation therefore cannot render a prediction.
 */

export type Classification = "forecast" | "outlook";

/** Public reliability label (decision D1). Metrics are never shipped to the client. */
export type Reliability = "strong" | "fair" | "grandfathered";
export type GrandfatherReason = "insufficient_exceedances" | "below_requirements";

export interface StationInfo {
  code: string;
  /** Display name: the dashboard's curated name when one exists, else the cleaned CEDEN name. */
  name: string;
  latitude: number;
  longitude: number;
  county: string;
  siteId: string;
}

export interface OutlookInfluence {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  display: string;
  status: "notable" | "context" | "unavailable";
  detail: string;
  ageDays: number | null;
}

export type OutlookHeadlineKey =
  | "data_unavailable"
  | "runoff_today"
  | "post_storm"
  | "recent_rain"
  | "river_discharge"
  | "multiple"
  | "large_tide"
  | "dry"
  | "typical";

export interface StationOutlook {
  /** Date the environmental inputs describe (YYYY-MM-DD), or null if none arrived. */
  inputsDate: string | null;
  generatedAt: string;
  dataStatus: "complete" | "partial" | "unavailable";
  headlineKey: OutlookHeadlineKey;
  headline: string;
  explanation: string;
  influences: OutlookInfluence[];
  disclaimer: string;
}

/** One laboratory Enterococcus result, as the lab reported it. Historical, never "today". */
export interface LabResult {
  sampleDate: string;
  display: string;
  resultMpn: number;
  qualifier: string;
  exceedsStandard: boolean;
  standardMpn: number;
  units: string;
}

export interface OutlookStation {
  kind: "outlook";
  station: StationInfo;
  outlook: StationOutlook | null;
  labs: LabResult[];
  beach?: never;
}

export interface ForecastStation {
  kind: "forecast";
  station: StationInfo;
  reliability: Reliability;
  /** Set only for grandfathered stations; drives the asterisk explanation. */
  reliabilityReason: GrandfatherReason | null;
  /** Today's forecast from the existing pipeline; null if it is missing today (never downgraded to an outlook). */
  beach: BeachData | null;
  outlook: StationOutlook | null;
  labs: LabResult[];
}

export type SiteStation = OutlookStation | ForecastStation;

/** One map pin: a distinct beach with one or more monitoring stations. */
export interface BeachSite {
  id: string;
  name: string;
  county: string;
  latitude: number;
  longitude: number;
  /** Forecast stations first (D2), then outlooks, each north to south. */
  stations: SiteStation[];
  hasForecast: boolean;
  /** The station the pin leads with: a forecast station if the beach has one. */
  leadStationCode: string;
  multiStation: boolean;
  /** Station-to-beach grouping has been hand-checked (D7). */
  verified: boolean;
}

export interface OutlookNetwork {
  sites: BeachSite[];
  generatedAt: string | null;
  inputsDate: string | null;
  /** The newest outlook is older than the freshness limit. */
  stale: boolean;
  counts: { stations: number; forecastStations: number; outlookStations: number; beaches: number };
}
