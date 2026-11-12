"use client";

import { useEffect, useRef } from "react";
import posthog from "posthog-js";
import { planProperties } from "@/lib/analytics";
import ProCheckoutButton from "./ProCheckoutButton";

export default function DirectCheckout({ action, plan, autoStart, promoEntry = false }: {
  action: (form: FormData) => Promise<void>;
  plan: "monthly" | "yearly";
  autoStart: boolean;
  promoEntry?: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const started = useRef(false);
  const viewed = useRef(false);
  const attempt = useRef("");
  function prepare() {
    // Reuse one opaque identifier across retries and plan changes. No email is
    // stored in browser storage. Storage may be unavailable in private browsers.
    if (!attempt.current) {
      try {
        attempt.current = localStorage.getItem("neptune_checkout_attempt") || crypto.randomUUID();
        localStorage.setItem("neptune_checkout_attempt", attempt.current);
      } catch { attempt.current = crypto.randomUUID(); }
    }
    const fields = form.current?.elements;
    const token = fields?.namedItem("attempt");
    const analytics = fields?.namedItem("ph_id");
    if (token instanceof HTMLInputElement) token.value = attempt.current;
    if (analytics instanceof HTMLInputElement) analytics.value = posthog.get_distinct_id() ?? "";
  }
  useEffect(() => {
    if (!viewed.current) {
      viewed.current = true;
      posthog.capture("pro_checkout_page_viewed", { ...planProperties(plan), board_location: "California" });
    }
    if (!autoStart || started.current) return;
    started.current = true;
    form.current?.requestSubmit();
  }, [autoStart, plan]);
  return <form ref={form} action={action} onSubmit={() => {
    prepare();
    posthog.capture("checkout_started", { ...planProperties(plan), board_location: "California", checkout_entry: promoEntry ? "promo_redemption" : "paid_checkout" });
  }} className="mt-4">
    <input type="hidden" name="attempt" />
    <input type="hidden" name="ph_id" />
    {promoEntry && <><label htmlFor="promo-code" className="block font-medium">Promo code</label>
      <input id="promo-code" name="promo_code" required maxLength={64} autoComplete="off" autoCapitalize="characters" spellCheck={false}
        className="mt-2 w-full rounded border border-gray-400 bg-white p-3 text-gray-900" /></>}
    <ProCheckoutButton label={promoEntry ? "Apply promo and continue" : undefined} />
  </form>;
}
