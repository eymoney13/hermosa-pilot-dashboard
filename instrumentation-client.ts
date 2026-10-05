import posthog from "posthog-js";
import { acquisitionCampaign, acquisitionSource } from "@/lib/analytics";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!posthogKey) {
  if (process.env.NODE_ENV === "development") {
    throw new Error(
      "NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_KEY is configured"
    );
  }
} else if (!posthogHost) {
  if (process.env.NODE_ENV === "development") {
    throw new Error(
      "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured"
    );
  }
} else {
  posthog.init(posthogKey, {
    api_host: "/relay-np",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
    // First touch only: a later visit must not overwrite it, and medium and
    // campaign come from the same visit as source or not at all.
    loaded: (ph) => {
      if (ph.get_property("source") === undefined) {
        ph.register({ source: acquisitionSource(), ...acquisitionCampaign() });
      }
    },
  });
}
