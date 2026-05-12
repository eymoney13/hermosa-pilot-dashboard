import { useId } from "react";
import {
  AlertTriangle,
  CircleCheck,
  Info,
  MapPin,
} from "lucide-react";
import type { BeachData, ForecastDay, Status } from "@/lib/data";
import WhyPrediction from "./WhyPrediction";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
}

function firstSentence(text: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  const idx = trimmed.indexOf(".");
  if (idx === -1) return trimmed;
  return trimmed.slice(0, idx + 1);
}

const STATUS_TINT: Record<Status, { bg: string; deep: string; mid: string }> = {
  Normal: { bg: "bg-[#e8f5ee]", deep: "text-[#173404]", mid: "text-[#2d8a4e]" },
  "Not recommended": {
    bg: "bg-[#fce8e8]",
    deep: "text-[#412402]",
    mid: "text-[#cc3333]",
  },
};

const CELL_FILL: Record<Status, string> = {
  Normal: "#97C459",
  "Not recommended": "#E24B4A",
};

const SCALE_GRADIENT =
  "linear-gradient(to right, #97C459 0%, #97C459 25%, #EF9F27 40%, #EF9F27 55%, #E24B4A 65%, #A32D2D 100%)";

const TIER_PILL: Record<string, { bg: string; text: string }> = {
  "Generally safe": { bg: "#CFE5AC", text: "#2D5A0B" },
  Caution: { bg: "#F5D9A8", text: "#6B3F08" },
  "Not recommended": { bg: "#F4C2C2", text: "#7A1F1F" },
  "Strongly not recommended": { bg: "#E89B9B", text: "#5A1414" },
};

function tierFor(prob: number): string {
  const pct = prob * 100;
  if (pct < 30) return "Generally safe";
  if (pct < 50) return "Caution";
  if (pct < 75) return "Not recommended";
  return "Strongly not recommended";
}

function articleFor(num: number): string {
  // "an" before 8, 11, 18, 80-89; "a" otherwise.
  const s = String(num);
  if (s.startsWith("8") || s.startsWith("11") || s === "18") return "an";
  return "a";
}

// ---------------------------------------------------------------------------
// 1. Location header
// ---------------------------------------------------------------------------

