import type Stripe from "stripe";

// Read the signed Checkout data, including zero-dollar redemptions. A missing
// discounts field means unknown, rather than incorrectly reporting no code.
export function checkoutPaymentProperties(session: Stripe.Checkout.Session) {
  return {
    price: session.amount_total == null ? null : session.amount_total / 100,
    amount_cents: session.amount_total ?? null,
    subtotal_cents: session.amount_subtotal ?? null,
    discount_amount_cents: session.total_details?.amount_discount ?? null,
    discount_code_used: session.discounts === undefined
      ? null
      : (session.discounts ?? []).some((discount) => Boolean(discount.promotion_code)),
  };
}
