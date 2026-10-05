"use client";
import { useEffect, useRef } from "react";
import posthog from "posthog-js";
import { planProperties } from "@/lib/analytics";

// Only event names and plan; never read the checkout email or payment details.
//
// The anonymous PostHog id rides along to Stripe in a hidden field so the
// webhook's payment_succeeded lands on the same person as the rest of the
// funnel. Without it the last step can never join the earlier ones.
//
// Two steps, deliberately apart: pro_checkout_page_viewed is landing here;
// checkout_started is entering an email and pressing "Continue to secure
// checkout" (the browser blocks submit until the email is valid).
export default function ProCheckoutAnalytics({plan}: {plan: "monthly" | "yearly"}) {
  // Once per landing. Toggling monthly/annual re-renders this page with a new
  // plan, and that is not a second visit.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current) return;
    landed.current = true;
    posthog.capture("pro_checkout_page_viewed", {...planProperties(plan), board_location:"California"});
  }, [plan]);

  useEffect(() => {
    const form = document.getElementById("pro-checkout-form") as HTMLFormElement | null;
    const id = form?.elements.namedItem("ph_id");
    if (id instanceof HTMLInputElement) id.value = posthog.get_distinct_id() ?? "";
    const track = () => posthog.capture("checkout_started", {...planProperties(plan), board_location:"California"});
    form?.addEventListener("submit", track);
    return () => form?.removeEventListener("submit", track);
  }, [plan]);
  return null;
}
