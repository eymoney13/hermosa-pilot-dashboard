// Shared shape of the alert signup form's result.
//
// Deliberately NOT in app/actions/alerts.ts: that file is a "use server"
// module, where every export is turned into a server reference, so a plain
// constant exported from it fails at render ("Server Functions cannot be
// called during initial render"). And not in lib/alerts.ts either, which is
// server-only and so cannot be imported by the client component that renders
// these messages.

export interface AlertFormState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const IDLE_ALERT_STATE: AlertFormState = { status: "idle" };
