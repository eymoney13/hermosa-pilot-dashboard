export function parseBeachRequest(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.email !== "string" || typeof data.message !== "string") return null;
  const email = data.email.trim().toLowerCase();
  const message = data.message.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 2 || message.length > 2000) return null;
  return { email, message, source: data.source === "sandbox" ? "sandbox" : "california" };
}
