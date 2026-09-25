import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import ProjectNeptuneLogo from "@/components/ProjectNeptuneLogo";

// Where Stripe returns someone after a successful checkout.
//
// It deliberately does NOT grant anything. The subscription is recorded by the
// webhook, which is the only signal that cannot be faked by loading a URL, and
// entitlement is read from that record on the next page load. This page is a
// receipt.

export const metadata: Metadata = {
  title: "Welcome to Neptune Pro",
  robots: { index: false, follow: false },
};

export default function ProWelcomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="w-full border-b border-gray-100">
        <div className="mx-auto max-w-6xl px-6 sm:px-10 py-5">
          <a href="https://projectneptune.co" className="inline-flex items-center">
            <ProjectNeptuneLogo size={24} />
          </a>
        </div>
      </header>

      <div className="mx-auto w-full max-w-lg px-6 sm:px-10 py-14">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2563EB]/10">
          <Check className="h-6 w-6 text-[#2563EB]" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-gray-900">
          You&rsquo;re on Neptune Pro
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Full forecasts, the conditions behind each reading, and email alerts
          for the beaches you follow. You&rsquo;re signed in on this device and
          will stay signed in.
        </p>
        <p className="mt-3 text-sm text-gray-600">
          {/* Said plainly and up front rather than buried: the easiest
              subscription to keep is one the subscriber knows they can leave. */}
          $4.99/month. Cancel any time from your account, and you keep Pro until
          the month you have paid for runs out.
        </p>

        <div className="mt-8">
          <Link
            href="/sandbox"
            className="inline-flex items-center rounded-md bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            Back to the beaches
          </Link>
        </div>
      </div>
    </main>
  );
}
