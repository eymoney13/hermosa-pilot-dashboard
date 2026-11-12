import "server-only";
import { CheckoutError } from "./checkoutError";
import { stripe, PRO_PLANS, type ProPlan, type Stripe } from "./subscription";

// Never fall back to inline prices: coupon product restrictions depend on these
// stable products. Validate both plans so a misconfigured annual price cannot
// silently share the monthly product and redeem its discounts.
export async function checkoutPrices(): Promise<Record<ProPlan, string>> {
  const ids = {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
  };
  for (const id of Object.values(ids)) {
    if (!id || !/^price_[A-Za-z0-9]+$/.test(id)) throw new CheckoutError("configuration", "Stripe checkout prices are not configured");
  }
  const products: string[] = [];
  for (const plan of ["monthly", "yearly"] as const) {
    const price = await stripe().prices.retrieve(ids[plan]!, { expand: ["product"] });
    const product = price.product as Stripe.Product | Stripe.DeletedProduct;
    if (!price.active || price.livemode !== process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ||
        price.currency !== "usd" || price.unit_amount !== PRO_PLANS[plan].cents ||
        price.type !== "recurring" || price.recurring?.interval !== PRO_PLANS[plan].interval ||
        price.recurring.interval_count !== 1 || price.recurring.usage_type !== "licensed" ||
        typeof product === "string" || product.deleted || !product.active) {
      throw new CheckoutError("configuration", `Invalid Stripe ${plan} checkout price`);
    }
    products.push(product.id);
  }
  if (products[0] === products[1]) throw new CheckoutError("configuration", "Monthly and annual checkout require separate Stripe products");
  return ids as Record<ProPlan, string>;
}
