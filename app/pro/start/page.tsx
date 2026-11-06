import DirectCheckout from "@/components/DirectCheckout";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isClerkConfigured } from "@/lib/clerkConfig";
import { isProPlan, isStripeConfigured } from "@/lib/subscription";
import { isPaymentFirstEnabled, startPurchase } from "@/lib/purchase";
import { paywalledReturnPath } from "@/lib/paywall";
export const dynamic = "force-dynamic";
export const metadata = { title: "Opening secure checkout", robots: { index: false, follow: false } };
export default async function Start({ searchParams }: { searchParams: Promise<{from?: string; plan?: string; error?: string}> }) {
  if (!isClerkConfigured() || !isStripeConfigured() || !isPaymentFirstEnabled()) notFound();
  const query = await searchParams;
  if (paywalledReturnPath(query.from) !== "/california") notFound();
  const plan = isProPlan(query.plan) ? query.plan : "monthly";
  async function checkout(form: FormData) {
    "use server";
    let url: string;
    try { url = await startPurchase(plan, "", String(form.get("ph_id") ?? ""), String(form.get("attempt") ?? "")); }
    catch (error) {
      const diagnostic = error as { code?: string; type?: string } | null;
      console.error("[pro/start] checkout failed", JSON.stringify({code: diagnostic?.code, type: diagnostic?.type}));
      redirect(`/pro/start?from=/california&plan=${plan}&error=1`);
    }
    redirect(url);
  }
  return <main className="mx-auto max-w-lg px-6 py-20">
    <h1 className="text-2xl font-semibold">{query.error ? "Checkout is temporarily unavailable" : "Opening secure checkout…"}</h1>
    <p className="mt-4">Enter your email and payment details securely with Stripe, then activate your Pro account.</p>
    <DirectCheckout action={checkout} plan={plan} autoStart={!query.error} />
    <p className="mt-6"><Link className="underline" href="/pro/recover">Already subscribed? Recover your purchase</Link></p>
    <p className="mt-4"><Link className="underline" href="/california#sandbox-pro">Back to Neptune</Link></p>
  </main>;
}
