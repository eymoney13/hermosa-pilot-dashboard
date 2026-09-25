import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/clerkConfig";

// The only place on a board that mentions accounts at all.
//
// Deliberately quiet, and deliberately not a call to action. Free readers do
// not need an account and are never asked for one; this is here so a Pro
// subscriber who cleared their cookies or picked up a different phone has a way
// back in, and so a signed-in one has a way out. It says "Sign in", not "Sign
// up" — creating an account is something that happens when you pay, not
// something to advertise beside the water quality.
//
// Renders nothing at all when Clerk is unconfigured.
export default function AccountControl() {
  if (!isClerkConfigured()) return null;

  return (
    <>
      <SignedOut>
        <Link
          href="/sign-in"
          className="text-xs text-gray-400 underline-offset-2 transition-colors hover:text-gray-600 hover:underline"
        >
          Sign in
        </Link>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </>
  );
}
