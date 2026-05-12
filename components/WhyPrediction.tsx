"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { subtractDays, type BeachData } from "@/lib/data";

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

function sampleMetadataFor(beach: BeachData): string | null {
  const days = beach.daysSinceSample;
  if (days == null) return null;
  const formatted = formatSampleDate(subtractDays(beach.predictionDate, days));
  let prefix: string;
  if (days === 0) prefix = "Taken today";
  else if (days === 1) prefix = "Taken 1 day ago";
  else prefix = `Taken ${days} days ago`;
  return `${prefix} · ${formatted}`;
}

export default function WhyPrediction({ beach }: { beach: BeachData }) {
  const [open, setOpen] = useState(false);
  const sampleMeta = sampleMetadataFor(beach);

  return (
    <div className="border-t border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="why-prediction-panel"
        className="w-full py-3 flex justify-between items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <span>Behind the prediction</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        id="why-prediction-panel"
        className="overflow-hidden transition-[max-height] duration-[250ms] ease-out"
        style={{ maxHeight: open ? "400px" : "0px" }}
        aria-hidden={!open}
      >
        <div className="pb-5 space-y-6">
          {beach.factors.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                Top contributing factors
              </p>
              <ol className="space-y-1.5 text-sm text-gray-700">
                {beach.factors.map((factor, i) => (
                  <li key={`${factor}-${i}`} className="flex gap-3">
                    <span className="text-gray-400 tabular-nums">{i + 1}.</span>
                    <span>{factor}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {beach.insight && (
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                Last Test Result
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {beach.insight}
              </p>
              {sampleMeta && (
                <p className="text-xs text-gray-400 mt-1">{sampleMeta}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
