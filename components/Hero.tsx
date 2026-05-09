import type { BeachData } from "@/lib/data";

const STATUS_BG: Record<string, string> = {
  "Low Bacteria": "bg-[#e8f5ee]",
  "High Bacteria": "bg-[#fce8e8]",
};

const STATUS_TEXT: Record<string, string> = {
  "Low Bacteria": "text-[#2d8a4e]",
  "High Bacteria": "text-[#cc3333]",
};

function ProbabilityBar({
  probability,
  threshold,
}: {
  probability: number;
  threshold: number;
}) {
  const probClamped = Math.max(0, Math.min(1, probability));
  const thresholdClamped = Math.max(0, Math.min(1, threshold));
  const pct = Number((probClamped * 100).toFixed(0));
  const thresholdPct = thresholdClamped * 100;
  const isLow = probClamped < thresholdClamped;
  const dotColor = isLow ? "#2d8a4e" : "#cc3333";

  // Soft ±5% blend zone centered on the threshold, clamped to [0, 100].
  const blendStart = Math.max(0, thresholdPct - 5);
  const blendEnd = Math.min(100, thresholdPct + 5);
  const gradient = `linear-gradient(to right, rgba(45,138,78,0.7) 0%, rgba(45,138,78,0.7) ${blendStart}%, rgba(204,51,51,0.7) ${blendEnd}%, rgba(204,51,51,0.7) 100%)`;

  return (
    <div className="w-full mt-4 sm:mt-6">
      {/* Bar + dot */}
      <div className="relative h-10">
        <div
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full"
          style={{ background: gradient }}
        />
        <div
          className="absolute top-1/2 h-[14px] w-[14px] rounded-full border-2 border-white"
          style={{
            left: `${pct}%`,
            transform: "translate(-50%, -50%)",
            backgroundColor: dotColor,
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />
      </div>

      {/* Probability caption — anchored to the dot, but clamped within the bar so it never overflows on narrow screens. Wraps if the box is too narrow. */}
      <p
        className="text-sm text-gray-600 text-center mt-2"
        style={{
          marginLeft: `max(0px, min(calc(${pct}% - 6rem), calc(100% - 12rem)))`,
          width: "12rem",
          maxWidth: "100%",
        }}
      >
        {pct}% exceedance probability
      </p>
    </div>
  );
}

export default function Hero({ beach }: { beach: BeachData }) {
  return (
    <section className={`${STATUS_BG[beach.status]} w-full py-20 sm:py-28`}>
      <div className="mx-auto max-w-3xl px-6 sm:px-10 flex flex-col items-start gap-4">
        <p className="text-base sm:text-lg font-normal text-gray-600">
          {beach.name}
        </p>
        <p
          className={`text-6xl sm:text-7xl font-semibold tracking-tight leading-none ${
            STATUS_TEXT[beach.status]
          }`}
        >
          {beach.status}
        </p>
        <ProbabilityBar
          probability={beach.probability}
          threshold={beach.threshold}
        />
      </div>
    </section>
  );
}
