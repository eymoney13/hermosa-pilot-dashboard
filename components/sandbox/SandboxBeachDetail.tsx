"use client";

import { useState, type ReactNode } from "react";
import posthog from "posthog-js";
import { ArrowRight, ArrowUpRight, Lock } from "lucide-react";
import { formatMonthDayYear, RISK_TIERS, riskTier, type BeachData, type Status } from "@/lib/data";
import { buildWindowCells } from "@/lib/window";
import { beachProperties, type LockedFeature } from "@/lib/analytics";
import {
  FORECAST_EXPERIMENTAL_EXPLANATION,
  FORECAST_EXPERIMENTAL_LABEL,
  FORECAST_HIDDEN_STATION_NOTE,
  forecastHorizonFor,
} from "@/lib/forecastDisplay";
import {
  PROBABILITY_CAPTION,
  hasLimitedLabData,
  lastTestedLabel,
  LIMITED_LAB_NOTE,
  statusReading,
  tierReading,
} from "@/lib/waterStatus";
import WhyPrediction from "../WhyPrediction";
import ForecastAccuracy from "../ForecastAccuracy";
import s from "./SandboxDashboard.module.css";
import NeptuneMark from "./NeptuneMark";

export const bandLabel = (status: Status) => statusReading(status).title;
export const bandClass = (status: Status) => status === "Normal" ? s.low : status === "Slightly elevated" ? s.moderate : s.high;

function dateLabel(iso: string, weekday = false) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC", ...(weekday ? { weekday: "long" as const } : { month: "short" as const, day: "numeric" as const }),
  });
}

function Figures({ probability }: { probability: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, probability)) * 100);
  return <section className={s.predictionFigures} aria-label="Estimated chance of exceeding the beach standard">
    <div>
      <p className={s.eyebrow}>Today’s model estimate</p>
      <p className={s.exceedance}><strong className={s.exceedancePct} style={{ color: riskTier(pct).textColor }}>{pct}%</strong></p>
      <p className={s.probabilityCaption}>{PROBABILITY_CAPTION}</p>
    </div>
    <dl className={s.riskKey} aria-label="What the percentage means">
      {RISK_TIERS.map((tier, index) => <div key={tier.label}>
        <span className={s.keySwatch} style={{ backgroundColor: tier.color }} aria-hidden="true" />
        <dt>{tier.range}%</dt><dd>{tierReading(index, tier.label)}</dd>
      </div>)}
    </dl>
  </section>;
}

function distanceScore(a: BeachData, b: BeachData) {
  const rad = Math.PI / 180;
  return Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad)
    * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
}

