import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/clerkConfig";
import { paywalledReturnPath } from "@/lib/paywall";
import {
  createCheckoutSession,
  isLiveBillingEnabled,
  isProPlan,
  isStripeConfigured,
} from "@/lib/subscription";

// The one door into paying. A page rather than a button handler, because it has
// to survive a round trip through sign-up: someone with no account is sent to
// create one and comes straight back here, and the checkout starts without
// them pressing anything a second time.
//
// This is also where "an account only exists if you pay" is enforced in
// practice — the sign-up link points here, so creating an account and starting
// a subscription are one motion rather than two.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Neptune Pro",
  robots: { index: false, follow: false },
};

export default async function ProStartPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; plan?: string }>;
}) {
  if (!isClerkConfigured() || !isStripeConfigured()) notFound();
  // Billing switched off: no checkout session is created, and none can be.
  // Checked before anything reads the query string, so there is no path from a
  // crafted URL to Stripe while the switch is down.
  if (!isLiveBillingEnabled()) notFound();

  // Which board this purchase is for — and whether that board sells anything.
  //
  // NO FALLBACK. This used to default to "/sandbox" when `from` was missing or
  // malformed, which meant a bare /pro/start still opened a live checkout. Now
  // an unrecognised or non-paywalled board is a 404 and no Stripe session is
  // created at all, so /pro/start?from=/southbay cannot take anybody's money
  // for a board that would give them nothing.
  const { from, plan: rawPlan } = await searchParams;
  const returnTo = paywalledReturnPath(from);
  if (!returnTo) notFound();
  // Monthly unless yearly was asked for by name. An unrecognised value bills
  // the cheaper of the two rather than guessing upward.
  const plan = isProPlan(rawPlan) ? rawPlan : "monthly";

  const { userId } = await auth();
  if (!userId) {
    // No account yet, so make one — and come back here afterwards, which is
    // what turns sign-up into the first step of paying rather than a detour.
    redirect(
      `/sign-up?redirect_url=${encodeURIComponent(
        `/pro/start?plan=${plan}&from=${returnTo}`
      )}`
    );
  }

  const url = await createCheckoutSession(userId, plan, returnTo);
  redirect(url);
}
