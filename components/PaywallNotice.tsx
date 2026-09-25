"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

// What sits where "Behind the Prediction" would be on a locked beach.
//
// The blurred bars behind the panel are a SKELETON, not this beach's readings
// blurred out. There is nothing to blur: lib/paywall.ts strips the drivers, the
// conditions, the lab sample and the accuracy record from the payload on the
// server, so they never reach the browser. Drawing plausible-looking figures
// and smudging them would be inventing public-health numbers, which is not
// something to do even when they are illegible.

// Named here rather than imported from lib/proContent, which lives on the
// unmerged Pro-offer branch. Reconcile to one source when that lands — a price
// that disagrees with itself across two screens is the one thing this copy
// cannot get wrong.
const PRICE_LINE = "Neptune Pro is $4.99/month";

const LOCKED = [
  "The days before and after today",
  "What is driving today's reading",
  "The last lab sample, and how often we have been right",
];

export default function PaywallNotice() {
  const [pending, setPending] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-200">
      {/* The skeleton. aria-hidden and pointer-events-none: it carries no
          information, so a screen reader should hear the panel below it and
          nothing else. */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none space-y-2.5 p-5 blur-[3px]"
      >
        <div className="h-3 w-1/3 rounded bg-gray-200" />
        <div className="h-3 w-5/6 rounded bg-gray-200" />
        <div className="h-3 w-2/3 rounded bg-gray-200" />
        <div className="h-3 w-3/4 rounded bg-gray-200" />
        <div className="h-3 w-1/2 rounded bg-gray-200" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center bg-white/75 p-5">
        <div className="w-full max-w-sm text-center">
          <Lock
            className="mx-auto h-5 w-5 text-[#2563EB]"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-semibold text-gray-900">
            Behind the Prediction is part of Neptune Pro
          </p>

          <ul className="mt-3 space-y-1 text-left text-sm text-gray-700">
            {LOCKED.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span aria-hidden="true" className="text-[#2563EB]">
                  &middot;
                </span>
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-sm font-semibold text-gray-900">
            {PRICE_LINE}
          </p>

          <button
            type="button"
            onClick={() => setPending(true)}
            className="mt-3 w-full rounded-md bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            Unlock with Pro
          </button>

          {/* There is no checkout yet — this phase built the gate, not the
              till. Saying so on the press beats a button that silently does
              nothing, and it comes out when Stripe goes in. */}
          {pending && (
            <p role="status" className="mt-2 text-xs text-gray-500">
              Checkout isn&rsquo;t wired up yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
