import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/clerkConfig";

// Where a Pro subscriber signs back in — on a new device, or after clearing
// their cookies. Nobody is ever sent here by the board itself: the dashboards
// are anonymous and stay that way, so this page is reached from the account
// control in the header or from a link in a Pro email.
//
// Catch-all segment because Clerk routes its own sub-steps (factor-one,
// factor-two, sso-callback) underneath this path.

export const metadata: Metadata = {
  title: "Sign in · Neptune Pro",
  // Nothing to gain from indexing a sign-in form.
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  // 404 rather than a broken widget when Clerk is not wired up. A page that
  // renders a dead form is worse than a page that admits it is not there.
  if (!isClerkConfigured()) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-16">
      <SignIn />
    </main>
  );
}
