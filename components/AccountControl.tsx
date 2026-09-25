import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/clerkConfig";

// The only place on a board that mentions accounts at all.
//
// Deliberately quiet, and deliberately not a call to action. Free readers do
// not need an account and are never asked for one; this is here so a Pro
// subscriber who cleared their cookies or picked up a different phone has a way
// back in, and so a signed-in one has a way out. It says "Sign in", not "Sign
// up" — creating an account happens at checkout, not beside the water quality.
//
// An async server component branching on auth(), NOT <SignedIn>/<SignedOut>:
// those two were REMOVED in Clerk Core 3 and throw at runtime rather than
// failing to compile, which took every paywalled board to a 500. The state is
// known on the server here anyway, so there is nothing for a client-side
// wrapper to decide.
export default async function AccountControl() {
  if (!isClerkConfigured()) return null;

  const { userId } = await auth();

  return userId ? (
    <UserButton />
  ) : (
    <Link
      href="/sign-in"
      className="text-xs text-gray-400 underline-offset-2 transition-colors hover:text-gray-600 hover:underline"
    >
      Sign in
    </Link>
  );
}
