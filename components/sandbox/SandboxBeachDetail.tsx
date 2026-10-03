"use client";

import { useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Lock } from "lucide-react";
import { formatMonthDayYear, RISK_TIERS, riskTier, STATUS_BAND, type BeachData, type Status } from "@/lib/data";
import { buildWindowCells } from "@/lib/window";
import WhyPrediction from "../WhyPrediction";
import ForecastAccuracy from "../ForecastAccuracy";
import s from "./SandboxDashboard.module.css";
import NeptuneMark from "./NeptuneMark";

export const bandLabel = (status: Status) => `${STATUS_BAND[status].short} bacteria`;
export const bandClass = (status: Status) => status === "Normal" ? s.low : status === "Slightly elevated" ? s.moderate : s.high;

function dateLabel(iso: string, weekday = false) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC", ...(weekday ? { weekday: "long" as const } : { month: "short" as const, day: "numeric" as const }),
  });
}

function Figures({ probability }: { probability: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, probability)) * 100);
  return <section className={s.predictionFigures} aria-label="Prediction percentage and risk legend">
    <div>
      <p className={s.eyebrow}>Neptune model estimate</p>
      <p className={s.exceedance}><strong className={s.exceedancePct} style={{ color: riskTier(pct).textColor }}>{pct}%</strong></p>
      <p className={s.probabilityCaption}>chance of unsafe bacteria levels</p>
    </div>
    <dl className={s.riskKey} aria-label="Risk percentage legend">
      {RISK_TIERS.map((tier) => <div key={tier.label}>
        <span className={s.keySwatch} style={{ backgroundColor: tier.color }} aria-hidden="true" />
        <dt>{tier.range}%</dt><dd>Likely {tier.label.toLowerCase()}</dd>
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

export default function SandboxBeachDetail({ beach, beaches, onSelect, advisory }: {
  beach: BeachData;
  beaches: BeachData[];
  onSelect: (code: string) => void;
  advisory: { label: string; href: string };
}) {
  const [selectedDate, setSelectedDate] = useState(beach.predictionDate);
  const reading = useRef<HTMLElement>(null);
  const selectForecast = (date: string) => {
    setSelectedDate(date);
    requestAnimationFrame(() => reading.current?.scrollIntoView({ block: "start" }));
  };
  const today = buildWindowCells(beach).find((cell) => cell.type === "today")!.day;
  const forecasts = beach.forecast.filter((day) => day.date > beach.predictionDate).slice(0, 3);
  // A locked date is a placeholder and must never be rendered as a reading.
  const day = forecasts.find((candidate) => candidate.date === selectedDate && !candidate.locked) ?? today;
  const isToday = day.date === today.date;
  const risk = STATUS_BAND[day.status].short.toLowerCase();
  const explanation = day.status === "Normal" ? "Bacteria levels are predicted to be below the swimming threshold." : day.status === "Slightly elevated" ? "Bacteria levels may be elevated, but are predicted to remain below the swimming threshold." : "Bacteria levels are predicted to exceed the swimming threshold.";
  const nearby = Number.isFinite(beach.latitude) && Number.isFinite(beach.longitude)
    ? beaches.filter((candidate) => candidate.code !== beach.code && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude))
      .sort((a, b) => distanceScore(beach, a) - distanceScore(beach, b) || a.code.localeCompare(b.code)).slice(0, 3)
    : [];

  return <div className={s.detail}>
    <section ref={reading} className={`${s.predictionHero} ${bandClass(day.status)}`} aria-label="Selected forecast">
      <div className={s.predictionHeader}>
        <p className={s.eyebrow}>{isToday ? "Today’s prediction" : "Forecast"}</p>
        <span>{dateLabel(day.date)}</span>
      </div>
      <h3>{STATUS_BAND[day.status].short} risk</h3>
      <p className={s.predictionExplanation}>{explanation}</p>
      <div className={s.predictionNote}>
        <div className={s.scaleBar} aria-hidden="true">
          <div className={s.scaleTrack} style={{ background: "linear-gradient(to right, #97C459 0%, #97C459 25%, #EF9F27 40%, #EF9F27 55%, #E24B4A 65%, #A32D2D 100%)" }} />
          <div className={s.scaleMarker} style={{ left: `${Math.max(0, Math.min(1, day.probability)) * 100}%` }}>
            <NeptuneMark className={s.scaleMarkerLogo} />
          </div>
        </div>
        <p>Neptune model estimate. <a href={advisory.href} target="_blank" rel="noopener noreferrer" title={advisory.label}>Always follow official beach advisories. <ArrowUpRight size={16} aria-hidden="true" /></a></p>
      </div>
      {!isToday && <button className={s.todayButton} onClick={() => setSelectedDate(today.date)}>Back to today’s prediction</button>}
    </section>

    <Figures probability={day.probability} />
    <WhyPrediction
      key={day.date}
      prominentToggle
      title={`Why is risk ${risk} ${isToday ? "today" : `on ${dateLabel(day.date)}`}?`}
      factors={day.factors ?? []}
      drivers={day.drivers ?? (isToday ? beach.drivers : [])}
      conditions={day.conditions ?? (isToday ? beach.conditions : undefined)}
      lastResult={day.lastResult ?? null}
      daysSinceSample={day.daysSinceSample ?? null}
      predictionDate={day.date}
      accuracy={beach.accuracy}
      hidePercent={false}
      showAccuracy={false}
    />

    <section className={s.futureSection} aria-label="Next three days">
      <div className={s.sectionHeading}><h3>Next 3 days</h3>{forecasts.some((forecast) => forecast.locked) && <span className={s.proBadge}>NEPTUNE PRO</span>}</div>
      {forecasts.length > 0 ? <>
        <p className={s.supporting}>Looking ahead · {dateLabel(forecasts[0].date)}–{dateLabel(forecasts[forecasts.length - 1].date)}</p>
        <div className={s.futureDays}>{forecasts.map((forecast) => forecast.locked ? (
          <a href="#sandbox-pro" key={forecast.date} className={`${s.futureDay} ${s.futureLocked}`} aria-label={`${formatMonthDayYear(forecast.date)}: unlock forecast with Neptune Pro`}>
            <span className={s.futureDayName}>{dateLabel(forecast.date, true)}</span>
            <span className={s.futureDate}>{dateLabel(forecast.date)}</span>
            <Lock size={18} aria-hidden="true" /><strong>Forecast</strong>
          </a>
        ) : (
          <button key={forecast.date} type="button" className={`${s.futureDay} ${bandClass(forecast.status)}`} onClick={() => selectForecast(forecast.date)} aria-pressed={day.date === forecast.date} aria-label={`${formatMonthDayYear(forecast.date)}: ${bandLabel(forecast.status)}`}>
            <span className={s.futureDayName}>{dateLabel(forecast.date, true)}</span>
            <span className={s.futureDate}>{dateLabel(forecast.date)}</span>
            <strong>{STATUS_BAND[forecast.status].short} risk</strong>
          </button>
        ))}</div>
      </> : <p className={s.supporting}>The next three days’ forecasts are not available yet.</p>}
    </section>
    <ForecastAccuracy accuracy={beach.accuracy} hidePercent={false} showOverallPercent />
    {nearby.length > 0 && <section className={s.nearbySection}><h3>Nearby beaches</h3><ul className={s.beaches}>{nearby.map((neighbor) => <li key={neighbor.code}><button onClick={() => onSelect(neighbor.code)}><span className={s.beachName}>{neighbor.name}</span><span className={`${s.band} ${s.listReading} ${bandClass(neighbor.status)}`}><span>{STATUS_BAND[neighbor.status].short} risk</span></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}</ul></section>}
  </div>;
}