export default function SandboxBeachDetail({ beach, beaches, onSelect, onProMoment, advisory, alertSignup }: {
  beach: BeachData;
  beaches: BeachData[];
  onSelect: (code: string) => void;
  // A locked forecast cell was tapped: the reader wanted tomorrow.
  onProMoment?: () => void;
  advisory: { label: string; href: string };
  alertSignup?: ReactNode;
}) {
  const today = buildWindowCells(beach).find((cell) => cell.type === "today")!.day;
  const reading = statusReading(today.status);
  const forecasts = beach.forecast.filter((day) => day.date > beach.predictionDate).slice(0, 3);
  const horizon = forecastHorizonFor(beach.code);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const picked = horizon === "label"
    ? forecasts.find((day) => day.date === pickedDate && !day.locked) ?? null
    : null;
  const tested = lastTestedLabel(beach.daysSinceSample);
  const limited = hasLimitedLabData(beach.daysSinceSample, beach.noRecentSample);
  // Before onProMoment: the reader asked for this specific thing, which the
  // Pro card events alone cannot say. days_ahead 1 is "tomorrow".
  const lockedClicked = (feature: LockedFeature, date: string) => {
    posthog.capture("locked_feature_clicked", {
      board_location: "California",
      ...beachProperties(beach, "southbay"),
      feature,
      days_ahead: Math.round((Date.parse(date) - Date.parse(beach.predictionDate)) / 86_400_000),
    });
    onProMoment?.();
  };
  const nearby = Number.isFinite(beach.latitude) && Number.isFinite(beach.longitude)
    ? beaches.filter((candidate) => candidate.code !== beach.code && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude))
      .sort((a, b) => distanceScore(beach, a) - distanceScore(beach, b) || a.code.localeCompare(b.code)).slice(0, 3)
    : [];

  return <div className={s.detail}>
    <section className={`${s.predictionHero} ${bandClass(today.status)}`} aria-label="Today’s estimate">
      <div className={s.predictionHeader}>
        <p className={s.eyebrow}>Today’s estimate</p>
        <span>{dateLabel(today.date)}</span>
      </div>
      <h3>{reading.title}</h3>
      <p className={s.predictionExplanation}>{reading.detail}</p>
      <div className={s.predictionNote}>
        <div className={s.scaleBar} aria-hidden="true">
          <div className={s.scaleTrack} style={{ background: "linear-gradient(to right, #97C459 0%, #97C459 25%, #EF9F27 40%, #EF9F27 55%, #E24B4A 65%, #A32D2D 100%)" }} />
          <div className={s.scaleMarker} style={{ left: `${Math.max(0, Math.min(1, today.probability)) * 100}%` }}>
            <NeptuneMark className={s.scaleMarkerLogo} />
          </div>
        </div>
        <div className={s.scaleEnds} aria-hidden="true"><span>0%</span><span>100%</span></div>
        <p>The marker sits on today’s estimated chance of a result over the limit. <a href={advisory.href} target="_blank" rel="noopener noreferrer" title={advisory.label}>Always follow official beach advisories. <ArrowUpRight size={16} aria-hidden="true" /></a></p>
      </div>
    </section>

    {(tested || limited) && (
      <div className={s.sampleFacts}>
        {tested && <p>{tested}</p>}
        {limited && <p className={s.limitedNote}>{LIMITED_LAB_NOTE}</p>}
      </div>
    )}

    <Figures probability={today.probability} />
    <WhyPrediction
      key={today.date}
      prominentToggle
      title={`Why “${reading.title.toLowerCase()}” today?`}
      factors={today.factors ?? []}
      drivers={today.drivers ?? beach.drivers}
      conditions={today.conditions ?? beach.conditions}
      lastResult={today.lastResult ?? null}
      daysSinceSample={today.daysSinceSample ?? null}
      predictionDate={today.date}
      accuracy={beach.accuracy}
      hidePercent={false}
      showAccuracy={false}
    />

    {horizon === "hidden-station" && (
      <p className={s.forecastOmitted}>{FORECAST_HIDDEN_STATION_NOTE}</p>
    )}
    {horizon === "label" && (
      <section className={s.forecastPanel} aria-label="Experimental 3-day forecast">
        <div className={s.forecastPanelHead}>
          <span className={s.experimentalBadge}>{FORECAST_EXPERIMENTAL_LABEL}</span>
          {forecasts.some((forecast) => forecast.locked) && <span className={s.proBadge}>NEPTUNE PRO</span>}
        </div>
        <div className={s.sectionHeading}><h3>Next 3 days</h3></div>
        <p className={s.forecastExplain}>{FORECAST_EXPERIMENTAL_EXPLANATION}</p>
        {forecasts.length > 0 ? <>
          <p className={s.supporting}>Looking ahead · {dateLabel(forecasts[0].date)}–{dateLabel(forecasts[forecasts.length - 1].date)}</p>
          <div className={s.futureDays}>{forecasts.map((forecast) => forecast.locked ? (
            <a href="#sandbox-pro" onClick={() => lockedClicked("three_day_forecast", forecast.date)} key={forecast.date} className={`${s.futureDay} ${s.futureLocked}`} aria-label={`${formatMonthDayYear(forecast.date)}: experimental forecast, unlock with Neptune Pro`}>
              <span className={s.futureDayName}>{dateLabel(forecast.date, true)}</span>
              <span className={s.futureDate}>{dateLabel(forecast.date)}</span>
              <Lock size={18} aria-hidden="true" /><strong>Forecast</strong>
            </a>
          ) : (
            <button key={forecast.date} type="button" className={`${s.futureDay} ${bandClass(forecast.status)}`} onClick={() => setPickedDate((current) => current === forecast.date ? null : forecast.date)} aria-pressed={picked?.date === forecast.date} aria-label={`${formatMonthDayYear(forecast.date)}: experimental, ${bandLabel(forecast.status)}`}>
              <span className={s.futureDayName}>{dateLabel(forecast.date, true)}</span>
              <span className={s.futureDate}>{dateLabel(forecast.date)}</span>
              <strong>{statusReading(forecast.status).pill}</strong>
            </button>
          ))}</div>
          {picked && (
            <div className={s.forecastPick}>
              <p><strong>{dateLabel(picked.date, true)}, {dateLabel(picked.date)}</strong> · {statusReading(picked.status).title}</p>
              <p>{statusReading(picked.status).detail}</p>
              <p>{Math.round(Math.max(0, Math.min(1, picked.probability)) * 100)}%. {PROBABILITY_CAPTION}</p>
            </div>
          )}
        </> : <p className={s.supporting}>The next three days are not available yet.</p>}
      </section>
    )}
    <ForecastAccuracy accuracy={beach.accuracy} hidePercent={false} showOverallPercent cautious />
    {alertSignup}
    {nearby.length > 0 && <section className={s.nearbySection}><h3>Nearby beaches</h3><ul className={s.beaches}>{nearby.map((neighbor) => <li key={neighbor.code}><button type="button" onClick={() => onSelect(neighbor.code)}><span className={s.beachIdentity}><span className={s.beachName}>{neighbor.name}</span></span><span className={`${s.band} ${s.listReading} ${bandClass(neighbor.status)}`}><span>{statusReading(neighbor.status).pill}</span></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}</ul></section>}
  </div>;
}
