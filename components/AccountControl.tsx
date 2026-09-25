import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/clerkConfig";
import { getStripeCustomerId, isStripeConfigured } from "@/lib/subscription";

// The only place on a board that mentions accounts at all.
//
// Deliberately quiet, and deliberately not a call to action. Free readers do
// not need an account and are never asked for one; this is here so a Pro
// subscriber who cleared their cookies or picked up a different phone has a way
// back in, so a signed-in one has a way out, and so anyone paying can reach
// their billing without emailing us.
//
// An async server component branching on auth(), NOT <SignedIn>/<SignedOut>:
// those two were REMOVED in Clerk Core 3 and throw at runtime rather than
// failing to compile, which took every paywalled board to a 500.
export default async function AccountControl({
  location,
}: {
  // Where the billing portal should drop them back. The board they were on,
  // not a fixed guess.
  location: string;
}) {
  if (!isClerkConfigured()) return null;

  const { userId } = await auth();
  if (!userId) {
    return (
      <Link
        href="/sign-in"
        className="text-xs text-gray-400 underline-offset-2 transition-colors hover:text-gray-600 hover:underline"
      >
        Sign in
      </Link>
    );
  }

  // Shown to anyone who has ever been a customer, not only to whoever is
  // currently entitled. Someone who has cancelled still needs their invoices,
  // and someone whose card just failed needs to fix it — those are exactly the
  // people for whom a missing billing link is most infuriating.
  const customerId = isStripeConfigured()
    ? await getStripeCustomerId(userId)
    : null;

  return (
    <div className="flex items-center gap-3">
      {customerId && (
        <Link
          href={`/pro/manage?from=${encodeURIComponent(`/${location}`)}`}
          className="text-xs text-gray-500 underline-offset-2 transition-colors hover:text-gray-800 hover:underline"
        >
          Manage subscription
        </Link>
      )}
      <UserButton />
    </div>
  );
}