function LocationHeader({ beach }: { beach: BeachData }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          <span>Hermosa Beach, CA</span>
        </div>
        <h2 className="mt-1 text-xl font-medium text-gray-900">{beach.name}</h2>
      </div>
      <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
        High confidence
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Status hero
// ---------------------------------------------------------------------------

const MPN_ICON_COLOR: Record<Status, string> = {
  Normal: "#3B6D11",
  "Not recommended": "#9B2C2C",
};

function MpnTooltip({ status }: { status: Status }) {
  const id = useId();
  return (
    <span className="group relative inline-flex align-middle ml-0.5">
      <button
        type="button"
        aria-describedby={id}
        className="inline-flex opacity-60 hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1 rounded-full transition-opacity"
        style={{ color: MPN_ICON_COLOR[status] }}
      >
        <Info className="h-3.5 w-3.5" aria-label="About MPN/100mL" />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 mb-2 w-[280px] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity bg-white border border-gray-200 rounded-md p-3 text-xs shadow-lg z-20"
      >
        <span className="block font-medium text-xs text-gray-900 mb-1">
          MPN/100mL
        </span>
        <span className="block text-xs leading-relaxed text-gray-600">
          Most probable number of bacteria per 100 milliliters of water — the
          standard EPA measure for water quality. Readings above 104 are
          classified as an exceedance, meaning bacteria levels are unsafe for
          swimming.
        </span>
      </span>
    </span>
  );
}

// Splits the subtitle on the first "MPN/100mL" and injects the tooltip after
// it. Falls back to the raw string if the marker isn't present.
function MpnSubtitle({ text, status }: { text: string; status: Status }) {
  const marker = "MPN/100mL";
  const idx = text.indexOf(marker);
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const after = text.slice(idx + marker.length);
  return (
    <>
      {before}
      {marker}
      <MpnTooltip status={status} />
      {after}
    </>
  );
}

function StatusHero({ beach }: { beach: BeachData }) {
  const tint = STATUS_TINT[beach.status];
  const Icon = beach.status === "Normal" ? CircleCheck : AlertTriangle;
  const subtitle = firstSentence(beach.insight);

  return (
    <div className={`${tint.bg} rounded-lg p-5`}>
      <div className="flex items-center gap-3">
        <Icon className={`h-6 w-6 ${tint.deep}`} aria-hidden="true" />
        <p className={`text-xl font-medium ${tint.deep}`}>{beach.status}</p>
      </div>
      {subtitle && (
        <p className={`mt-2 ml-9 text-sm ${tint.mid}`}>
          <MpnSubtitle text={subtitle} status={beach.status} />
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Exceedance scale
// ---------------------------------------------------------------------------

function ExceedanceTooltip({ pct }: { pct: number }) {
  const id = useId();
  const article = articleFor(pct);
  const body = `Less is better — under 30% is generally considered safe. There's ${article} ${pct}% chance the water has an unsafe amount of bacteria.`;

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-describedby={id}
        className="inline-flex text-gray-400 hover:text-gray-700 focus:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1 rounded-full"
      >
        <Info className="h-4 w-4" aria-label="About exceedance probability" />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 mb-2 w-[280px] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity bg-white border border-gray-200 rounded-md p-3 text-xs shadow-lg z-20"
      >
        <span className="block font-medium text-gray-900 mb-1">
          Exceedance probability
        </span>
        <span className="block text-gray-600 leading-relaxed">{body}</span>
      </span>
    </span>
  );
}

function ExceedanceScale({ beach }: { beach: BeachData }) {
  const probClamped = Math.max(0, Math.min(1, beach.probability));
  const pct = Math.round(probClamped * 100);
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

      <div className="mt-4 flex items-center gap-2">
        <span
          className="inline-flex items-center rounded-md px-2 py-0.5 text-2xl font-medium tabular-nums"
          style={{
            backgroundColor: TIER_PILL[tierFor(beach.probability)].bg,
            color: TIER_PILL[tierFor(beach.probability)].text,
          }}
        >
          {pct}%
        </span>
        <span className="text-base text-gray-500">exceedance probability</span>
        <ExceedanceTooltip pct={pct} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. 7-day window
// ---------------------------------------------------------------------------

type CellType = "past" | "today" | "forecast";

interface WindowCell {
  day: ForecastDay;
  type: CellType;
}

function buildWindowCells(beach: BeachData): WindowCell[] {
  const todayCell: WindowCell = {
    day: {
      date: beach.predictionDate,
      probability: beach.probability,
      mpnLabel: beach.mpnLabel,
      status: beach.status,
    },
    type: "today",
  };
  const pastCells: WindowCell[] = beach.pastDays.map((d) => ({
    day: d,
    type: "past",
  }));
  const forecastCells: WindowCell[] = beach.forecast.map((d) => ({
    day: d,
    type: "forecast",
  }));
  return [...pastCells, todayCell, ...forecastCells].slice(0, 7);
}

function SevenDayWindow({ beach }: { beach: BeachData }) {
  const cells = buildWindowCells(beach);
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
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
        7-Day Window
      </p>

      <div style={gridStyle}>
        {cells.map(({ day, type }) => {
          const dayLabelClass =
            type === "today"
              ? "text-blue-600 font-medium"
              : type === "past"
              ? "text-gray-400"
              : "text-gray-500";
          const opacity = type === "past" ? "opacity-55" : "opacity-100";
          const todayOutline =
            type === "today" ? "outline outline-2 outline-blue-500" : "";

          return (
            <div key={day.date} className="flex flex-col items-center gap-1">
              <span className={`text-[11px] ${dayLabelClass}`}>
                {weekdayShort(day.date)}
              </span>
              <div
                className={`h-7 w-full rounded-sm ${opacity} ${todayOutline}`}
                style={{ backgroundColor: CELL_FILL[day.status] }}
                title={`${weekdayShort(day.date)} · ${day.status} · ${Math.round(
                  day.probability * 100
                )}%`}
                aria-label={`${day.date} ${day.status} ${Math.round(
                  day.probability * 100
                )}%`}
              />
            </div>
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

export default function BeachCard({ beach }: { beach: BeachData }) {
  return (
    <div className="mx-auto max-w-3xl px-6 sm:px-10 py-10">
      <div className="space-y-6">
        <LocationHeader beach={beach} />

        <div className="space-y-3">
          <StatusHero beach={beach} />
          <ExceedanceScale beach={beach} />
        </div>

        <SevenDayWindow beach={beach} />

        <WhyPrediction beach={beach} />
      </div>
    </div>
  );
}
