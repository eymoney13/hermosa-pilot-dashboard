// Explicit categories are safe to log. Never serialize provider errors: their
// messages/request payloads can contain customer emails, promo codes or tokens.
export class CheckoutError extends Error {
  constructor(readonly category: "configuration" | "invalid_promotion" | "ineligible_account" | "invalid_attempt", message: string) {
    super(message);
  }
}

export function checkoutDiagnostic(error: unknown): Record<string, string> {
  if (error instanceof CheckoutError) return { category: error.category };
  const value = error as { type?: unknown; code?: unknown } | null;
  const stripeTypes = ["StripeAuthenticationError", "StripePermissionError", "StripeRateLimitError", "StripeConnectionError", "StripeAPIError", "StripeInvalidRequestError"];
  if (typeof value?.type === "string" && stripeTypes.includes(value.type)) return { category: "stripe", type: value.type };
  if (typeof value?.code === "string" && ["42P01", "42703", "28P01", "53300", "57P01"].includes(value.code)) return { category: "database", code: value.code };
  return { category: "internal" };
}
