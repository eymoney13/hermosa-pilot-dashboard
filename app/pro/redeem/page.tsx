import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import DirectCheckout from "@/components/DirectCheckout";
import { isClerkConfigured } from "@/lib/clerkConfig";
import { isStripeConfigured } from "@/lib/subscription";
import { isPaymentFirstEnabled, startPurchase } from "@/lib/purchase";
import { promoEnabled } from "@/lib/promoAccess";
import { checkoutDiagnostic } from "@/lib/checkoutError";

export const dynamic = "force-dynamic";
export const metadata = { title: "Redeem your promo · Neptune Pro", robots: { index: false, follow: false } };

export default async function Redeem({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isClerkConfigured() || !isStripeConfigured() || !isPaymentFirstEnabled() || !promoEnabled()) notFound();
  const query = await searchParams;
  async function redeem(form: FormData) {
    "use server";
    let url: string;
    try {
      url = await startPurchase("monthly", "", String(form.get("ph_id") ?? ""), String(form.get("attempt") ?? ""), String(form.get("promo_code") ?? ""));
    } catch (error) {
      console.error("[pro/redeem] checkout_failed", checkoutDiagnostic(error));
      redirect("/pro/redeem?error=1");
    }
    redirect(url);
  }
  return <main className="mx-auto max-w-lg px-6 py-20">
    <h1 className="text-3xl font-semibold">Redeem your Neptune Pro promo</h1>
    <p className="mt-4">One month of Neptune Pro, free. No credit card required. Access ends automatically unless you choose Keep Pro.</p>
    <p className="mt-4">Enter your code below. Next, enter your email securely with Stripe, then set a password and verify your email to activate Pro. Already have an account? Sign in after checkout.</p>
    {query.error && <p role="alert" className="mt-4">We couldn’t apply that promo. Check your code and try again. Expired, fully redeemed, or previously used offers may be unavailable.</p>}
    <DirectCheckout action={redeem} plan="monthly" autoStart={false} promoEntry />
    <p className="mt-6"><Link className="underline" href="/pro/recover">Already redeemed? Recover your purchase</Link></p>
    <p className="mt-4"><Link className="underline" href="/california#sandbox-pro">Back to Neptune</Link></p>
  </main>;
}
