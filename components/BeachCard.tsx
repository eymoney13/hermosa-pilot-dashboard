"use client";

import { useState } from "react";
import { AlertTriangle, CircleCheck, Lock, MapPin } from "lucide-react";
import {
  RISK_TIERS,
  STATUS_BAND,
  STATUS_BAND_TEXT,
  STATUS_LABEL,
  riskTier,
  VERDICT_AS_STATUS,
  type BeachData,
  type Status,
  type Verdict,
} from "@/lib/data";
import type { FeatureFlags } from "@/lib/features";
import { buildSummary } from "@/lib/summary";
import PaywallNotice from "./PaywallNotice";
import {
  buildWindowCells,
  VERDICT_CELL_COLOR,
  VERDICT_CELL_SHORT,
  VERDICT_CELL_TEXT,
  weekdayShort,
  type WindowCell,
} from "@/lib/window";
import { faqHref, FAQ_LINKS } from "@/lib/faq";
import InfoTooltip from "./InfoTooltip";
import WhyPrediction from "./WhyPrediction";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function weekdayLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
  });
}

const STATUS_TINT: Record<Status, { bg: string; deep: string; mid: string }> = {
  Normal: { bg: "bg-[#e8f5ee]", deep: "text-[#173404]", mid: "text-[#2d8a4e]" },
  "Slightly elevated": {
    bg: "bg-[#F5F2D8]",
    deep: "text-[#6B5F0E]",
    mid: "text-[#8A7D2A]",
  },
  "Not recommended": {
    bg: "bg-[#fce8e8]",
    deep: "text-[#412402]",
    mid: "text-[#cc3333]",
  },
};

// Day-cell fills for the binary boards, drawn from the same green/red the tier
// scale uses at its ends.
const SCALE_GRADIENT =
  "linear-gradient(to right, #97C459 0%, #97C459 25%, #EF9F27 40%, #EF9F27 55%, #E24B4A 65%, #A32D2D 100%)";

function articleFor(num: number): string {
  // "an" before 8, 11, 18, 80-89; "a" otherwise.
  const s = String(num);
  if (s.startsWith("8") || s.startsWith("11") || s === "18") return "an";
  return "a";
}

// ---------------------------------------------------------------------------
// 1. Location header
// ---------------------------------------------------------------------------

