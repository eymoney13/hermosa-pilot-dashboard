"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import {
  subtractDays,
  type Accuracy,
  type Driver,
  type FactorDirection,
} from "@/lib/data";
import {
  DIRECTION_STYLE,
  directionsByFactor,
  factorEffect,
} from "@/lib/factorEffects";
import { labSampleSentence } from "@/lib/insight";
import ForecastAccuracy from "./ForecastAccuracy";

// "May 7, 2026" style. lib/data's formatLongDate includes the weekday;
// here we want a more compact form for the inline metadata line.
function formatSampleDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// "Taken N days ago · <date>" relative to the day being viewed. predictionDate
// is the selected day's date, so a past day shows the sample that was latest
// as of that date, not a future one.
function sampleMetadataFor(
  daysSinceSample: number | null,
  predictionDate: string
): string | null {
  if (daysSinceSample == null) return null;
  const formatted = formatSampleDate(
    subtractDays(predictionDate, daysSinceSample)
  );
  let prefix: string;
  if (daysSinceSample === 0) prefix = "Taken today";
  else if (daysSinceSample === 1) prefix = "Taken 1 day ago";
  else prefix = `Taken ${daysSinceSample} days ago`;
  return `${prefix} · ${formatted}`;
}

// The arrow beside a factor, pointing the way that factor is taking water
// quality: red up for worse, green down for cleaner. Nothing renders for a
// factor whose direction the backend did not publish, since the same factor
// reads both ways on different days and a guessed arrow would be a coin flip
// drawn as a fact.
function DirectionArrow({
  direction,
}: {
  direction: FactorDirection | undefined;
}) {
  if (!direction) return null;
  const { arrow, color, label } = DIRECTION_STYLE[direction];
  const Icon = arrow === "up" ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center">
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        style={{ color }}
        strokeWidth={2.5}
        aria-hidden="true"
      />
      {/* Colour and arrow direction are the whole of the visual signal, which
          leaves out screen-reader users and anyone who cannot tell the red from
          the green. The words carry the same meaning for them. */}
      <span className="sr-only">{label}</span>
    </span>
  );
}

// Matches the duration-[250ms] on the panel below. Tailwind needs that as a
// literal class, so the two cannot share one constant; keep them in step.
const PANEL_TRANSITION_MS = 250;

