// Client-safe: no Stripe or database imports. subscription.ts re-exports these.
//
// The two ways to buy. Cents, because that is the unit Stripe speaks and the
// unit the subscription row records — a float here would be the one place the
// figure could drift from what the reader was shown.
//
// Yearly is $40 against $60 for twelve months, so it saves $20. Worth naming on
// the button: a discount nobody can see is not a discount.
export const PRO_PLANS = {
  monthly: { cents: 500, interval: "month" as const, label: "$5/month" },
  yearly: { cents: 4000, interval: "year" as const, label: "$40/year" },
};

export type ProPlan = keyof typeof PRO_PLANS;
