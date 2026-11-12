import "server-only";
import { stripe } from "./subscription";
import { promoEnabled } from "./promoAccess";
import { CheckoutError } from "./checkoutError";

// This entry point promises a free month, so reject partial, annual, expired,
// unrestricted, or otherwise incompatible offers before opening Checkout.
export async function checkoutPromotion(rawCode: string, monthlyPrice: string) {
  const code = rawCode.trim().toUpperCase();
  if (!promoEnabled()) throw new CheckoutError("configuration", "Promo redemption is disabled");
  if (!/^[A-Z0-9-]{1,64}$/.test(code)) throw new CheckoutError("invalid_promotion", "Invalid free-month promotion");
  const price = await stripe().prices.retrieve(monthlyPrice);
  const product = typeof price.product === "string" ? price.product : price.product.id;
  const results = await stripe().promotionCodes.list({ code, active: true, limit: 100, expand: ["data.promotion.coupon.applies_to"] });
  const now = Math.floor(Date.now() / 1000);
  const eligible = results.data.filter(promo => {
    const coupon = promo.promotion.coupon;
    return promo.active && promo.code.toUpperCase() === code && promo.livemode === price.livemode &&
      !promo.customer && !promo.customer_account && (!promo.expires_at || promo.expires_at > now) &&
      (!promo.max_redemptions || promo.times_redeemed < promo.max_redemptions) &&
      coupon && typeof coupon !== "string" && coupon.valid && coupon.percent_off === 100 &&
      coupon.duration === "repeating" && coupon.duration_in_months === 1 &&
      (!coupon.redeem_by || coupon.redeem_by > now) &&
      (!coupon.max_redemptions || coupon.times_redeemed < coupon.max_redemptions) &&
      coupon.applies_to?.products.length === 1 && coupon.applies_to.products[0] === product;
  });
  if (eligible.length !== 1) throw new CheckoutError("invalid_promotion", "Invalid free-month promotion");
  // Stripe rechecks its own restrictions/redemption limits on session creation.
  return eligible[0].id;
}
