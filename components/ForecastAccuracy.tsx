"use client";

import { useState } from "react";
import { ChevronDown, Target } from "lucide-react";
import { ACCURACY_MIN_SAMPLES, formatMonthDay, type Accuracy } from "@/lib/data";

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

export default function ForecastAccuracy({ accuracy }: { accuracy: Accuracy }) {
  const [open, setOpen] = useState(false);
  const { windowSize, matches, samples } = accuracy;
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
                  role="img"
                  aria-label={stripAriaLabel}
                  className="flex flex-wrap gap-1.5"
                >
                  {samples.map((s) => (
                    <span
                      key={s.date}
                      title={`${formatMonthDay(s.date)} — ${
                        s.match ? "matched" : "missed"
                      }`}
                      className="h-[22px] w-[22px] rounded-full"
                      style={{
                        backgroundColor: s.match ? MATCH_COLOR : MISS_COLOR,
                      }}
                    />
                  ))}
                </div>
                {samples.length > 0 && (
                  <div className="mt-1.5 flex justify-between text-[11px] text-gray-400">
                    <span>{monthAbbr(samples[0].date)}</span>
                    <span>{monthAbbr(samples[samples.length - 1].date)}</span>
                  </div>
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
