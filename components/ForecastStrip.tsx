import type { BeachData, ForecastDay } from "@/lib/data";
import { formatShortDate } from "@/lib/data";

function DayCell({ day }: { day: ForecastDay }) {
  const isLow = day.status === "Low Bacteria";
  const dotColor = isLow ? "bg-[#2d8a4e]" : "bg-[#cc3333]";
  const labelColor = isLow ? "text-[#2d8a4e]" : "text-[#cc3333]";
  const pct = Math.round(day.probability * 100);

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <p className="text-xs text-gray-500">{formatShortDate(day.date)}</p>
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
        <p className={`text-sm font-medium ${labelColor}`}>{day.status}</p>
      </div>
      <p className="text-xs text-gray-500 tabular-nums">{pct}% probability</p>
    </div>
  );
}

export default function ForecastStrip({ beach }: { beach: BeachData }) {
  if (beach.forecast.length === 0) return null;
  return (
    <section className="w-full bg-gray-50 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl px-6 sm:px-10">
        <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-8">
          3-Day Forecast
        </h2>
        <div className="grid grid-cols-3 gap-6 sm:gap-10">
          {beach.forecast.map((day) => (
            <DayCell key={day.date} day={day} />
          ))}
        </div>
      </div>
    </section>
  );
}
