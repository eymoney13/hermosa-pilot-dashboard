"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  STATUS_BAND,
  STATUS_COLOR,
  VERDICT_AS_STATUS,
  type BeachData,
} from "@/lib/data";

// Moving between beaches once you are already on one.
//
// This replaced a row of tabs that, at eight names averaging thirty characters,
// was 2,229px wide in 289px of phone. It was briefly a native <select>, which
// fixed the scrolling and looked like a form field from 2010.
//
// Built rather than borrowed, because the thing a select cannot do is the point
// of this one: every option carries its own reading, so choosing a beach is
// informed rather than blind. A reader scanning for somewhere clean to swim can
// see which of the eight qualifies without opening each in turn.
//
// The cost of building it is the behaviour a select gets free, so all of it is
// here: arrow keys, Home and End, Enter and Space, Escape, click-outside, and
// focus returning to the button on close. The roles are the listbox pattern, so
// a screen reader hears "Hermosa Beach - Herondo St, selected, 3 of 8" rather
// than a list of anonymous buttons.
export default function BeachPicker({
  beaches,
  activeCode,
  binaryVerdict,
  onSelect,
}: {
  beaches: BeachData[];
  activeCode: string;
  // Binary boards read their own Good/Poor call, so the dot matches the card.
  binaryVerdict: boolean;
  onSelect: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Which option the keyboard is on, which is not the same as which is chosen:
  // arrowing through a list should not change the page under it.
  //
  // Mirrored in a ref because Enter has to read where the cursor IS, and state
  // set earlier in the same React batch is not visible to a handler closing
  // over it. Arrow-then-Enter pressed fast enough to land in one batch would
  // otherwise choose whatever the cursor was before the arrow.
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(0);
  const moveCursor = (next: number) => {
    cursorRef.current = next;
    setCursor(next);
  };
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const activeIndex = Math.max(
    0,
    beaches.findIndex((b) => b.code === activeCode)
  );
  const active = beaches[activeIndex];

  const statusOf = (b: BeachData) =>
    binaryVerdict && b.verdict ? VERDICT_AS_STATUS[b.verdict] : b.status;

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const choose = (code: string) => {
    onSelect(code);
    close();
  };

  // Open at whatever is currently showing, not at the top of the list.
  const openList = () => {
    moveCursor(activeIndex);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    // Focus moves into the list so the arrow keys have somewhere to land.
    listRef.current?.focus();

    function onDocPointer(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, [open]);

  // Keep the cursor in view when it walks past the edge of a scrolling list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelectorAll("li")
      [cursor]?.scrollIntoView({ block: "nearest" });
  }, [open, cursor]);

  const onListKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveCursor(Math.min(cursorRef.current + 1, beaches.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        moveCursor(Math.max(cursorRef.current - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        moveCursor(0);
        break;
      case "End":
        e.preventDefault();
        moveCursor(beaches.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(beaches[cursorRef.current].code);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        // Tabbing away is a dismissal, but focus is already on its way out, so
        // it must not be dragged back to the button.
        close(false);
        break;
    }
  };

  const listboxId = "beach-picker-list";

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openList();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={`Beach: ${active?.name ?? ""}. Change beach`}
        className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-2.5 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {active && (
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: STATUS_COLOR[statusOf(active)] }}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-left font-medium">
          {active?.name}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label="Beaches"
          aria-activedescendant={`beach-option-${beaches[cursor]?.code}`}
          onKeyDown={onListKeyDown}
          // Right-aligned and above everything: the control sits at the right
          // of its row, and the map below it is a Leaflet container with its own
          // stacking context.
          className="absolute right-0 z-[1100] mt-1.5 max-h-80 w-[min(20rem,calc(100vw-3rem))] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg focus:outline-none"
        >
          {beaches.map((b, i) => {
            const status = statusOf(b);
            const selected = b.code === activeCode;
            return (
              <li
                key={b.code}
                id={`beach-option-${b.code}`}
                role="option"
                aria-selected={selected}
                onClick={() => choose(b.code)}
                onMouseEnter={() => moveCursor(i)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${
                  i === cursor ? "bg-gray-50" : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_COLOR[status] }}
                />
                <span
                  className={`min-w-0 flex-1 truncate ${
                    selected ? "font-medium text-gray-900" : "text-gray-700"
                  }`}
                >
                  {b.name}
                </span>
                {/* The reading itself, so the list answers "which of these is
                    clean today" without opening any of them. */}
                <span className="shrink-0 text-xs text-gray-500">
                  {binaryVerdict && b.verdict
                    ? b.verdict
                    : STATUS_BAND[status].short}
                </span>
                {selected ? (
                  <Check
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0"
                    style={{ color: "#2C8487" }}
                  />
                ) : (
                  <span aria-hidden="true" className="w-4 shrink-0" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
