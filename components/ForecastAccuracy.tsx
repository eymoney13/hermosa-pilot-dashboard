"use client";

import { useState } from "react";
import { Check, ChevronDown, Target, X } from "lucide-react";
import {
  ACCURACY_MIN_SAMPLES,
  EPA_MPN_THRESHOLD,
  formatMonthDayYear,
  type Accuracy,
  type AccuracySample,
} from "@/lib/data";

const MATCH_COLOR = "#2d8a4e"; // green — the forecast call agreed with the lab
const MISS_COLOR = "#cc3333"; // red — the forecast call disagreed with the lab

// Month abbreviation ("Mar") for the sparse end-labels under the dot strip.
// Lab samples are irregularly spaced, so we label only the ends — never a
// continuous date axis.
function monthAbbr(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
  });
}

// Detail for the tapped dot — the lab result, our forecast call, and the
// outcome. Renders directly below the dot strip.
function SampleDetail({ sample }: { sample: AccuracySample }) {
  const actualUnsafe = sample.labMpn > EPA_MPN_THRESHOLD;
  return (
    <div className="mt-2 rounded-md bg-gray-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-900">
          {formatMonthDayYear(sample.date)}
        </span>
        <span
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: sample.match ? MATCH_COLOR : MISS_COLOR }}
        >
          {sample.match ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {sample.match ? "Matched" : "Missed"}
        </span>
      </div>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Lab result</dt>
          <dd className="text-right text-gray-800">
            {sample.labMpn} MPN/100mL · {actualUnsafe ? "above" : "below"}{" "}
            threshold
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Our forecast</dt>
          <dd className="text-right text-gray-800">
            {sample.predictedExceedance}% ·{" "}
            {sample.predictedUnsafe ? "predicted exceedance" : "predicted safe"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function ForecastAccuracy({ accuracy }: { accuracy: Accuracy }) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { windowSize, matches, samples } = accuracy;
  const selectedSample = samples.find((s) => s.date === selectedDate) ?? null;
  const enough = windowSize >= ACCURACY_MIN_SAMPLES;
  const misses = windowSize - matches;

  const summaryLine = enough
    ? `Matched lab results in ${matches} of ${windowSize} recent samples`
    : "Not enough lab samples yet to report accuracy";

  // Primary signal for screen readers — never color alone.
  const stripAriaLabel = `${windowSize} recent lab samples: ${matches} matched the forecast, ${misses} did not.`;

  return (
    <div className="rounded-lg border border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="forecast-accuracy-panel"
        className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-gray-50/60 rounded-lg transition-colors"
      >
        <span className="flex items-start gap-2.5 min-w-0">
          <Target
            className="h-4 w-4 mt-0.5 shrink-0 text-gray-400"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block text-sm text-gray-700">
              Forecast accuracy
            </span>
            <span className="block text-xs text-gray-500">{summaryLine}</span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        id="forecast-accuracy-panel"
        className="grid transition-[grid-template-rows] duration-[250ms] ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        aria-hidden={!open}
      >
        <div className="overflow-hidden">
          {enough ? (
            <div className="px-3 pb-3 pt-1 space-y-3">
              <p className="text-sm text-gray-700 leading-relaxed">
                Our daily forecast matched the official lab result in{" "}
                <strong className="font-semibold text-gray-900">
                  {matches} of the last {windowSize}
                </strong>{" "}
                samples.
              </p>

              <div>
                <div
                  role="group"
                  aria-label={stripAriaLabel}
                  className="flex flex-wrap gap-1.5"
                >
                  {samples.map((s) => {
                    const isSelected = s.date === selectedDate;
                    return (
                      <button
                        type="button"
                        key={s.date}
                        onClick={() =>
                          setSelectedDate((cur) =>
                            cur === s.date ? null : s.date
                          )
                        }
                        aria-pressed={isSelected}
                        aria-label={`${formatMonthDayYear(s.date)}: lab ${
                          s.labMpn
                        } MPN per 100mL, ${
                          s.predictedUnsafe
                            ? "predicted exceedance"
                            : "predicted safe"
                        }, ${s.match ? "matched" : "missed"}`}
                        className={`h-[22px] w-[22px] rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                          isSelected ? "ring-2 ring-offset-1 ring-gray-800" : ""
                        }`}
                        style={{
                          backgroundColor: s.match ? MATCH_COLOR : MISS_COLOR,
                        }}
                      />
                    );
                  })}
                </div>
                {samples.length > 0 && (
                  <div className="mt-1.5 flex justify-between text-[11px] text-gray-400">
                    <span>{monthAbbr(samples[0].date)}</span>
                    <span>{monthAbbr(samples[samples.length - 1].date)}</span>
                  </div>
                )}

                {selectedSample ? (
                  <SampleDetail sample={selectedSample} />
                ) : (
                  <p className="mt-2 text-xs text-gray-400">
                    Tap a dot for details.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: MATCH_COLOR }}
                    aria-hidden="true"
                  />
                  Matched lab
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: MISS_COLOR }}
                    aria-hidden="true"
                  />
                  Missed
                </span>
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                A match means our risk call agreed with whether the lab result
                was above or below the EPA threshold of 104 MPN/100mL.
              </p>
            </div>
          ) : (
            <div className="px-3 pb-3 pt-1">
              <p className="text-sm text-gray-500">
                Not enough lab samples yet to report accuracy.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
