import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/clerkConfig";
import { paywalledReturnPath } from "@/lib/paywall";
import {
  createBillingPortalSession,
  getStripeCustomerId,
  isStripeConfigured,
} from "@/lib/subscription";

// The door out. Mirrors /pro/start: a page rather than a click handler, so the
// customer lookup and the session creation both happen on the server and
// nothing about who is being billed can be supplied by the browser.
//
// THE CUSTOMER ID IS NEVER TAKEN FROM THE REQUEST. It is read from
// pro_subscriptions by the authenticated Clerk user id. A customer id is all
// anyone needs to open a billing portal, so accepting one from a query string
// or a form would let whoever held it cancel a stranger's subscription and read
// their invoices.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manage your subscription",
  robots: { index: false, follow: false },
};

export default async function ProManagePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  if (!isClerkConfigured() || !isStripeConfigured()) notFound();

  // Same gate as /pro/start, and for the same reason. This value becomes
  // Stripe's return_url, so it must be a relative path; and it must name a
  // board that actually sells something, so a link built from a board with no
  // paywall cannot open a billing portal. No fallback — a missing or
  // non-paywalled `from` is a 404, not a guess.
  const { from } = await searchParams;
  const returnTo = paywalledReturnPath(from);
  if (!returnTo) notFound();

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const customerId = await getStripeCustomerId(userId);
  // Signed in but never bought anything. Nothing to manage, so this is a 404
  // rather than an empty portal — and the link that leads here is only rendered
  // for accounts that do have a customer.
  if (!customerId) notFound();

  redirect(await createBillingPortalSession(customerId, returnTo));
}
