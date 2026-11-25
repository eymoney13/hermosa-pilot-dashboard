"use client";

import { ArrowRight, BellRing } from "lucide-react";
import { STATUS_BAND, type BeachData } from "@/lib/data";
import type { BeachSite, OutlookStation, SiteStation } from "@/lib/outlooks/types";
import { bandClass } from "../sandbox/SandboxBeachDetail";
import s from "../sandbox/SandboxDashboard.module.css";
import o from "./Outlooks.module.css";
import {
  AdvisoryLinks,
  DataAttribution,
  InfluenceList,
  LabHistory,
  OutlookPanel,
  StationList,
} from "./OutlookParts";

function milesBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * The outlook beach page. It takes an OutlookStation, which by type has no
 * prediction fields, so nothing here can show a bacteria risk for this beach.
 * The only risk colours on the page belong to the nearby FORECAST beaches,
 * which are labelled as such.
 */
export default function OutlookDetail({ site, station, stale, generatedAt, forecastBeaches, onSelectForecast, onSelectStation }: {
  site: BeachSite;
  station: OutlookStation;
  stale: boolean;
  generatedAt: string | null;
  forecastBeaches: BeachData[];
  onSelectForecast: (code: string) => void;
  onSelectStation: (station: SiteStation) => void;
}) {
  const nearby = forecastBeaches
    .filter((b) => Number.isFinite(b.latitude) && Number.isFinite(b.longitude))
    .map((b) => ({ beach: b, miles: milesBetween(station.station, b) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, 3);
  return (
    <div className={`${s.detail} ${o.root}`}>
      <OutlookPanel outlook={station.outlook} stale={stale} generatedAt={generatedAt} />

      {station.outlook && (
        <section className={o.section} aria-label="Today's environmental conditions">
          <h3>What&apos;s influencing water quality today</h3>
          <InfluenceList influences={station.outlook.influences} />
        </section>
      )}

      {site.hasForecast ? (
        // Another station at this same beach has a bacteria forecast. Saying
        // "not yet available" here would be wrong; point to it instead.
        <section className={`${o.section} ${o.forecastBox}`} aria-label="Bacteria forecasting">
          <h3>Bacteria Forecasting</h3>
          <strong>This monitoring station does not have a bacteria forecast.</strong>
          <p>A daily bacteria forecast is available for {site.stations.filter((st) => st.kind === "forecast").length > 1 ? "other stations" : "another station"} at {site.name}:</p>
          <ul className={o.stations}>
            {site.stations.filter((st) => st.kind === "forecast").map((st) => (
              <li key={st.station.code}>
                <button type="button" onClick={() => onSelectStation(st)}>
                  <span><span>{st.station.name}</span><br /><span className={o.stationMeta}>Station {st.station.code}</span></span>
                  <span className={o.kindForecast}>View forecast</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className={`${o.section} ${o.forecastBox}`} aria-label="Bacteria forecasting">
          <h3>Bacteria Forecasting</h3>
          <strong>Forecast not yet available.</strong>
          <p>
            Neptune currently monitors the environmental conditions affecting water quality at this beach. We&apos;re
            working to expand our bacteria forecasting technology to more locations.
          </p>
          <p><b>Want bacteria forecasts at this beach?</b> Get notified when daily bacteria predictions become available here.</p>
          {/* Phase 4 wires this to forecast launch notifications. Free, and not a Pro feature. */}
          <button type="button" className={o.notifyButton} disabled aria-describedby="notify-soon">
            <BellRing size={16} aria-hidden="true" /> Notify me when forecasts launch
          </button>
          <p id="notify-soon" className={o.notifyNote}>Sign-up opens soon.</p>
        </section>
      )}

      <LabHistory labs={station.labs} />

      {site.multiStation && <StationList stations={site.stations} activeCode={station.station.code} onSelect={onSelectStation} />}

      <AdvisoryLinks county={site.county} />

      {nearby.length > 0 && (
        <section className={s.nearbySection} aria-label="Nearby beaches with bacteria forecasts">
          <h3>Nearby beaches with bacteria forecasts</h3>
          <ul className={s.beaches}>
            {nearby.map(({ beach, miles }) => (
              <li key={beach.code}>
                <button onClick={() => onSelectForecast(beach.code)}>
                  <span className={s.neighborInfo}>
                    <span className={s.beachName}>{beach.name}</span>
                    <span className={s.neighborMeta}>{miles.toFixed(1)} mi away · daily bacteria forecast</span>
                  </span>
                  <span className={`${s.band} ${s.listReading} ${bandClass(beach.status)}`}><span>{STATUS_BAND[beach.status].short} risk</span></span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={o.disclaimer}>{station.outlook?.disclaimer || "Water Quality Outlooks describe environmental conditions that may influence bacteria levels. They do not predict or measure current bacteria concentrations. Always follow official beach advisories."}</p>
      <DataAttribution />
    </div>
  );
}
