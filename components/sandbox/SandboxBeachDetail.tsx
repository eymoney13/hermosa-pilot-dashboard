"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { formatMonthDayYear, RISK_TIERS, riskTier, STATUS_BAND, type BeachData, type Status } from "@/lib/data";
import { buildWindowCells, weekdayShort } from "@/lib/window";
import InfoTooltip from "../InfoTooltip";
import WhyPrediction from "../WhyPrediction";
import s from "./SandboxDashboard.module.css";
import NeptuneMark from "./NeptuneMark";

export const bandLabel = (status: Status) => `${STATUS_BAND[status].short} bacteria`;
// "2026-09-24" -> "9/24". Parsed off the string rather than through Date, which
// would shift the day backwards for anyone west of UTC.
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

// MIRRORED from components/BeachCard.tsx, not imported: these are private to
// that file, and BeachCard is on /southbay's render path, which this work is
// not allowed to touch — even to add an `export`. Keep the three in step if the
// original ever changes.
const SCALE_GRADIENT =
  "linear-gradient(to right, #97C459 0%, #97C459 25%, #EF9F27 40%, #EF9F27 55%, #E24B4A 65%, #A32D2D 100%)";
const THRESHOLD_TOOLTIP_BODY =
  "The EPA's safe-swimming limit for ocean water is 104 MPN/100mL, the most probable number of bacteria per 100 milliliters. Readings above this are classified as an exceedance, meaning bacteria levels are unsafe for swimming.";
const STATUS_ICON_COLOR: Record<Status, string> = {
  Normal: "#3B6D11",
  "Slightly elevated": "#6B5F0E",
  "Not recommended": "#9B2C2C",
};

/**
 * Where today sits on the low-to-high scale. No numbers on it, which is what
 * lets it coexist with this board's rule that the Neptune Index is a word and
 * not a 0-100 score — it is the picture of the call the heading just made.
 */
function ExceedanceBar({ probability }: { probability: number }) {
  const left = `${Math.max(0, Math.min(1, probability)) * 100}%`;
  return (
    <div className={s.scaleBar} aria-hidden="true">
      <div className={s.scaleTrack} style={{ background: SCALE_GRADIENT }} />
      {/* The marker carries the mark rather than being a plain dot. It is
          the one element on the bar that is already the reader's focus, so it
          is where a logo costs nothing and reads as craft; anywhere else on
          this card it would be decoration competing with the reading. */}
      <div className={s.scaleMarker} style={{ left }}>
        <NeptuneMark className={s.scaleMarkerLogo} />
      </div>
    </div>
  );
}
export const bandClass = (status: Status) => status === "Normal" ? s.low : status === "Slightly elevated" ? s.moderate : s.high;

/**
 * The figures behind the call: the exceedance percentage and the key naming
 * each band. Rendered inside "What's affecting the water quality?" rather than
 * on the face of the card, which is what lets the card lead with the word and
 * keeps the panel as the place a reader goes for the number.
 *
 * RISK_TIERS and riskTier come from lib/data, so the bands and their colours
 * cannot drift from the rest of the board.
 */
