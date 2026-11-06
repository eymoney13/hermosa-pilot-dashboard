export function normalizedEmail(value: string): string { return value.trim().toLowerCase(); }
export function verifiedBuyer(email: string, addresses: Array<{ emailAddress: string; verification: { status: string } | null }>): boolean {
  return addresses.some(a => a.verification?.status === "verified" && normalizedEmail(a.emailAddress) === normalizedEmail(email));
}
export function paymentFirstAllowed(env: Record<string, string | undefined>): boolean {
  if (env.NEPTUNE_PAYMENT_FIRST_ENABLED !== "true") return false;
  const key = env.STRIPE_SECRET_KEY ?? "";
  if (key.startsWith("sk_test_")) return env.NEPTUNE_TEST_CHECKOUT_ENABLED === "true";
  return key.startsWith("sk_live_") && env.NEPTUNE_LIVE_BILLING_ENABLED === "true";
}
export function paidCheckout(s: { mode: string | null; status: string | null; payment_status: string; metadata: Record<string, string> | null; amount_total?: number | null }): boolean {
  // Stripe reports a completed, fully discounted subscription as no_payment_required.
  // Only known-plan zero-total checkouts qualify; syncPurchase also verifies the live subscription.
  const settled = s.payment_status === "paid" ||
    (s.payment_status === "no_payment_required" && s.amount_total === 0 && (s.metadata?.plan === "yearly" || s.metadata?.plan === "monthly"));
  return s.mode === "subscription" && s.status === "complete" && settled && s.metadata?.flow === "payment_first_v1";
}
