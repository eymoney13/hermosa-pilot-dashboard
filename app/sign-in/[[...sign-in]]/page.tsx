import { currentUser } from "@clerk/nextjs/server";
import { syncPurchase } from "@/lib/purchase";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
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
  referrer: "no-referrer",
};

export default async function SignInPage({searchParams}: {searchParams: Promise<{purchase?: string}>}) {
  // 404 rather than a broken widget when Clerk is not wired up. A page that
  // renders a dead form is worse than a page that admits it is not there.
  if (!isClerkConfigured()) notFound();

  const purchaseId = (await searchParams).purchase ?? (await cookies()).get("neptune_activation")?.value;
  let target = "/california";
  try { if (purchaseId && (await syncPurchase(purchaseId))?.active) target = `/pro/activate?session_id=${encodeURIComponent(purchaseId)}`; } catch { /* Invalid receipt never grants access. */ }
  if (await currentUser()) redirect(target);
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-16">
      <SignIn routing="hash" forceRedirectUrl={target} signUpUrl="/pro/recover" />
    </main>
  );
}
