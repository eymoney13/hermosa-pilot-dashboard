"use server";

import { getLocation } from "@/lib/data";
import { featuresFor } from "@/lib/features";
import { isAlertsConfigured, subscribe } from "@/lib/alerts";
import { isEntitled } from "@/lib/entitlement";
import { loadStationCodes } from "@/lib/loadData";
import { emitPostHogLog } from "@/lib/posthogLog";
import type { AlertFormState } from "@/lib/alertForm";

// The alert signup form's Server Action. Reachable by direct POST, not only
// through our own UI, so everything it trusts is re-derived here: the location
// must be a real board with alerts turned on, and the submitted stations are
// checked against that board's live roster rather than against anything the
// client sent alongside them.

export async function subscribeToAlerts(
  formData: FormData
): Promise<AlertFormState> {
  const location = String(formData.get("location") ?? "");
  const config = getLocation(location);
  if (!config || !featuresFor(location).beachAlerts) {
    return { status: "error", message: "Email alerts aren't available here." };
  }

  // THE ACTUAL GATE. The dialog also refuses to submit for an unentitled
  // reader, but that is presentation: this action is reachable by a direct
  // POST, so a client-side paywall is a suggestion and this is the rule.
  //
  // It runs before any write, which is what makes "nothing is stored for
  // someone who declines" true rather than merely intended.
  if (featuresFor(location).paywall && !(await isEntitled())) {
    return {
      status: "error",
      message: "Email alerts are part of Neptune Pro.",
    };
  }

  if (!isAlertsConfigured()) {
    return {
      status: "error",
      message: "Email alerts aren't available right now. Please try again later.",
    };
  }

  const email = String(formData.get("email") ?? "");
  const stations = formData.getAll("stations").map(String);

  try {
    const validStations = await loadStationCodes(config);
    const result = await subscribe(email, location, stations, validStations);
    if (!result.ok) {
      return { status: "error", message: result.error };
    }
  } catch (err) {
    // A database that is down is our problem, not the reader's — log the real
    // cause for the function logs and tell them something they can act on.
    console.error("[alerts/subscribe]", err);
    return {
      status: "error",
      message: "Something went wrong saving that. Please try again.",
    };
  }

  const count = new Set(stations).size;
  await emitPostHogLog("alert subscription persisted", {
    event: "alert_subscription_persisted",
    location,
    station_count: count,
  });

  return {
    status: "success",
    message: `You're signed up for ${count} ${count === 1 ? "beach" : "beaches"}.`,
  };
}
