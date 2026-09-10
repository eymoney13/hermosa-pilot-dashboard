import type { Metadata } from "next";
import Link from "next/link";
import { LOCATIONS } from "@/lib/data";
import { findSubscription, unsubscribeByToken } from "@/lib/alertUnsubscribe";
import ProjectNeptuneLogo from "@/components/ProjectNeptuneLogo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  // Nothing links here but an email, and an unsubscribe URL in a search index
  // is a way for a stranger to unsubscribe somebody else.
  robots: { index: false, follow: false },
};

// Turn station codes back into the names the subscriber picked, so the page
// confirms what they are actually giving up rather than showing them codes.
function beachNames(location: string, stations: string[]): string[] {
  const config = LOCATIONS[location];
  return stations.map((code) => config?.beachNames[code] ?? code);
}

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const subscription = await findSubscription(token);

  async function confirm() {
    "use server";
    await unsubscribeByToken(token);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <ProjectNeptuneLogo size={28} />
        </div>

        {subscription ? (
          <>
            <h1 className="text-xl font-medium text-slate-900">
              Stop these alerts?
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              {subscription.email} is signed up for bacteria alerts at:
            </p>
            <ul className="mt-4 space-y-1 text-sm text-slate-700">
              {beachNames(subscription.location, subscription.stations).map(
                (name) => (
                  <li key={name}>{name}</li>
                )
              )}
            </ul>
            <form action={confirm} className="mt-8">
              <button
                type="submit"
                className="w-full rounded-md bg-[#2C8487] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#236a6c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2C8487] focus-visible:ring-offset-2"
              >
                Unsubscribe
              </button>
            </form>
            <p className="mt-4 text-xs text-slate-400">
              You can sign up again any time from the dashboard.
            </p>
          </>
        ) : (
          // Covers an already-used token, an unknown one, and a second click on
          // the same link. All three mean the same thing to the reader: they
          // are not on the list.
          <>
            <h1 className="text-xl font-medium text-slate-900">
              You&apos;re unsubscribed
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              This address will no longer receive beach bacteria alerts.
            </p>
            <Link
              href="/southbay"
              className="mt-8 inline-block rounded-md bg-[#2C8487] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#236a6c]"
            >
              Back to the dashboard
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
