import type { Status } from "./data";
export type AlertState = Record<string, { kind: "high" | "low"; date: string }>;
export type AlertBeach = { code: string; name: string; status: Status };
export function selectSandboxAlerts(beaches: AlertBeach[], state: AlertState, date: string) {
  const high: AlertBeach[] = [], cleared: AlertBeach[] = [];
  for (const beach of beaches) {
    const previous = state[beach.code];
    // Never replay or overwrite a newer forecast, including same-date corrections.
    if (previous && previous.date >= date) continue;
    if (beach.status === "Not recommended") high.push(beach);
    else if (beach.status === "Normal" && previous?.kind === "high") cleared.push(beach);
    // Moderate is not a clear-up. Keep the high state until a low forecast arrives.
  }
  return { high, cleared };
}
// sandboxAlertEmail used to live here. Pro and new-free alerts now render
// through composeAlertEmail() in lib/alertMail.ts -- the same template the
// grandfathered subscribers have always received -- so every tier gets one
// format and there is no second place for the wording to drift.
// selectSandboxAlerts above still decides WHICH beaches are high or cleared.
