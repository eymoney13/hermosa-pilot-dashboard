"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, X } from "lucide-react";

// Embedded variant of the form (Google's iframe-friendly version).
const SURVEY_EMBED_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfjQ_xEJcjJwRcrqpTsQV7k3G7LfO1lbftTt_1C34JieEBLSg/viewform?embedded=true";

// Floating survey button (bottom-right of every dashboard). Clicking opens the
// form in an in-page modal over a translucent scrim, so the dashboard stays
// visible behind it and the user never leaves the page.
export default function SurveyButton() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // While open: close on Escape, lock body scroll, and move focus into the
  // dialog. Focus returns to the trigger via close().
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Take our survey"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[1100] inline-flex items-center gap-2 rounded-full bg-[#2C8487] px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-colors hover:bg-[#236a6c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2C8487] focus-visible:ring-offset-2"
      >
        <ClipboardList className="h-4 w-4" aria-hidden="true" />
        Take our survey
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Survey"
          onClick={close}
        >
          {/* Translucent, blurred scrim — the dashboard stays visible behind. */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Panel — smaller than the viewport so the edges show through. */}
          <div
            className="relative z-[1] flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-medium text-gray-900">
                Quick survey
              </span>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="Close survey"
                className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2C8487]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <iframe
              src={SURVEY_EMBED_URL}
              title="Survey"
              className="h-full w-full flex-1 border-0"
            >
              Loading…
            </iframe>
          </div>
        </div>
      )}
    </>
  );
}