function LocationHeader({
  beach,
  locationLabel,
  binaryVerdict,
}: {
  beach: BeachData;
  locationLabel: string;
  binaryVerdict: boolean;
}) {
  // The board's own name, over the beach it is reporting on. This line used to
  // repeat the region, which the reader picked the beach from a moment ago and
  // which most of these names carry anyway ("Hermosa Beach - Herondo St"). The
  // brand is the more useful thing to put above a subject, and it reads the way
  // a report is headed rather than the way a pin is labelled, so the map pin
  // goes with it.
  //
  // Boards that publish no score keep the region. "Neptune Index" over a card
  // showing Good/Moderate/Poor against a per-beach cutoff would name a number
  // that is not on the page.
  return (
    <div>
      {binaryVerdict ? (
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          <span>{locationLabel}</span>
        </div>
      ) : (
        <p
          className="text-[11px] font-medium uppercase tracking-wider"
          style={{ color: "#2C8487" }}
        >
          Neptune Index
        </p>
      )}
      <h2 className="mt-1 text-xl font-medium text-gray-900">{beach.name}</h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Status hero
// ---------------------------------------------------------------------------

const STATUS_ICON_COLOR: Record<Status, string> = {
  Normal: "#3B6D11",
  "Slightly elevated": "#6B5F0E",
  "Not recommended": "#9B2C2C",
};

const THRESHOLD_TOOLTIP_BODY =
  "The EPA's safe-swimming limit for ocean water is 104 MPN/100mL, the most probable number of bacteria per 100 milliliters. Readings above this are classified as an exceedance, meaning bacteria levels are unsafe for swimming.";

// `when` names the day being viewed. The CA boards pass nothing and keep their
// existing "today" wording; the binary board passes the real day so the hero
// can't say "today" while the summary right beneath it says "on Thursday".
function predictionSubtitle(
  status: Status,
  when = "today",
  verdict: Verdict | null = null,
): string {
  // A middle day has to say two things at once: something is pushing bacteria
  // up, and it is still expected to stay under the limit. "Predicted to be
  // below the threshold" alone reads identically to a clean day, which leaves
  // the yellow doing all the work and the words explaining none of it.
  //
  // Both boards need that, but each says it in its own vocabulary: the binary
  // board is describing its Moderate verdict, the 3-tier boards the middle
  // band of the key.
  if (verdict === "Moderate") {
    return `Bacteria levels may be elevated but still predicted to be below the EPA swimming threshold ${when}.`;
  }
  // Guarded on the absence of a verdict, not on the tier alone: Boston can pair
  // a Good verdict with this tier, and that day should keep reading as Good.
  if (!verdict && status === "Slightly elevated") {
    return `Predicted to be slightly elevated but still below the EPA swimming threshold ${when}.`;
  }
  const verb =
    status === "Not recommended"
      ? "Predicted to exceed"
      : "Predicted to be below";
  return `${verb} the EPA swimming threshold ${when}.`;
}

function ThresholdSubtitle({ text, status }: { text: string; status: Status }) {
  return (
    <>
      {text}
      <InfoTooltip
        title="EPA swimming threshold"
        body={THRESHOLD_TOOLTIP_BODY}
        iconColor={STATUS_ICON_COLOR[status]}
        iconClassName="h-3.5 w-3.5"
        ariaLabel="About the EPA swimming threshold"
      />
    </>
  );
}

function StatusHero({
  status,
  verdict,
  probability,
  showIndex,
  when,
}: {
  status: Status;
  // When set, the hero reads "Good"/"Poor" instead of the 3-tier status. Only
  // the label changes: colors, icon and subtitle come from the equivalent tier,
  // so the binary boards reuse one palette rather than introducing a second.
  verdict: Verdict | null;
  probability: number;
  showIndex: boolean;
  // The day being viewed, worded for the subtitle ("today", "on Thursday").
  // Undefined keeps the existing "today" phrasing.
  when?: string;
}) {
  const toneStatus = verdict ? VERDICT_AS_STATUS[verdict] : status;
  const tint = STATUS_TINT[toneStatus];
  const Icon = toneStatus === "Not recommended" ? AlertTriangle : CircleCheck;
  const subtitle = predictionSubtitle(toneStatus, when, verdict);

  // The status + subtitle block, identical in both layouts. When the index is
  // hidden (every non-hermosa location) the box renders exactly as before — no
  // wrapper — so those dashboards are provably untouched.
  const statusBlock = (
    <>
      <div className="flex items-center gap-3">
        <Icon className={`h-6 w-6 ${tint.deep}`} aria-hidden="true" />
        <p className={`text-xl font-medium ${tint.deep}`}>
          {verdict ?? STATUS_LABEL[status]}
        </p>
      </div>
      <p className={`mt-2 ml-9 text-sm ${tint.mid}`}>
        <ThresholdSubtitle text={subtitle} status={toneStatus} />
      </p>
    </>
  );

  if (!showIndex) {
    return <div className={`${tint.bg} rounded-lg p-5`}>{statusBlock}</div>;
  }

  const index = Math.round(Math.max(0, Math.min(1, probability)) * 100);

  return (
    <div className={`${tint.bg} rounded-lg p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">{statusBlock}</div>

        <div
          className="flex shrink-0 flex-col items-end leading-none"
          aria-label={`Neptune Index ${index}`}
        >
          {/* A branded number that never says what it counts is just a number
              with a nickname. The definition belongs beside it, not three
              sections down: this is the first thing on the card a reader has
              no prior idea how to read. */}
          <span
            className={`flex items-center gap-1 text-[11px] uppercase tracking-wide ${tint.mid}`}
          >
            Neptune Index
            <InfoTooltip
              title="Neptune Index"
              body="A 0 to 100 score for how likely bacteria are to exceed the EPA safe-swimming threshold today. Higher means a greater chance the water tests unsafe. It is the same figure as the probability of unsafe bacteria levels under Behind the Prediction."
              iconClassName="h-3.5 w-3.5"
              ariaLabel="About the Neptune Index"
            />
          </span>
          <span
            className="mt-0.5 text-6xl font-semibold tabular-nums"
            style={{ color: riskTier(index).textColor }}
          >
            {index}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Exceedance scale
// ---------------------------------------------------------------------------

function exceedanceBody(pct: number): string {
  const article = articleFor(pct);

  // Tier 1: Low (0-29%)
  if (pct < 30) {
    // "and the large majority", not the moderate band's "though most". "Though"
    // marks a contrast this band has nothing to contrast, and reusing "most"
    // would make the cleanest days sound exactly as reassuring as the middle
    // ones: at least 71% of this band tests below the threshold against the
    // moderate band's 51-70%.
    return `Bacteria levels are likely low. There's ${article} ${pct}% chance the water has an unsafe amount of bacteria, and the large majority of samples in this range test below the EPA threshold.`;
  }

  // Tier 2: Moderate (30-49%)
  if (pct < 50) {
    return `Bacteria levels are likely moderate. There's ${article} ${pct}% chance the water has an unsafe amount of bacteria, though most samples in this range still test below the EPA threshold.`;
  }

  // Tier 3: High (50-74%)
  if (pct < 75) {
    return `Bacteria levels are likely high. There's ${article} ${pct}% chance the water has an unsafe amount of bacteria, and most samples in this range test above the EPA safe-swimming threshold.`;
  }

  // Tier 4: Very high (75-100%)
  return `Bacteria levels are very likely high. There's ${article} ${pct}% chance the water has an unsafe amount of bacteria, well above the EPA safe-swimming threshold.`;
}

// The gradient bar and its marker: where today sits on the scale, with no
// numbers on it. Kept next to the status read because it is the picture of the
// call the heading just made; the figures behind it moved into Behind the
// Prediction (see ExceedanceDetail), which is what lets the week sit directly
// underneath the bar.
function ExceedanceBar({ probability }: { probability: number }) {
  const probClamped = Math.max(0, Math.min(1, probability));
  const left = `${probClamped * 100}%`;

  return (
    <div>
      <div className="relative h-[18px]">
        <div
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full"
          style={{ background: SCALE_GRADIENT }}
          aria-hidden="true"
        />
        <div
          className="absolute top-1/2 h-[18px] w-[18px] rounded-full bg-white shadow"
          style={{
            left,
            transform: "translate(-50%, -50%)",
            border: "2.5px solid #111827",
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

// The figures behind the bar: the probability itself and the key naming each
// band. Rendered inside Behind the Prediction rather than on the face of the
// card, so the card leads with the call, the bar and the week, and a reader who
// wants the number opens the panel for it.
function ExceedanceDetail({
  probability,
  hidePercent,
  hideReadout,
}: {
  probability: number;
  hidePercent: boolean;
  hideReadout: boolean;
}) {
  const probClamped = Math.max(0, Math.min(1, probability));
  const pct = Math.round(probClamped * 100);

  return (
    <div>
      {!hideReadout && (
        <div>
          {/* The number is set in its own tier's saturated colour rather than
              boxed in a filled pill. The band is already named above the card
              and drawn along the bar, so a second block of colour was repeating
              a point that had been made twice; colouring the figure keeps the
              cue and drops the box.

              The sentence is dark, not grey. It says what the number measures,
              which is the one thing a reader needs to use it, and setting the
              only explanation on screen in the lightest tone available argued
              the opposite. */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className="text-[28px] font-semibold leading-none tracking-tight tabular-nums"
              style={{ color: riskTier(pct).textColor }}
            >
              {pct}
              {hidePercent ? "" : "%"}
            </span>
            <span className="text-[15px] font-medium text-gray-800">
              chance of unsafe bacteria levels
            </span>
            <InfoTooltip
              title="Probability of unsafe bacteria levels"
              body={exceedanceBody(pct)}
              ariaLabel="About the probability of unsafe bacteria levels"
              // The readout says "bacteria" without saying which. This is where
              // a reader wonders, so this is where the answer is offered.
              link={{
                href: faqHref(FAQ_LINKS.whatWeMeasure),
                text: "What bacteria do you measure?",
              }}
            />
          </div>
        </div>
      )}

      <dl className={`space-y-1 ${hideReadout ? "" : "mt-3"}`}>
        {RISK_TIERS.map((tier) => (
          <div key={tier.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: tier.color }}
              aria-hidden="true"
            />
            {/* Range first, name second, and the roles swap with them: read
                this way the percentage is the term and the name is what that
                band is called, which is the direction a reader actually goes
                once they have a number in front of them.

                The range gets a fixed column rather than being pushed apart by
                ml-auto. Widths run from "0-29%" to "75-100%", so left-aligning
                them without one would start every name at a different x, and
                right-aligning the names instead would ragged-edge a list whose
                entries are 19 to 25 characters long. */}
            <dt className="w-16 shrink-0 tabular-nums text-gray-500">
              {tier.range}
              {hidePercent ? "" : "%"}
            </dt>
            <dd className="text-gray-600">{tier.label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3b. Prediction summary
// ---------------------------------------------------------------------------

// Prose stand-in for the numbers a binary board hides: what the model predicts,
// how far the day sits from this beach's cutoff, how the beach has tested over
// its whole record, and what the next few days look like. Text is built in
// lib/summary.ts from published values only.
function PredictionSummary({ paragraphs }: { paragraphs: string[] }) {
  if (paragraphs.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-gray-500">
        What we&rsquo;re seeing
      </p>
      {paragraphs.map((text, i) => (
        <p key={i} className="text-sm leading-relaxed text-gray-700">
          {text}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. 7-day window
// ---------------------------------------------------------------------------

function SevenDayWindow({
  cells,
  selectedDate,
  onSelect,
  hidePercent,
  binaryVerdict,
  readout,
  title,
}: {
  cells: WindowCell[];
  selectedDate: string;
  onSelect: (date: string) => void;
  hidePercent: boolean;
  // What a cell says: its band ("Moderate") or its number ("34%"). The card
  // shows one of each, the band copy up with the scale bar where the week is
  // read at a glance, the number copy down in Behind the Prediction. Ignored on
  // a binary board, which writes its own verdict into every cell.
  readout: "band" | "percent";
  // null drops the heading entirely. The copy inside Behind the Prediction
  // takes that: it sits under the key it is keyed to, in a panel whose own
  // heading already frames everything in it, so naming it again would caption a
  // strip the reader is already looking at.
  title?: string | null;
  // Binary boards write the Good/Poor call into each day cell and colour it to
  // match. No number: a percentage here would contradict a board built to hide
  // it, and a bare coloured bar leaves the reader decoding a legend.
  binaryVerdict: boolean;
}) {
  if (cells.length === 0) return null;

  const totalCols = cells.length;
  const pastCount = cells.filter((c) => c.type === "past").length;
  const forecastCount = cells.filter((c) => c.type === "forecast").length;
  const todayCount = cells.filter((c) => c.type === "today").length;

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))`,
    gap: "4px",
  } as const;

  return (
    <div>
      {title !== null && (
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
          {title ?? `${cells.length}-Day Window`}
        </p>
      )}

      <div style={gridStyle}>
        {cells.map(({ day, type }) => {
          // Withheld from the payload, not hidden with CSS — there is no
          // reading here to reveal (see lib/paywall.ts). Rendered as its own
          // branch before anything reads day.status or day.probability, which
          // on a locked day are placeholders rather than this beach's values.
          //
          // Not a button: a cell that cannot be opened must not invite the
          // press. The upsell under the strip is what takes the click.
          if (day.locked) {
            return (
              <div
                key={day.date}
                className="flex w-full flex-col items-center gap-1"
              >
                <span className="text-[11px] text-gray-400">
                  {weekdayShort(day.date)}
                </span>
                <div
                  className="flex h-7 w-full items-center justify-center rounded-sm border border-dashed border-gray-300 bg-gray-100"
                  title="Locked — available with Neptune Pro"
                >
                  <Lock className="h-3 w-3 text-gray-400" aria-hidden="true" />
                  <span className="sr-only">
                    {weekdayShort(day.date)}: locked, available with Neptune Pro
                  </span>
                </div>
              </div>
            );
          }

          const isSelected = day.date === selectedDate;
          const dayLabelClass =
            type === "today"
              ? "text-blue-600 font-medium"
              : type === "past"
                ? "text-gray-400"
                : "text-gray-500";
          const opacity = type === "past" ? "opacity-55" : "opacity-100";
          const selectedOutline = isSelected
            ? "outline outline-2 outline-blue-500"
            : "";
          const pct = Math.round(day.probability * 100);
          // Each day is scored against its own cutoff — Boston's model re-tunes
          // the threshold per forecast horizon.
          const verdict = binaryVerdict ? (day.verdict ?? null) : null;
          // The tooltip and screen-reader text, which name the band AND the
          // number whichever the cell itself is showing.
          const cellSummary =
            verdict ?? `${STATUS_LABEL[day.status]} · ${pct}%`;

          return (
            <button
              type="button"
              key={day.date}
              onClick={() => onSelect(day.date)}
              aria-pressed={isSelected}
              title={`${weekdayShort(day.date)} · ${cellSummary}`}
              aria-label={`View ${day.date}: ${cellSummary}`}
              className="flex w-full flex-col items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <span className={`text-[11px] ${dayLabelClass}`}>
                {weekdayShort(day.date)}
              </span>
              <div
                className={`h-7 w-full overflow-hidden rounded-sm flex items-center justify-center transition-all ${opacity} ${selectedOutline} ${
                  isSelected
                    ? ""
                    : "hover:outline hover:outline-1 hover:outline-blue-300"
                }`}
                style={{
                  backgroundColor: verdict
                    ? VERDICT_CELL_COLOR[verdict]
                    : // Rounded, like every other classification on the
                      // board. This used to compare the raw fraction against
                      // the same boundaries, so a day at 0.2968 was "30%" in
                      // the tooltip and "Moderate" in the word, while 29.68
                      // fell under 30 here and painted the cell green. Reusing
                      // riskTier also drops a second copy of the palette that
                      // had to agree with RISK_TIERS by hand.
                      riskTier(pct).color,
                }}
              >
                {verdict ? (
                  // Two spans rather than one truncated label: a clipped
                  // "Moderat" would read as a rendering bug, and display:none
                  // keeps the hidden one out of the accessibility tree so a
                  // screen reader hears the word once, not twice.
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: VERDICT_CELL_TEXT[verdict] }}
                  >
                    <span className="sm:hidden">
                      {VERDICT_CELL_SHORT[verdict]}
                    </span>
                    <span className="hidden sm:inline">{verdict}</span>
                  </span>
                ) : readout === "band" ? (
                  // Same two-span treatment as the verdict cells above, and for
                  // the same reason: a clipped "Moderat" reads as a bug, and
                  // display:none keeps the hidden copy out of the accessibility
                  // tree so a screen reader hears the word once.
                  <span
                    className="text-[10px] font-semibold"
                    style={{ color: STATUS_BAND_TEXT[day.status] }}
                  >
                    <span className="sm:hidden">
                      {STATUS_BAND[day.status].abbr}
                    </span>
                    <span className="hidden sm:inline">
                      {STATUS_BAND[day.status].short}
                    </span>
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-gray-900">
                    {pct}
                    {hidePercent ? "" : "%"}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2" style={gridStyle}>
        {pastCount > 0 && (
          <span
            className="text-[10px] uppercase tracking-wide text-gray-400 text-center"
            style={{ gridColumn: `span ${pastCount}` }}
          >
            Past
          </span>
        )}
        {todayCount > 0 && (
          <span
            className="text-[10px] uppercase tracking-wide text-blue-600 font-medium text-center"
            style={{ gridColumn: `span ${todayCount}` }}
          >
            Today
          </span>
        )}
        {forecastCount > 0 && (
          <span
            className="text-[10px] uppercase tracking-wide text-gray-400 text-center"
            style={{ gridColumn: `span ${forecastCount}` }}
          >
            Forecast
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export default function BeachCard({
  beach,
  locationLabel,
  features,
}: {
  beach: BeachData;
  locationLabel: string;
  features: FeatureFlags;
}) {
  const cells = buildWindowCells(beach);
  // Which day's snapshot the card is displaying — defaults to today's nowcast.
  const [selectedDate, setSelectedDate] = useState(beach.predictionDate);
  const activeCell =
    cells.find((c) => c.day.date === selectedDate) ??
    cells.find((c) => c.type === "today") ??
    cells[0];
  const activeDay = activeCell.day;

  const verdict = features.binaryVerdict ? (activeDay.verdict ?? null) : null;

  // On a locked beach the summary arrives pre-built from the server: the
  // drivers buildSummary writes from are exactly what the paywall withholds,
  // so it cannot be composed here any more (see lib/paywall.ts). It also comes
  // without its closing "the next few days..." sentence, which would otherwise
  // narrate the forecast this beach has just locked.
  const summary = beach.locked
    ? (beach.summary ?? [])
    : features.predictionSummary
      ? buildSummary({
          // proseName, not name: on a board whose roster appends a town to keep
          // tab labels apart, the sentence drops it; on one whose names carry the
          // street, the sentence keeps it.
          name: beach.proseName,
          verdict: activeDay.verdict ?? null,
          date: activeDay.date,
          // "past" | "today" | "forecast" — the cell type already carries it, and
          // the summary needs it for tense, not just for the outlook.
          timeframe: activeCell.type,
          noRecentSample: beach.noRecentSample,
          // Each day explains itself with its OWN conditions: a forecast day's
          // drivers are that day's forecast weather, not today's.
          drivers: activeDay.drivers ?? beach.drivers,
          conditions: activeDay.conditions ?? beach.conditions,
          forecast: beach.forecast,
          // Speak in whichever read this card actually rendered. `verdict` above
          // is null unless binaryVerdict is on, so on every other board the
          // summary would otherwise describe a Good/Moderate/Poor call the reader
          // cannot see and which disagrees with the tier they can — a 34% day is
          // "Good" against a 50% cutoff but "Slightly elevated" on the shared
          // scale. Passing the tier keeps the paragraph and the label agreeing.
          status: features.binaryVerdict ? null : activeDay.status,
        })
      : [];

  // Two copies of one week, differing only in what each cell says. Both drive
  // the same selectedDate, so whichever a reader taps, the other follows and the
  // card explains the day they picked.
  //
  // The split is which question is being asked. Up by the bar, the week is
  // scanned: bands answer "which days are worth avoiding" in one pass, where a
  // row of two-digit numbers has to be read and ranked first. In Behind the
  // Prediction, where a reader has gone looking for the workings, the numbers
  // are the point.
  const dayWindowProps = {
    cells,
    selectedDate,
    onSelect: setSelectedDate,
    hidePercent: features.hidePercentSign,
    binaryVerdict: features.binaryVerdict,
  };
  const bandWindow = <SevenDayWindow {...dayWindowProps} readout="band" />;
  const percentWindow = (
    <SevenDayWindow {...dayWindowProps} readout="percent" title={null} />
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-6 sm:px-10 py-10">
      <div className="space-y-6">
        <LocationHeader
          beach={beach}
          locationLabel={locationLabel}
          binaryVerdict={features.binaryVerdict}
        />

        {/* Above the status read on boards that opt in. The window is the
            reason a reader opened the card - today's call is one cell of it,
            and they can see that cell without scrolling either way. Rendered
            from one variable so the two orders cannot drift into two different
            day strips. */}
        {features.forecastWindowFirst && bandWindow}

        <div className="space-y-3">
          <StatusHero
            status={activeDay.status}
            verdict={verdict}
            probability={activeDay.probability}
            showIndex={features.neptuneIndex}
            when={
              features.binaryVerdict && activeCell.type !== "today"
                ? `on ${weekdayLong(activeDay.date)}`
                : undefined
            }
          />
          {/* The tier scale is calibrated to cutoffs at 30/50/75%. A binary
              board's cutoffs sit well below that, so the bar and its legend
              would describe a scale this beach is not measured on. */}
          {!features.binaryVerdict && (
            <ExceedanceBar probability={activeDay.probability} />
          )}
        </div>

        {/* Directly under the bar. The bar shows where today sits on the scale
            and the week shows the shape either side of it, so the two read as
            one picture; the figures that used to sit between them are in Behind
            the Prediction now. */}
        {!features.forecastWindowFirst && bandWindow}

        {/* Below the window on purpose. The window is the shape of the week and
            the thing a reader scans first; the summary explains the day they
            land on, so it reads as a caption to the selection rather than as a
            preamble to it. On a forecastWindowFirst board the window is already
            above the status read, so this is where the summary sits either
            way. */}
        <PredictionSummary paragraphs={summary} />

        {/* A locked beach has no drivers, conditions, lab sample or accuracy
            record to show — they were stripped server-side, not hidden — so
            the panel is replaced rather than emptied. WhyPrediction given
            nothing renders nothing, which would read as a board with no
            explanation rather than one with a paid explanation. */}
        {beach.locked ? (
          <PaywallNotice />
        ) : (
          <WhyPrediction
            figures={
              features.binaryVerdict ? null : (
                <div className="space-y-6">
                  <ExceedanceDetail
                    probability={activeDay.probability}
                    hidePercent={features.hidePercentSign}
                    hideReadout={features.hideExceedanceReadout}
                  />
                  {percentWindow}
                </div>
              )
            }
            factors={activeDay.factors ?? []}
            drivers={activeDay.drivers ?? beach.drivers}
            // Same fallback as drivers just above: each day explains itself with
            // its own weather, so a forecast day's rain depth is that day's
            // forecast rain and not today's.
            conditions={activeDay.conditions ?? beach.conditions}
            lastResult={activeDay.lastResult ?? null}
            daysSinceSample={activeDay.daysSinceSample ?? null}
            predictionDate={activeDay.date}
            accuracy={beach.accuracy}
            hidePercent={features.hidePercentSign}
            hideContributingFactors={features.hideContributingFactors}
            showAccuracyPercent={features.siteAccuracyPercent}
          />
        )}
      </div>
    </div>
  );
}
