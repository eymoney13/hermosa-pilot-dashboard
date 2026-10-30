import { isPaymentFirstEnabled } from "@/lib/purchase";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/clerkConfig";
import { paywalledReturnPath } from "@/lib/paywall";
import {
  createBillingPortalSession,
  entitlementFrom,
  getAccountSubscription,
  getStripeCustomerId,
  isLiveBillingEnabled,
  isStripeConfigured,
  PRO_PLANS,
  type SubscriptionRow,
} from "@/lib/subscription";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your Neptune Pro subscription",
  robots: { index: false, follow: false },
};

function billingAvailable() {
  return isClerkConfigured() && isStripeConfigured() && (isLiveBillingEnabled() || isPaymentFirstEnabled());
}

export default async function ProManagePage({ searchParams }: {
  searchParams: Promise<{ from?: string; error?: string; preview?: string }>;
}) {
  const query = await searchParams;
  // Sample presentation only: no auth, customer lookup, or Stripe action.
  // Production always follows the authenticated path below.
  if (process.env.NODE_ENV === "development" && query.preview === "ended") {
    return <AccountView
      subscription={{ status: "canceled", plan: "monthly", current_period_end: "2026-10-29T03:05:47Z" }}
      customerId="preview" returnTo="/california" preview
    />;
  }
  if (!billingAvailable()) notFound();
  const returnTo = paywalledReturnPath(query.from ?? "/california");
  if (!returnTo) notFound();
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const [subscription, customerId] = await Promise.all([
    getAccountSubscription(userId), getStripeCustomerId(userId),
  ]);
  const managePath = `/pro/manage?from=${encodeURIComponent(returnTo)}`;

  async function openBillingPortal() {
    "use server";
    // Reauthorize every action; customer IDs never come from the browser.
    if (!billingAvailable()) notFound();
    const { userId: accountId } = await auth();
    if (!accountId) redirect("/sign-in");
    const customer = await getStripeCustomerId(accountId);
    if (!customer) notFound();
    let url: string;
    try { url = await createBillingPortalSession(customer, managePath); }
    catch { redirect(`${managePath}&error=billing`); }
    redirect(url);
  }

  return <AccountView subscription={subscription} customerId={customerId} returnTo={returnTo} billingAction={openBillingPortal} error={query.error} />;
}

function AccountView({ subscription, customerId, returnTo, billingAction, error, preview = false }: {
  subscription: (SubscriptionRow & { plan: string | null }) | null;
  customerId: string | null;
  returnTo: string;
  billingAction?: () => Promise<void>;
  error?: string;
  preview?: boolean;
}) {
  const entitled = entitlementFrom(subscription ?? undefined);
  const paymentIssue = subscription?.status === "past_due" || subscription?.status === "unpaid";
  const endDate = subscription?.current_period_end
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Los_Angeles" }).format(new Date(subscription.current_period_end))
    : null;
  const plan = subscription?.plan === "yearly" ? "yearly" : "monthly";
  return <main className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
    {preview && <p className="mb-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Local preview · sample account data · billing actions disabled</p>}
    <Link href={returnTo} className="text-sm text-teal-800 underline underline-offset-4">Back to water quality</Link>
    <p className="mt-10 text-sm font-medium text-teal-800">Your account · Neptune Pro</p>
    <h1 className="mt-3 text-3xl font-semibold tracking-tight">
      {entitled ? "Your Pro subscription" : paymentIssue ? "Your Pro payment needs attention" : subscription ? "Your Pro subscription has ended" : "You’re on the free plan"}
    </h1>
    <section aria-label="Subscription status" className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
      <p className="font-semibold">{entitled ? "Pro access is active" : "Pro access is inactive"}</p>
      {entitled ? <>
        <p className="mt-3">{plan === "yearly" ? "Annual" : "Monthly"} plan · {PRO_PLANS[plan].label}</p>
        {endDate && <p className="mt-2 text-gray-600">Current paid period ends {endDate} (Pacific time).</p>}
        <p className="mt-3 text-gray-600">Your forecasts and Pro alerts are available. View renewal and cancellation details in Stripe below.</p>
      </> : <>
        {endDate && <p className="mt-3">Your paid access ended {endDate} (Pacific time).</p>}
        <p className="mt-3 text-gray-600">{paymentIssue ? "Review your payment details in Stripe before starting another subscription." : "You can still use the free water quality dashboard. Re-subscribe to restore 3-day forecasts and Pro alerts."}</p>
      </>}
      {paymentIssue && <p className="mt-4 font-medium text-amber-800">There is a payment issue with your subscription. Open Stripe billing to resolve it.</p>}
    </section>
    {!entitled && !paymentIssue && (preview || isPaymentFirstEnabled()) && <section aria-label="Re-subscribe" className="mt-8">
      <h2 className="text-xl font-semibold">{subscription ? "Re-subscribe to Neptune Pro" : "Join Neptune Pro"}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(["monthly", "yearly"] as const).map(option => <Link key={option} prefetch={false} href={`/pro/start?from=%2Fcalifornia&plan=${option}`} className="rounded-xl border border-teal-800 px-5 py-4 text-teal-900 transition-colors hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-800">
          <span className="block font-semibold">{option === "monthly" ? "Monthly" : "Annual"} · {PRO_PLANS[option].label}</span>
          <span className="mt-1 block text-sm">{option === "monthly" ? "Billed monthly" : "Billed annually · save $20/year"}</span>
        </Link>)}
      </div>
      <p className="mt-3 text-sm text-gray-600">Renews automatically. Cancel anytime. Use the same verified account email at checkout, then activate your purchase.</p>
    </section>}
    {customerId && <section aria-label="Billing" className="mt-10 border-t border-gray-200 pt-6">
      <h2 className="text-xl font-semibold">Billing and invoices</h2>
      <p className="mt-3 text-gray-600">{entitled ? "Manage your subscription, payment methods, and invoices securely in Stripe." : "Your previous invoices and saved payment methods remain available in Stripe."}</p>
      <form action={billingAction} className="mt-4"><button disabled={preview} className="rounded-lg bg-teal-800 px-5 py-3 font-medium text-white hover:bg-teal-900">{entitled ? "Manage billing in Stripe" : "View invoices and payment methods"}</button></form>
      {error === "billing" && <p role="alert" className="mt-4 text-red-700">We couldn’t open Stripe billing. Please try again.</p>}
    </section>}
    <p className="mt-8 text-sm text-gray-600">Need help? <a href="mailto:ethan@projectneptune.co" className="underline">Contact Neptune support</a>.</p>
  </main>;
}
