"use server";

import { currentUser } from "@clerk/nextjs/server";
import { getLocation } from "@/lib/data";
import { featuresFor } from "@/lib/features";
import { isAlertsConfigured } from "@/lib/alerts";
import { isEntitled } from "@/lib/entitlement";
import { listAlertStations, setAlertStations } from "@/lib/sandboxAlerts";
import { loadStationCodes } from "@/lib/loadData";

// "Your Neptune" — editing a Pro member's alert list one beach at a time.
//
// Reachable by direct POST like any server action, so every trust decision is
// re-made here rather than taken from the caller:
//
//   * the board must exist and be running the paywall
//   * the caller must be entitled, checked server-side, not claimed by the client
//   * the ADDRESS IS THE CLERK ACCOUNT'S, never one supplied in the request —
//     otherwise anyone signed in could edit a stranger's alert list by posting
//     their email
//   * station codes are validated against the board's live roster
export interface AlertListState {
  ok: boolean;
  stations?: string[];
  error?: string;
}

async function authorise(location: string) {
  const config = getLocation(location);
  if (!config || !featuresFor(location).paywall) return { error: "Not available here." as const };
  if (!isAlertsConfigured()) return { error: "Alerts aren't available right now." as const };
  if (!(await isEntitled())) return { error: "Neptune Pro is required." as const };

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  // No verified address on the account means there is nowhere to send an alert.
  if (!email || user?.primaryEmailAddress?.verification?.status !== "verified") return { error: "Your account has no email address." as const };

  return { config, email, userId: user.id };
}

/** The member's current list, for first render. */
export async function getMyAlerts(location: string): Promise<AlertListState> {
  const auth = await authorise(location);
  if ("error" in auth) return { ok: false, error: auth.error };
  try {
    return { ok: true, stations: await listAlertStations(auth.email, auth.config.slug) };
  } catch (err) {
    console.error("[sandboxAlerts/get]", err);
    return { ok: false, error: "Couldn't load your alerts." };
  }
}

/**
 * Turn one beach on or off.
 *
 * Read-modify-write rather than a single-row insert/delete, so the stored list
 * is always the whole truth and a stale client cannot resurrect a beach the
 * member already removed.
 */
export async function setBeachAlert(
  location: string,
  stationCode: string,
  on: boolean
): Promise<AlertListState> {
  const auth = await authorise(location);
  if ("error" in auth) return { ok: false, error: auth.error };
  try {
    const valid = await loadStationCodes(auth.config);
    const current = await listAlertStations(auth.email, auth.config.slug);
    const next = on
      ? [...new Set([...current, stationCode])]
      : current.filter((c) => c !== stationCode);
    const result = await setAlertStations(auth.email, auth.config.slug, next, valid, auth.userId);
    return result.ok
      ? { ok: true, stations: result.stations }
      : { ok: false, error: result.error };
  } catch (err) {
    console.error("[sandboxAlerts/set]", err);
    return { ok: false, error: "Couldn't update your alerts." };
  }
}

/** Add several at once, from the picker dialog. */
export async function addBeachAlerts(
  location: string,
  stationCodes: string[]
): Promise<AlertListState> {
  const auth = await authorise(location);
  if ("error" in auth) return { ok: false, error: auth.error };
  try {
    const valid = await loadStationCodes(auth.config);
    const current = await listAlertStations(auth.email, auth.config.slug);
    const result = await setAlertStations(
      auth.email,
      auth.config.slug,
      [...new Set([...current, ...stationCodes])],
      valid,
      auth.userId
    );
    return result.ok
      ? { ok: true, stations: result.stations }
      : { ok: false, error: result.error };
  } catch (err) {
    console.error("[sandboxAlerts/add]", err);
    return { ok: false, error: "Couldn't update your alerts." };
  }
}
