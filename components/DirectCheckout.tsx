"use client";

import { useEffect, useRef } from "react";
import posthog from "posthog-js";
import { planProperties } from "@/lib/analytics";
import ProCheckoutButton from "./ProCheckoutButton";

export default function DirectCheckout({ action, plan, autoStart }: {
  action: (form: FormData) => Promise<void>;
  plan: "monthly" | "yearly";
  autoStart: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const started = useRef(false);
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
    if (!autoStart || started.current) return;
    started.current = true;
    form.current?.requestSubmit();
  }, [autoStart]);
  return <form ref={form} action={action} onSubmit={() => {
    prepare();
    posthog.capture("checkout_started", { ...planProperties(plan), board_location: "California" });
  }} className="mt-4">
    <input type="hidden" name="attempt" />
    <input type="hidden" name="ph_id" />
    <ProCheckoutButton />
  </form>;
}
