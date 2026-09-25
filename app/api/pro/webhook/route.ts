import {
  constructWebhookEvent,
  recordSubscription,
  updateSubscriptionStatus,
  type Stripe,
} from "@/lib/subscription";

// Stripe's callbacks. THE ONLY TRUSTWORTHY SIGNAL that someone is paying.
//
// /pro/welcome is a redirect the reader can close, bookmark or never load, so
// it cannot be what grants access. This is.
//
// Configure at https://dashboard.stripe.com/webhooks against the three events
// below, and put the signing secret in STRIPE_WEBHOOK_SECRET. Locally:
//
//   stripe listen --forward-to localhost:3000/api/pro/webhook
//
// The subscription lifecycle events are not optional. Without them a
// cancellation never reaches us and a former subscriber keeps Pro forever.

export const dynamic = "force-dynamic";

// Stripe's own period field. Read defensively: it sits on the subscription in
// the versions we target, and a missing one means "no known expiry" rather
// than "expired" — cutting a paying subscriber off over a shape change would
// be the worst possible failure here.
function periodEnd(sub: Stripe.Subscription): Date | null {
  const raw = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000) : null;
}

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  // The RAW body, before anything parses it. The signature is computed over the
  // exact bytes Stripe sent, so a round trip through JSON.parse and back would
  // re-serialise them differently and fail verification for no visible reason.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, signature);
  } catch (err) {
    console.error("[pro/webhook] signature", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // Either carrier will do; both are set at creation precisely so this
        // never depends on one of them surviving.
        const clerkUserId =
          session.client_reference_id ?? session.metadata?.clerk_user_id ?? null;
        if (!clerkUserId) {
          // Nothing to attach the payment to. Logged loudly rather than
          // swallowed: it means money changed hands and nobody got access.
          console.error("[pro/webhook] completed session with no clerk id", session.id);
          break;
        }
        await recordSubscription({
          clerkUserId,
          customerId:
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id ?? null,
          subscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id ?? null,
          // Not read from the session: a completed checkout is active by
          // definition, and the lifecycle events below own it from here.
          status: "active",
          currentPeriodEnd: null,
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await updateSubscriptionStatus(sub.id, sub.status, periodEnd(sub));
        break;
      }
    }
  } catch (err) {
    // A 500 tells Stripe to retry, which is what we want: the payment really
    // happened and the row has to catch up. Both writes are idempotent, so the
    // retry cannot double-count.
    console.error("[pro/webhook]", event.type, err);
    return new Response("Failed to record", { status: 500 });
  }

  // Everything else is acknowledged and ignored — a 4xx would make Stripe
  // retry events we never asked for, forever.
  return new Response(null, { status: 204 });
}
