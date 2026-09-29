import ProCheckoutAnalytics from "@/components/ProCheckoutAnalytics";
import SandboxSupportLinks from "@/components/sandbox/SandboxSupportLinks";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isClerkConfigured } from "@/lib/clerkConfig";
import { isProPlan, isStripeConfigured, PRO_PLANS } from "@/lib/subscription";
import { isPaymentFirstEnabled, startPurchase } from "@/lib/purchase";
import { paywalledReturnPath } from "@/lib/paywall";
export const dynamic = "force-dynamic";
export const metadata = { title: "Join Neptune Pro", robots: { index: false, follow: false } };
export default async function Start({ searchParams }: { searchParams: Promise<{from?: string; plan?: string; error?: string}> }) {
  if (!isClerkConfigured() || !isStripeConfigured() || !isPaymentFirstEnabled()) notFound();
  const query = await searchParams;
  if (paywalledReturnPath(query.from) !== "/california") notFound();
  const plan = isProPlan(query.plan) ? query.plan : "monthly";
  async function checkout(form: FormData) {
    "use server";
    let url: string;
    try { url = await startPurchase(plan, String(form.get("email") ?? "")); }
    catch { redirect(`/pro/start?from=/california&plan=${plan}&error=1`); }
    redirect(url);
  }
  return <main className="mx-auto max-w-lg px-6 py-20">
    <p className="text-sm text-teal-700">Neptune Pro</p><h1 className="mt-3 text-3xl font-semibold">More insight before you get in.</h1>
    <p className="mt-5">3-day forecasts, alerts, what&apos;s affecting the water quality, and history</p>
    <nav aria-label="Billing interval" className="mt-6 grid grid-cols-2 gap-3">
      {(["monthly", "yearly"] as const).map(option => <Link key={option} prefetch={false} aria-current={plan === option ? "page" : undefined} href={`/pro/start?from=/california&plan=${option}`} className={`rounded-lg border p-4 ${plan === option ? "border-teal-800 bg-teal-50 ring-1 ring-teal-800" : "border-gray-300"}`}>
        <span className="block font-semibold">{option === "monthly" ? "Monthly" : "Annual"}</span><span className="block mt-1">{PRO_PLANS[option].label}</span>{option === "yearly" && <span className="block mt-1 text-xs text-teal-800">Save $20 per year</span>}
      </Link>)}
    </nav>
    <p className="mt-5">{PRO_PLANS[plan].label}. Renews automatically. Cancel anytime.</p>
    <p className="mt-3 text-sm text-gray-600">Pay securely, then create your Pro account using the same email. Today’s water quality stays free.</p>
    <ProCheckoutAnalytics plan={plan} /><form id="pro-checkout-form" action={checkout} className="mt-6"><label htmlFor="email">Your checkout email</label>
      <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" className="mt-2 w-full rounded border p-3"/>
      <button className="mt-6 rounded bg-teal-800 px-5 py-3 text-white">Continue to secure checkout</button>
      {query.error && <p role="alert" className="mt-4">Checkout is temporarily unavailable. Check your email entry and try again later. If you already paid, recover your purchase below.</p>}
    </form>
    <p className="mt-4 text-sm text-gray-600">Full refund within 7 days of your first purchase. For refunds or support, email <a className="underline" href="mailto:ethan@projectneptune.co">ethan@projectneptune.co</a>.</p>
    <p className="mt-6"><Link href="/pro/recover" className="underline">Already paid? Activate your purchase</Link></p>
    <p className="mt-4"><Link href="/california" className="underline">Back to free water quality</Link></p>
    <SandboxSupportLinks />
  </main>;
}
