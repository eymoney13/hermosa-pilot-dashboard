"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Mail, X } from "lucide-react";
import { subscribeToAlerts } from "@/app/actions/alerts";
import { IDLE_ALERT_STATE, type AlertFormState } from "@/lib/alertForm";

export interface AlertBeach {
  code: string;
  name: string;
}

// Email alert signup. A button on the board opens a dialog listing every beach
// on it with a checkbox, plus an address field; submitting records the
// selection (see lib/alerts.ts). Nothing is sent from here — this is the
// signup half.
export default function BeachAlertSignup({
  beaches,
  location,
}: {
  beaches: AlertBeach[];
  location: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, setState] = useState<AlertFormState>(IDLE_ALERT_STATE);
  const [pending, setPending] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const emailId = useId();
  const errorId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Reopening starts clean: a dialog that still shows last time's ticks and
  // "You're signed up" would read as the current state of this visit.
  const openDialog = () => {
    setSelected([]);
    setState(IDLE_ALERT_STATE);
    setOpen(true);
  };

  // While open: close on Escape, lock body scroll, move focus into the dialog.
  // Focus returns to the trigger via close().
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

  const toggle = (code: string) =>
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );

  const allSelected = selected.length === beaches.length && beaches.length > 0;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Read the form before the first await — after it, currentTarget is gone.
    const formData = new FormData(e.currentTarget);
    setPending(true);
    setState(IDLE_ALERT_STATE);
    try {
      setState(await subscribeToAlerts(formData));
    } catch {
      setState({
        status: "error",
        message: "Couldn't reach the server. Please try again.",
      });
    } finally {
      setPending(false);
    }
  };

  const succeeded = state.status === "success";

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-10 pt-2 pb-8">
        <div className="flex flex-col items-center gap-5 rounded-lg border border-gray-200 bg-gray-50 px-6 py-8 text-center">
          <p className="max-w-2xl text-lg text-slate-600 sm:text-xl">
            We&apos;ll tell you when the beaches you swim at are forecast to
            have elevated bacteria levels.
          </p>
          <button
            ref={triggerRef}
            type="button"
            onClick={openDialog}
            aria-haspopup="dialog"
            className="inline-flex items-center gap-2.5 rounded-full bg-[#2C8487] px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-[#236a6c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2C8487] focus-visible:ring-offset-2 sm:text-lg"
          >
            <Mail className="h-5 w-5 shrink-0" aria-hidden="true" />
            Email me when my beach has elevated bacteria levels
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={close}
        >
          {/* Translucent, blurred scrim — the dashboard stays visible behind. */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            aria-hidden="true"
          />

          <div
            className="relative z-[1] flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <span
                id={titleId}
                className="text-sm font-medium text-gray-900"
              >
                Beach alerts
              </span>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="Close beach alerts"
                className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2C8487]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {succeeded ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2C8487]/10">
                  <Check className="h-6 w-6 text-[#2C8487]" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-slate-800">
                  {state.message}
                </p>
                <p className="max-w-xs text-sm text-slate-500">
                  We&apos;ll email you when one of them is forecast to have
                  elevated bacteria levels.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-2 rounded-full bg-[#2C8487] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#236a6c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2C8487] focus-visible:ring-offset-2"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
                <input type="hidden" name="location" value={location} />

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm text-slate-600">
                      Which beaches do you swim at?
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected(
                          allSelected ? [] : beaches.map((b) => b.code)
                        )
                      }
                      className="shrink-0 text-xs font-medium text-[#2C8487] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2C8487] focus-visible:ring-offset-2 rounded"
                    >
                      {allSelected ? "Clear all" : "Select all"}
                    </button>
                  </div>

                  <ul className="mt-3 space-y-1">
                    {beaches.map((beach) => (
                      <li key={beach.code}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-gray-50">
                          <input
                            type="checkbox"
                            name="stations"
                            value={beach.code}
                            checked={selected.includes(beach.code)}
                            onChange={() => toggle(beach.code)}
                            className="h-4 w-4 shrink-0 rounded border-gray-300 accent-[#2C8487] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2C8487] focus-visible:ring-offset-2"
                          />
                          <span className="text-sm text-slate-700">
                            {beach.name}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border-t border-gray-100 px-5 py-4">
                  <label
                    htmlFor={emailId}
                    className="block text-sm font-medium text-slate-700"
                  >
                    Email address
                  </label>
                  <input
                    id={emailId}
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-describedby={
                      state.status === "error" ? errorId : undefined
                    }
                    className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#2C8487] focus:outline-none focus:ring-1 focus:ring-[#2C8487]"
                  />

                  {state.status === "error" && (
                    <p id={errorId} role="alert" className="mt-2 text-sm text-[#cc3333]">
                      {state.message}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={pending || selected.length === 0}
                    className="mt-3 w-full rounded-full bg-[#2C8487] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#236a6c] disabled:cursor-not-allowed disabled:bg-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2C8487] focus-visible:ring-offset-2"
                  >
                    {pending
                      ? "Signing you up…"
                      : selected.length === 0
                        ? "Select a beach to continue"
                        : `Email me about ${selected.length} ${
                            selected.length === 1 ? "beach" : "beaches"
                          }`}
                  </button>

                  <p className="mt-2 text-center text-xs text-slate-400">
                    Only bacteria alerts for the beaches you picked. Unsubscribe
                    any time.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
