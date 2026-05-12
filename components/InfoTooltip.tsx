"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

interface InfoTooltipProps {
  title: string;
  body: string;
  /** When provided, the icon renders with this color and uses the
   *  opacity-based visibility pattern (suited for icons embedded inline
   *  in colored body text, like the MPN tooltip). */
  iconColor?: string;
  /** Icon size class — `h-3.5 w-3.5` for inline-in-text, `h-4 w-4` for
   *  standalone next to a larger UI element. */
  iconClassName?: string;
  /** Override the auto-generated useId() when you need a predictable id. */
  tooltipId?: string;
  /** Accessible label for the icon button. */
  ariaLabel?: string;
}

export default function InfoTooltip({
  title,
  body,
  iconColor,
  iconClassName = "h-4 w-4",
  tooltipId,
  ariaLabel = "More information",
}: InfoTooltipProps) {
  const autoId = useId();
  const id = tooltipId ?? autoId;
  const [open, setOpen] = useState(false);
  // Once the user clicks, the click state is authoritative and the hover/focus
  // overrides are suppressed until the cursor leaves the wrapper. This prevents
  // "second click won't close because hover keeps it open" on desktop.
  const [clickMode, setClickMode] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  // Outside click + Escape only need to be active while open.
  useEffect(() => {
    if (!open) return;

    function handleDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("click", handleDocClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleDocClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const buttonClass = iconColor
    ? "inline-flex opacity-60 hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1 rounded-full transition-opacity"
    : "inline-flex text-gray-400 hover:text-gray-700 focus:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1 rounded-full";

  // Visibility merges three states: open (click) || hover || focus-within.
  // When open=true the override classes force visible + interactive.
  // When open=false the group-hover / group-focus-within rules take over —
  // unless clickMode is on, in which case the click state is authoritative
  // and hover is suppressed.
  const hoverFocusOverrides =
    "group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto";
  const visibilityClass = open
    ? "opacity-100 pointer-events-auto"
    : `opacity-0 pointer-events-none ${clickMode ? "" : hoverFocusOverrides}`;

  return (
    <span
      ref={wrapperRef}
      onMouseLeave={() => setClickMode(false)}
      className="group relative inline-flex align-middle ml-0.5"
    >
      <button
        type="button"
        aria-describedby={id}
        aria-expanded={open}
        onClick={(e) => {
          // Don't let the same click reach the document outside-click
          // handler that we're about to attach on the next tick.
          e.stopPropagation();
          setClickMode(true);
          setOpen((o) => !o);
        }}
        className={buttonClass}
        style={iconColor ? { color: iconColor } : undefined}
      >
        <Info className={iconClassName} aria-label={ariaLabel} />
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute bottom-full right-0 mb-2 w-[280px] transition-opacity bg-white border border-gray-200 rounded-md p-3 text-xs shadow-lg z-20 ${visibilityClass}`}
      >
        <span className="block font-medium text-xs text-gray-900 mb-1">
          {title}
        </span>
        <span className="block text-xs leading-relaxed text-gray-600">
          {body}
        </span>
      </span>
    </span>
  );
}
