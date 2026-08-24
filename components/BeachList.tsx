"use client";

import { formatMonthDayYear, VERDICT_AS_STATUS, type BeachData } from "@/lib/data";
import { VERDICT_CELL_COLOR, VERDICT_CELL_TEXT } from "@/lib/window";

// Every beach on one screen: the name on the left, today's call on the right,
// one beach per row. The map answers "which of these is near me"; this answers
// "how does the coast look today", which the map cannot show without making the
// reader hover thirteen pins one at a time.
//
// Today only. The card is where a beach's week lives, and repeating the whole
// strip on every row turned this into a second, smaller version of the card
// rather than the glance it is meant to be.

const TIER_CELL_COLOR: Record<BeachData["status"], string> = {
  Normal: "#97C459",
  "Slightly elevated": "#D5C82E",
  "Not recommended": "#E24B4A",
};

export default function BeachList({
  beaches,
  binaryVerdict,
  hidePercent,
  onSelect,
}: {
  beaches: BeachData[];
  // Boards whose model publishes its own Safe/Unsafe call read Good/Poor here,
  // and show no number, exactly as the card and map do.
  binaryVerdict: boolean;
  hidePercent: boolean;
  onSelect: (code: string) => void;
}) {
  if (beaches.length === 0) return null;

  // Every row is the same day, so the date belongs once at the head of the
  // column rather than repeated thirteen times. It also says which day the
  // readings are for without the reader having to look back up at the page
  // header, which scrolls away once the list is more than a screen long.
  const date = beaches[0].predictionDate;

  return (
    <section className="mx-auto w-full max-w-3xl px-6 sm:px-10 py-8">
      {date && (
        // Right-aligned across the row rather than boxed into the reading
        // column: the column is only as wide as "Good", and constraining a full
        // date to it wraps the year onto its own line. Aligning to the same
        // right edge lines it up with the readings without that.
        <div className="pb-2 text-right text-[11px] text-gray-500">
          {formatMonthDayYear(date)}
        </div>
      )}

      <ul className="divide-y divide-gray-100 border-t border-gray-100">
        {beaches.map((beach) => {
          const verdict = binaryVerdict ? beach.verdict : null;
          const pct = Math.round(beach.probability * 100);
          const label = verdict ?? `${pct}${hidePercent ? "" : "%"}`;
          const status = verdict ? VERDICT_AS_STATUS[verdict] : beach.status;

          return (
            <li key={beach.code}>
              {/* The whole row is the target, not just the name: a reader aiming
                  at a beach should not have to hit the text exactly. */}
              <button
                type="button"
                onClick={() => onSelect(beach.code)}
                aria-label={`${beach.name}: ${label}`}
                className="flex w-full items-center gap-4 py-3 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {/* No truncation. The name is the row's whole identity, and a
                    clipped one ("Constitution Beach - East Bos...") is the one
                    thing this view cannot afford to get wrong. It wraps on a
                    narrow screen instead, and the reading beside it is fixed
                    width so the column edge stays straight either way. */}
                <span className="min-w-0 flex-1 text-sm text-gray-900">
                  {beach.name}
                </span>

                <span
                  aria-hidden="true"
                  className="flex h-7 w-20 shrink-0 items-center justify-center rounded-sm text-[11px] font-semibold"
                  style={{
                    backgroundColor: verdict
                      ? VERDICT_CELL_COLOR[verdict]
                      : TIER_CELL_COLOR[status],
                    color: verdict ? VERDICT_CELL_TEXT[verdict] : "#1f2937",
                  }}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