export default function WhyPrediction({
  figures,
  factors,
  drivers,
  lastResult,
  daysSinceSample,
  predictionDate,
  accuracy,
  hidePercent,
  hideContributingFactors = false,
  showAccuracyPercent = false,
}: {
  // Everything that sits above the contributing factors in this panel: the
  // probability readout, the risk key, and the week by the numbers. Passed as a
  // node rather than rebuilt here, because the tier palette, the band copy, the
  // percentage formatting and the day strip all live in BeachCard, and
  // splitting them across two files to move a block down the page would have
  // been the expensive way to do it.
  figures?: ReactNode;
  factors: string[];
  // The same ranking as `factors`, carrying the direction the model gave each
  // one. Supplies the "how" under each listed factor.
  drivers: Driver[];
  lastResult: number | string | null;
  daysSinceSample: number | null;
  predictionDate: string;
  accuracy: Accuracy;
  hidePercent: boolean;
  // Passed straight through: whether the accuracy panel leads with this site's
  // whole-record percentage (see FeatureFlags.siteAccuracyPercent).
  showAccuracyPercent?: boolean;
  // Boards whose written summary already explains the drivers in prose, where a
  // ranked list of the same feature names underneath adds nothing.
  hideContributingFactors?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // True only once the expand animation has finished. The panel has to clip
  // while it is collapsed and while it is moving, or the content spills out of
  // a row that is still shorter than it is. But clipping a panel that has
  // finished opening also clips anything trying to escape it, and the
  // probability readout's tooltip opens upward from the very first row: on
  // desktop it is absolutely positioned, so it was drawn straight into the
  // clipped region and never appeared. Mobile pins the same tooltip with
  // position:fixed, which ignores clipping ancestors, which is why it worked
  // there and only there.
  const [expanded, setExpanded] = useState(false);

  // Driven by a timer rather than by transitionend, which only fires if the
  // transition actually runs. It does not in a backgrounded tab, and not at all
  // in a browser that cannot interpolate grid-template-rows, and either case
  // would leave the panel clipped for good and the tooltip invisible with no
  // way back. A timer always fires, and being early or late by a frame costs
  // nothing: the worst case is that the clip lifts slightly before the row has
  // finished growing.
  // Only ever schedules the unclip. Re-clipping happens in the toggle below,
  // where it is an event and not a cascading render.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setExpanded(true), PANEL_TRANSITION_MS);
    return () => clearTimeout(t);
  }, [open]);
  const sampleMeta = sampleMetadataFor(daysSinceSample, predictionDate);
  const labSentence = labSampleSentence(lastResult);
  const directions = directionsByFactor(drivers);

  // With the factors hidden and no lab sample to report, the disclosure would
  // be a toggle guarding a single card, under a heading describing content that
  // is no longer there. So the accuracy panel stands on its own.
  //
  // Note this deliberately does NOT fall through to the early return below.
  // That return exists for days with nothing to show, and reaching it here would
  // take the accuracy panel out with the factors, the opposite of the intent.
  if (hideContributingFactors && !labSentence && !figures) {
    return (
      <div className="border-t border-gray-100 pt-6">
        <ForecastAccuracy
          accuracy={accuracy}
          hidePercent={hidePercent}
          showOverallPercent={showAccuracyPercent}
        />
      </div>
    );
  }

  // Forecast/future days have no saved factors or lab sample. The figures still
  // has something to say about them, though, so it alone keeps the panel alive:
  // returning null here would take the probability and the key off a forecast
  // day entirely, which is not a move of the block but a loss of it.
  if (factors.length === 0 && !labSentence && !figures) return null;

  return (
    <div className="border-t border-gray-100">
      <button
        type="button"
        onClick={() => {
          // Clip again the moment a collapse starts, not when it ends.
          setExpanded(false);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-controls="why-prediction-panel"
        className="w-full py-3 flex justify-between items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <span>Behind the Prediction</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        id="why-prediction-panel"
        className="grid transition-[grid-template-rows] duration-[250ms] ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        aria-hidden={!open}
      >
        {/* grid-rows 0fr/1fr collapse: animates cleanly regardless of content
            height, so the nested Forecast-accuracy card can expand without
            being clipped (a fixed max-height could not accommodate it). */}
        <div className={expanded ? "overflow-visible" : "overflow-hidden"}>
          <div className="pb-5 space-y-6">
            {figures}

            {!hideContributingFactors && factors.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                  Top contributing factors
                </p>
                <ol className="space-y-3 text-sm text-gray-700">
                  {factors.map((factor, i) => {
                    // Explanation sits under its own factor rather than in one
                    // list further down, so a reader never has to count rows to
                    // work out which line belongs to which name.
                    const direction = directions.get(factor);
                    const effect = factorEffect(factor, direction);
                    return (
                      <li key={`${factor}-${i}`} className="flex gap-3">
                        <span className="text-gray-400 tabular-nums">
                          {i + 1}.
                        </span>
                        <span>
                          <span className="inline-flex items-center gap-1.5">
                            <span>{factor}</span>
                            <DirectionArrow direction={direction} />
                          </span>
                          {effect && (
                            <span className="mt-1 flex gap-2 text-gray-500">
                              <span aria-hidden="true">&bull;</span>
                              <span>{effect}</span>
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {labSentence && (
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                  Latest Lab Sample Result
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {labSentence}
                </p>
                {sampleMeta && (
                  <p className="text-xs text-gray-400 mt-1">{sampleMeta}</p>
                )}
              </div>
            )}

            <ForecastAccuracy
          accuracy={accuracy}
          hidePercent={hidePercent}
          showOverallPercent={showAccuracyPercent}
        />
          </div>
        </div>
      </div>
    </div>
  );
}
