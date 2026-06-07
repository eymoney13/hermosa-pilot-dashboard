"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { subtractDays, type Accuracy } from "@/lib/data";
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
// as of that date — not a future one.
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

export default function WhyPrediction({
  factors,
  insight,
  daysSinceSample,
  predictionDate,
  accuracy,
}: {
  factors: string[];
  insight: string;
  daysSinceSample: number | null;
  predictionDate: string;
  accuracy: Accuracy;
}) {
  const [open, setOpen] = useState(false);
  const sampleMeta = sampleMetadataFor(daysSinceSample, predictionDate);

  // Forecast/future days have no saved factors or lab sample — nothing to show.
  if (factors.length === 0 && !insight) return null;

  return (
    <div className="border-t border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
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
        <div className="overflow-hidden">
          <div className="pb-5 space-y-6">
            {factors.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                  Top contributing factors
                </p>
                <ol className="space-y-1.5 text-sm text-gray-700">
                  {factors.map((factor, i) => (
                    <li key={`${factor}-${i}`} className="flex gap-3">
                      <span className="text-gray-400 tabular-nums">
                        {i + 1}.
                      </span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {insight && (
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                  Latest Lab Sample Result
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {insight}
                </p>
                {sampleMeta && (
                  <p className="text-xs text-gray-400 mt-1">{sampleMeta}</p>
                )}
              </div>
            )}

            <ForecastAccuracy accuracy={accuracy} />
          </div>
        </div>
      </div>
    </div>
  );
}
