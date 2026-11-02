// Local preview actions never send emails, update accounts, or write alert records.
const preview = async (...args: unknown[]) => {
  void args;
  return { error: "Local preview — no email was sent or alert saved.", id: undefined as string | undefined, changed: false, ok: false, stations: [] as string[] };
};
export const requestCaliforniaAlertCode = preview;
export const verifyCaliforniaAlertCode = preview;
export const saveCaliforniaFreeAlert = preview;
export const addBeachAlerts = preview;
export const getMyAlerts = preview;
export const setBeachAlert = preview;
