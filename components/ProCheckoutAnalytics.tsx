"use client";
import { useEffect } from "react";
import posthog from "posthog-js";

// Only event names and plan; never read the checkout email or payment details.
export default function ProCheckoutAnalytics({plan}: {plan: "monthly" | "yearly"}) {
  useEffect(() => {
    posthog.capture("pro_checkout_viewed", {plan, board_location:"California"});
    const form = document.getElementById("pro-checkout-form");
    const track = () => posthog.capture("pro_checkout_submitted", {plan, board_location:"California"});
    form?.addEventListener("submit", track);
    return () => form?.removeEventListener("submit", track);
  }, [plan]);
  return null;
}
