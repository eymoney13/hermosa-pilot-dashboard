'use server'

import { stripe } from '@/lib/stripe'

// Early-user pricing. To change prices later, edit the numbers here.
// People who already subscribed keep the price they signed up at.
const PLANS = {
  monthly: { amount: 299, interval: 'month', label: 'Neptune Pro (Monthly)' },
  yearly: { amount: 2999, interval: 'year', label: 'Neptune Pro (Yearly)' },
} as const

export type Plan = keyof typeof PLANS

export async function startCheckoutSession(plan: Plan) {
  const selected = PLANS[plan]
  if (!selected) throw new Error('Unknown plan')

  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    redirect_on_completion: 'never',
    mode: 'subscription',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: selected.label,
            description: 'Beach alerts and Pro forecasts from Project Neptune',
          },
          unit_amount: selected.amount,
          recurring: { interval: selected.interval },
        },
        quantity: 1,
      },
    ],
  })

  return session.client_secret
}
