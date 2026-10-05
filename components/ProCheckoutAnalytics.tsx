"use client";
import { useEffect } from "react";
import posthog from "posthog-js";

// Only event names and plan; never read the checkout email or payment details.
//
// The anonymous PostHog id rides along to Stripe in a hidden field so the
// webhook's payment_succeeded lands on the same person as the rest of the
// funnel. Without it the last step can never join the earlier ones.
export default function ProCheckoutAnalytics({plan}: {plan: "monthly" | "yearly"}) {
  useEffect(() => {
    const form = document.getElementById("pro-checkout-form") as HTMLFormElement | null;
    const id = form?.elements.namedItem("ph_id");
    if (id instanceof HTMLInputElement) id.value = posthog.get_distinct_id() ?? "";
    const track = () => posthog.capture("checkout_started", {plan, board_location:"California"});
    form?.addEventListener("submit", track);
    return () => form?.removeEventListener("submit", track);
  }, [plan]);
  return null;
}
