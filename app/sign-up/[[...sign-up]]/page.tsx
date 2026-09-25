import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/clerkConfig";

// Account creation, which exists ONLY for Pro. Free readers never see this and
// never need it — the boards are anonymous and stay that way.
//
// It is a standalone page today because phase 2 has no checkout to attach it
// to. When Stripe lands in phase 3 this becomes a step of paying rather than a
// door of its own, and the link to it comes out of the header.
//
// Catch-all segment because Clerk routes its own sub-steps (factor-one,
// factor-two, sso-callback) underneath this path.

export const metadata: Metadata = {
  title: "Create your account · Neptune Pro",
  // Nothing to gain from indexing a sign-up form.
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  // 404 rather than a broken widget when Clerk is not wired up. A page that
  // renders a dead form is worse than a page that admits it is not there.
  if (!isClerkConfigured()) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-16">
      <SignUp />
    </main>
  );
}
