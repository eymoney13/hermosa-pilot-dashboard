import type { BeachData } from "@/lib/data";

function formatLastResult(value: number | string | null): string {
  if (value == null) return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return String(value);
}

function SampleStats({ beach }: { beach: BeachData }) {
  const mpnValue = beach.mpnLabel?.trim() ? beach.mpnLabel : "—";

  let sampleValue: string;
  let sampleSecondary: string | undefined;
  if (beach.daysSinceSample == null) {
    sampleValue = "—";
  } else if (beach.lastResult == null) {
    sampleValue = "No recent sample";
  } else {
    const d = beach.daysSinceSample;
    sampleValue = d === 1 ? "1 day ago" : `${d} days ago`;
    sampleSecondary = `${formatLastResult(beach.lastResult)} MPN/100mL`;
  }

  return (
    <div className="grid grid-cols-2 gap-8 sm:gap-12">
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          Estimated MPN
        </p>
        <p className="text-2xl sm:text-3xl font-semibold text-gray-900 leading-tight">
          {mpnValue}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          Last sample
        </p>
        <p className="text-2xl sm:text-3xl font-semibold text-gray-900 leading-tight">
          {sampleValue}
        </p>
        {sampleSecondary && (
          <p className="text-sm text-gray-600">{sampleSecondary}</p>
        )}
      </div>
    </div>
  );
}

export default function Details({ beach }: { beach: BeachData }) {
  return (
    <section className="w-full bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-2xl px-6 sm:px-10 flex flex-col gap-12">
        <SampleStats beach={beach} />

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
              Assessment
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              {beach.insight}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