function Figures({ probability }: { probability: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, probability)) * 100);
  return (
    <div>
      <p className={s.exceedance}>
        <span className={s.exceedancePct} style={{ color: riskTier(pct).textColor }}>{pct}%</span>
        <span className={s.exceedanceLabel}>chance of unsafe bacteria levels</span>
      </p>
      {/* Range first, name second: read this way the percentage is the term and
          the band is what it means, which is the direction a reader coming from
          the number above actually needs. */}
      <dl className={s.riskKey}>
        {RISK_TIERS.map((tier) => (
          <div key={tier.label}>
            <span className={s.keySwatch} style={{ backgroundColor: tier.color }} aria-hidden="true" />
            <dt>{tier.range}%</dt>
            <dd>Likely {tier.label.toLowerCase()}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function distanceScore(a: BeachData, b: BeachData) {
  const rad = Math.PI / 180;
  return Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad)
    * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
}

export default function SandboxBeachDetail({ beach, beaches, onSelect }: { beach: BeachData; beaches: BeachData[]; onSelect: (code: string) => void }) {
  const cells = buildWindowCells(beach);
  const [selectedDate, setSelectedDate] = useState(beach.predictionDate);

  // Open the week scrolled to its right-hand end, so the days ahead are what a
  // reader lands on rather than three days that have already happened.
  //
  // Only does anything where the strip actually overflows, which is phones —
  // on a wide screen all seven fit and scrollWidth equals clientWidth, so this
  // is a no-op. That is why it is not behind a width check: the CSS already
  // decides when there is something to scroll, and a JS breakpoint could
  // disagree with it.
  //
  // Runs once per beach. The parent remounts this component on every beach
  // change (key={active.code}), so switching beaches re-runs it, while a reader
  // who has scrolled the strip themselves is left alone.
  const days = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = days.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  // Locked cells contain placeholders, not readings; they can never be selected.
  const active = cells.find((cell) => cell.day.date === selectedDate && !cell.day.locked) ?? cells.find((cell) => cell.type === "today")!;
  const day = active.day;
  const meaning = day.status === "Normal"
    ? "There’s a low chance of unsafe bacteria levels in the water. Conditions can change; check official advisories before entering the water."
    : day.status === "Slightly elevated"
      ? "There’s a moderate chance of unsafe bacteria levels in the water. Check official advisories and consider nearby beaches with lower predicted levels."
      : "There’s a high chance of unsafe bacteria levels in the water. Consider postponing water activities and check official advisories.";
  const nearby = Number.isFinite(beach.latitude) && Number.isFinite(beach.longitude)
    ? beaches.filter((candidate) => candidate.code !== beach.code && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude))
      .sort((a, b) => distanceScore(beach, a) - distanceScore(beach, b) || a.code.localeCompare(b.code)).slice(0, 3)
    : [];
  const explanation = day.status === "Normal" ? "Bacteria levels are predicted to be below the swimming threshold." : day.status === "Slightly elevated" ? "Bacteria levels may be elevated, but are predicted to remain below the swimming threshold." : "Bacteria levels are predicted to exceed the swimming threshold.";
  return <div className={s.detail}>
    <section className={`${s.reading} ${bandClass(day.status)}`} aria-label="Selected forecast">
      <p className={s.eyebrow}>Neptune Index <span> / {active.type === "today" ? "Today’s forecast" : active.type === "past" ? "Past forecast" : "Forecast"}</span></p>
      <h3>{STATUS_BAND[day.status].short} risk</h3><p className={s.readingDate}>{formatMonthDayYear(day.date)}</p><p>{explanation}<InfoTooltip title="EPA swimming threshold" body={THRESHOLD_TOOLTIP_BODY} iconColor={STATUS_ICON_COLOR[day.status]} iconClassName="h-3.5 w-3.5" ariaLabel="About the EPA swimming threshold" /></p><ExceedanceBar probability={day.probability} />
    </section>
    <section className={s.week} aria-label="Forecast days">
      <div className={s.sectionHeading}><h3>7-Day Window</h3>{beach.locked && <span className={s.proBadge}>PRO FORECAST</span>}</div>
      <div className={s.days} ref={days}>{cells.map(({ day: cell, type }) => cell.locked ? <div key={cell.date} className={s.lockedDay} aria-label={`${formatMonthDayYear(cell.date)}: available with Neptune Pro`}><span className={s.dayName}>{weekdayShort(cell.date)}</span><span className={s.dayBand}><Lock size={15} /></span><small className={s.dayDate}>{shortDate(cell.date)}</small></div> : <button key={cell.date} onClick={() => setSelectedDate(cell.date)} aria-pressed={cell.date === day.date} aria-label={`${formatMonthDayYear(cell.date)}: ${bandLabel(cell.status)}`} className={`${s.day} ${bandClass(cell.status)}`}><span className={s.dayName}>{type === "today" ? "Today" : weekdayShort(cell.date)}</span><span className={s.dayBand}>{/* Both rendered, one hidden by CSS rather than picked in JS: choosing by viewport at render time would disagree with the server and blow up hydration. display:none also keeps the hidden copy out of the accessibility tree, so a screen reader hears the word once — and the button's aria-label already carries the full "Moderate bacteria" either way. */}<span className={s.bandFull}>{STATUS_BAND[cell.status].short}</span><span className={s.bandAbbr}>{STATUS_BAND[cell.status].abbr}</span></span><small className={s.dayDate}>{shortDate(cell.date)}</small></button>)}</div>
      {beach.locked && <a className={s.inlineLink} href="#sandbox-pro">See beyond today with Pro <ArrowRight size={15} /></a>}
    </section>
    <section className={s.summary}><h3>What this means</h3><p>{meaning}</p></section>
    {<WhyPrediction prominentToggle figures={<Figures probability={day.probability} />} factors={day.factors ?? []} drivers={day.drivers ?? beach.drivers} conditions={day.conditions ?? beach.conditions} lastResult={day.lastResult ?? null} daysSinceSample={day.daysSinceSample ?? null} predictionDate={day.date} accuracy={beach.accuracy} hidePercent={false} showAccuracyPercent />}
    {nearby.length > 0 && <section><h3>Nearby beaches</h3><ul className={s.beaches}>{nearby.map((neighbor) => <li key={neighbor.code}><button onClick={() => onSelect(neighbor.code)}><span className={s.beachName}>{neighbor.name}</span><span className={`${s.band} ${s.listReading} ${bandClass(neighbor.status)}`}><span>{STATUS_BAND[neighbor.status].short} risk</span></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}</ul></section>}
  </div>;
}
