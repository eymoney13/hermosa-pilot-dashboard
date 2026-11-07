// Client-safe: no Stripe or database imports. subscription.ts re-exports these.
//
// The two ways to buy. Cents, because that is the unit Stripe speaks and the
// unit the subscription row records — a float here would be the one place the
// figure could drift from what the reader was shown.
//
// Yearly is $20 against $24 for twelve months, so it saves $4. Worth naming on
// the button: a discount nobody can see is not a discount.
export const PRO_PLANS = {
  monthly: { cents: 200, interval: "month" as const, label: "$2/month" },
  yearly: { cents: 2000, interval: "year" as const, label: "$20/year" },
};

export type ProPlan = keyof typeof PRO_PLANS;
