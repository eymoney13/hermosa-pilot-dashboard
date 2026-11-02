"use client";

import LegacyForecastAccuracy from "./LegacyForecastAccuracy";
import { useId, useState } from "react";
import { Check, ChevronDown, Lock, Target, X } from "lucide-react";
import { accuracyPercent, EPA_MPN_THRESHOLD, formatMonthDayYear, riskTier, type Accuracy } from "@/lib/data";

function DailyForecastAccuracy({ accuracy, showOverallPercent = false, locked = false }: {
  accuracy: Accuracy;
  hidePercent: boolean;
  showOverallPercent?: boolean;
  locked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const pct = showOverallPercent ? accuracyPercent(accuracy) : null;
  const header = <>
    <span className="flex items-start gap-2.5 min-w-0">
      <Target className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
      <span>
        <span className="block text-sm text-gray-700">Forecast confidence{pct !== null ? `: ${pct}%` : ""}</span>
        <span className="block text-xs text-gray-500">{accuracyPercent(accuracy) !== null ? `Based on ${accuracy.totalSamples.toLocaleString()} historical observations.` : "Not enough lab samples yet to report accuracy"}</span>
      </span>
    </span>
    {locked ? <Lock className="h-4 w-4 text-gray-400" aria-hidden="true" /> : <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />}
  </>;
  return <div className="rounded-lg border border-gray-100">
    {locked ? <div className="px-3 py-2.5 flex justify-between gap-3">{header}</div> : <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={panelId} className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-gray-50/60 rounded-lg">{header}</button>}
    {open && !locked && <div id={panelId} className="px-3 pb-3 pt-1">
      <p className="text-sm font-medium text-gray-800">Last 10 days</p>
      <p className="mt-1 mb-3 text-xs text-gray-500">The 10 days before today, with lab results on the day each sample was taken.</p>
      {accuracy.dailyHistory?.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs">
        <thead><tr className="border-b border-gray-200 text-gray-500"><th scope="col" className="py-2 pr-3 font-medium">Date</th><th scope="col" className="py-2 pr-3 font-medium">Our prediction</th><th scope="col" className="py-2 pr-3 font-medium">Lab sample</th><th scope="col" className="py-2 font-medium">Forecast comparison</th></tr></thead>
        <tbody>{accuracy.dailyHistory.map((day) => {
          const percent = day.probability === null ? null : Math.round(day.probability * 100);
          const tier = percent === null ? null : riskTier(percent);
          return <tr key={day.date} className="border-b border-gray-100 last:border-0">
            <th scope="row" className="py-3 pr-3 font-normal whitespace-nowrap text-gray-600">{formatMonthDayYear(day.date)}</th>
            <td className="py-3 pr-3 font-medium" style={{ color: tier?.textColor }}>{tier ? `${tier.label.replace(" bacteria levels", "")} · ${percent}%` : <span className="font-normal text-gray-400">Unavailable</span>}</td>
            <td className="py-3 pr-3">{day.samples.length ? day.samples.map((sample, index) => <div key={index} className="space-y-1">
              <span className="block font-medium" style={{ color: sample.labMpn > EPA_MPN_THRESHOLD ? "#b42318" : sample.labMpn > 35 ? "#6B5F0E" : "#2d8a4e" }}>{sample.labMpn > EPA_MPN_THRESHOLD ? "High bacteria" : sample.labMpn > 35 ? "Moderate bacteria" : "Low bacteria"}</span>
            </div>) : <span className="text-gray-400">No sample taken</span>}</td>
            <td className="py-3 text-gray-600">{day.samples.length ? day.samples.map((sample, index) => <span key={index} className="flex items-start gap-1.5">
              {sample.match ? <Check size={13} className="mt-0.5 shrink-0" aria-hidden="true" /> : <X size={13} className="mt-0.5 shrink-0" aria-hidden="true" />}
              {sample.match
                ? ((sample.predictedExceedance < 30 && sample.labMpn > 35 && sample.labMpn <= EPA_MPN_THRESHOLD)
                  || (sample.predictedExceedance >= 30 && sample.predictedExceedance < 50 && sample.labMpn <= 35))
                  ? "Agreed on below-limit conditions"
                  : "Prediction matched"
                : sample.predictedUnsafe ? "Predicted higher risk" : "Predicted lower risk"}
            </span>) : <span className="text-gray-400">—<span className="sr-only"> No comparison available</span></span>}</td>
          </tr>;
        })}</tbody>
      </table></div> : <p className="text-xs text-gray-500">Daily prediction history is unavailable.</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-gray-400">Percentages show the predicted chance of unsafe bacteria levels. A match means our risk call agreed with the lab result relative to the EPA threshold of 104 MPN/100mL. Forecast comparisons are shown only when a lab sample was taken that day.</p>
    </div>}
  </div>;
}

export default function ForecastAccuracy(props: Parameters<typeof DailyForecastAccuracy>[0]) {
  return props.accuracy.dailyHistory
    ? <DailyForecastAccuracy {...props} />
    : <LegacyForecastAccuracy {...props} />;
}
