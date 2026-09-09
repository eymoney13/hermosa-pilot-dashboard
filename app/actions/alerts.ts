"use server";

import { getLocation } from "@/lib/data";
import { featuresFor } from "@/lib/features";
import { isAlertsConfigured, subscribe } from "@/lib/alerts";
import { loadStationCodes } from "@/lib/loadData";
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
  return {
    status: "success",
    message: `You're signed up for ${count} ${count === 1 ? "beach" : "beaches"}.`,
  };
}
