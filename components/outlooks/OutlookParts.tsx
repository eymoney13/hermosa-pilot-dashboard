"use client";

import { ArrowUpRight } from "lucide-react";
import type {
  ForecastStation,
  LabResult,
  OutlookInfluence,
  SiteStation,
  StationOutlook,
} from "@/lib/outlooks/types";
import o from "./Outlooks.module.css";

/** County advisory pages (D4). Neptune does not ingest live closures or advisories. */
export const ADVISORY_LINKS: Record<string, { label: string; href: string }> = {
  "Los Angeles": {
    label: "LA County Public Health beach advisories",
    href: "http://publichealth.lacounty.gov/phcommon/public/media/mediapubOdisplay.cfm",
  },
  Orange: { label: "OC Beach Info (Orange County closures and advisories)", href: "https://ocbeachinfo.com/" },
};

export function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
  });
}

export function formatUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

export function InfluenceList({ influences }: { influences: OutlookInfluence[] }) {
  if (influences.length === 0) return <p className={o.sub}>No environmental measurements are available for today.</p>;
  return (
    <ul className={o.influences}>
      {influences.map((i) => (
        <li key={i.key}>
          <span className={o.influenceLabel}>
            {i.label}
            {i.status === "notable" && <span className={`${o.chip} ${o.chipNotable}`}>Notable</span>}
            {i.status === "unavailable" && <span className={`${o.chip} ${o.chipUnavailable}`}>Unavailable</span>}
          </span>
          <span className={o.influenceValue}>{i.status === "unavailable" ? "—" : i.display}</span>
          {i.detail && <span className={o.influenceDetail}>{i.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Today's headline panel. Used on outlook beaches and, compactly, on forecast beaches. */
export function OutlookPanel({ outlook, stale, generatedAt, title = "Water Quality Outlook" }: {
  outlook: StationOutlook | null;
  stale: boolean;
  generatedAt: string | null;
  title?: string;
}) {
  const updated = formatUpdated(outlook?.generatedAt ?? generatedAt);
  return (
    <section className={o.panel} aria-label={title}>
      <div className={o.eyebrowRow}>
        <span className={o.label}><span className={o.ring} aria-hidden="true" />{title}</span>
        {outlook?.inputsDate && <span>Conditions for {formatDay(outlook.inputsDate)}</span>}
      </div>
      {outlook ? <>
        <h3 className={o.headline}>{outlook.headline}</h3>
        <p className={o.explanation}>{outlook.explanation}</p>
      </> : <>
        <h3 className={o.headline}>Environmental data unavailable</h3>
        <p className={o.explanation}>Today&apos;s outlook for this location has not been generated. Historical laboratory results are shown below.</p>
      </>}
      {stale && <p className={o.notice}>This outlook has not been updated recently{updated ? ` (last update ${updated})` : ""}. Conditions may have changed.</p>}
      {outlook?.dataStatus === "partial" && <p className={o.notice}>Some measurements were not received today and are marked unavailable below. Missing data is never treated as zero.</p>}
      {updated && !stale && <p className={o.sub}>Updated {updated}</p>}
    </section>
  );
}

export function LabHistory({ labs }: { labs: LabResult[] }) {
  return (
    <section className={o.section} aria-label="Past laboratory results">
      <h3>Past laboratory results</h3>
      <p className={o.sub}>
        Enterococcus bacteria measured in water samples by the monitoring agency. These are historical samples,
        not today&apos;s water quality. California&apos;s single-sample standard is {labs[0]?.standardMpn ?? 104} MPN/100 mL.
      </p>
      {labs.length === 0 ? <p className={o.sub}>No laboratory results in the past two years.</p> : (
        <table className={o.labs}>
          <thead><tr><th scope="col">Collected</th><th scope="col">Result ({labs[0].units})</th><th scope="col">Standard</th></tr></thead>
          <tbody>
            {labs.map((l, i) => (
              <tr key={`${l.sampleDate}-${i}`}>
                <td>{formatDay(l.sampleDate)}</td>
                <td className={l.exceedsStandard ? o.above : undefined}>{l.display}</td>
                <td className={l.exceedsStandard ? o.above : undefined}>{l.exceedsStandard ? "Exceeded" : "Within"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function AdvisoryLinks({ county }: { county: string }) {
  const own = ADVISORY_LINKS[county];
  const links = own ? [own] : Object.values(ADVISORY_LINKS);
  return (
    <section className={o.section} aria-label="Official beach advisories">
      <h3>Official beach advisories</h3>
      <p className={o.sub}>
        Neptune does not currently receive live beach closure or advisory information. Always check the official
        source before entering the water; official advisories take precedence over anything shown here.
      </p>
      <div className={o.links}>
        {links.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">{l.label} <ArrowUpRight size={15} aria-hidden="true" /></a>)}
      </div>
    </section>
  );
}

export function DataAttribution() {
  return (
    <p className={o.attribution}>
      Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a>.
      Tides: NOAA CO-OPS. Waves and water temperature: CDIP. Laboratory results: California Beach Watch (CEDEN).
    </p>
  );
}

const RELIABILITY_INFO = "Forecast reliability reflects how consistently Neptune’s predictions have performed against historical laboratory-tested bacteria measurements at this location.";

export function ReliabilityBadge({ station }: { station: ForecastStation }) {
  const { reliability, reliabilityReason } = station;
  const label = reliability === "strong" ? "Strong"
    : reliability === "fair" ? "Fair"
    : reliabilityReason === "below_requirements" ? "Limited reliability*" : "Validation in progress*";
  const detail = reliability === "strong"
    ? "Predictions have demonstrated strong historical performance against laboratory-tested bacteria measurements."
    : reliability === "fair"
    ? "Predictions have demonstrated useful historical performance but contain greater uncertainty."
    : null;
  const footnote = reliability !== "grandfathered" ? null
    : reliabilityReason === "below_requirements"
    ? "*This forecast has enough validation data, but its historical performance falls below our current reliability requirements."
    : "*This beach has had too few high-bacteria samples to fully assess forecast reliability. Additional exceedance observations are needed.";
  return (
    <div className={o.reliability}>
      <span className={o.reliabilityBadge}>Forecast reliability: {label}</span>
      <details><summary>What is this?</summary><p>{RELIABILITY_INFO}</p>{detail && <p>{detail}</p>}</details>
      {footnote && <p className={o.footnote}>{footnote}</p>}
    </div>
  );
}

export function StationList({ stations, activeCode, onSelect }: {
  stations: SiteStation[];
  activeCode: string;
  onSelect: (station: SiteStation) => void;
}) {
  return (
    <section className={o.section} aria-label="Monitoring stations at this beach">
      <h3>{stations.length} monitoring stations at this beach</h3>
      <p className={o.sub}>Each station is sampled and shown separately. Readings are never averaged across stations.</p>
      <ul className={o.stations}>
        {stations.map((st) => (
          <li key={st.station.code}>
            <button type="button" onClick={() => onSelect(st)} aria-current={st.station.code === activeCode ? "true" : undefined}>
              <span><span>{st.station.name}</span><br /><span className={o.stationMeta}>Station {st.station.code}</span></span>
              <span className={st.kind === "forecast" ? o.kindForecast : o.kindOutlook}>{st.kind === "forecast" ? "Bacteria forecast" : "Outlook"}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
