"use client";

import { ChevronRight } from "lucide-react";
import {
  formatMonthDayYear,
  STATUS_BAND,
  STATUS_BAND_TEXT,
  STATUS_LABEL,
  VERDICT_AS_STATUS,
  type BeachData,
} from "@/lib/data";
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

// "Boston, MA" -> "Boston". The label carries the state so a tab reading
// "Boston, MA" is unambiguous next to "Hermosa Beach, CA", but as a heading over
// the list the state is noise: the reader already knows which board they opened.
function placeName(label: string): string {
  return label.split(",")[0].trim() || label;
}

export default function BeachList({
  beaches,
  locationLabel,
  binaryVerdict,
  hidePercent,
  onSelect,
}: {
  beaches: BeachData[];
  locationLabel: string;
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
      {/* Names the place the list is for. The tab bar above says List, not
          where, and the wordmark says the product rather than the location.
          Same teal as the wordmark and its subtitle (ProjectNeptuneLogo's fill)
          so the two headings read as one voice rather than two. */}
      <h2 className="pb-4 text-3xl font-bold" style={{ color: "#2C8487" }}>
        {placeName(locationLabel)}
      </h2>

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
          const status = verdict ? VERDICT_AS_STATUS[verdict] : beach.status;
          const pctText = `${pct}${hidePercent ? "" : "%"}`;
          // A binary board's cell is the verdict alone; it publishes no
          // percentage to stack anything under.
          const label = verdict ?? `${pctText}, ${STATUS_LABEL[beach.status]}`;

          return (
            <li key={beach.code}>
              {/* The whole row is the target, not just the name: a reader aiming
                  at a beach should not have to hit the text exactly.

                  active: alongside hover: on purpose, and the first active:
                  variant in this codebase. Tailwind v4 compiles hover: to
                  @media (hover: hover), so on a touch screen the hover rule
                  never fires and a tap got no response at all. active: is not
                  gated that way, so it is what gives a finger any feedback. */}
              <button
                type="button"
                onClick={() => onSelect(beach.code)}
                aria-label={`${beach.name}: ${label}`}
                className="group flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {/* No truncation. The name is the row's whole identity, and a
                    clipped one ("Constitution Beach - East Bos...") is the one
                    thing this view cannot afford to get wrong. It wraps on a
                    narrow screen instead, and the reading beside it is fixed
                    width so the column edge stays straight either way. */}
                <span className="min-w-0 flex-1 text-sm text-gray-900">
                  {beach.name}
                </span>

                {/* The word leads and the number supports it. Scanning a list
                    of thirteen beaches, "Moderate" is the answer and 37% is the
                    working behind it, so the word takes the larger type and the
                    top line. Stacked rather than side by side because the
                    column is 80px wide and the two together read as one
                    reading, not two columns to compare across rows.

                    The word takes the same colour treatment as the card's day
                    cells, which draw the same word on the same fill. */}
                <span
                  aria-hidden="true"
                  className={`flex w-20 shrink-0 flex-col items-center justify-center rounded-sm ${
                    verdict ? "h-7" : "h-10"
                  }`}
                  style={{
                    backgroundColor: verdict
                      ? VERDICT_CELL_COLOR[verdict]
                      : TIER_CELL_COLOR[status],
                    color: verdict
                      ? VERDICT_CELL_TEXT[verdict]
                      : STATUS_BAND_TEXT[status],
                  }}
                >
                  {verdict ? (
                    <span className="text-[11px] font-semibold">{verdict}</span>
                  ) : (
                    <>
                      <span className="text-xs font-semibold leading-none">
                        {STATUS_BAND[status].short}
                      </span>
                      <span className="mt-0.5 text-[10px] font-medium leading-none tabular-nums">
                        {pctText}
                      </span>
                    </>
                  )}
                </span>

                {/* The row leads somewhere, and on a touch screen nothing else
                    says so: hover is unavailable and a pressed state only
                    answers after the reader has already decided the list is
                    static. The muted grey at rest is what does that work; the
                    teal is a desktop nicety.

                    group-active as well as group-hover for the same reason as
                    the row background above - group-hover is hover-gated too,
                    so on its own the chevron would never react to a finger.

                    aria-hidden because the row's aria-label already carries the
                    beach and its reading; a screen reader gains nothing from
                    hearing an icon as well. */}
                <ChevronRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-[#2C8487] group-active:text-[#2C8487]"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
