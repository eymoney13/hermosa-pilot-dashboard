import { isClerkConfigured } from "@/lib/clerkConfig";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { syncPurchase, activatePurchase, sendRecovery } from "@/lib/purchase";
export const dynamic = "force-dynamic";
export const metadata = { title: "Activate Neptune Pro", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Activate({searchParams}: {searchParams: Promise<{session_id?: string; error?: string; email_sent?: string}>}) {
  if (!isClerkConfigured()) notFound();
  const query = await searchParams;
  const sessionId = query.session_id ?? (await cookies()).get("neptune_activation")?.value ?? "";
  let purchase = null;
  try { purchase = sessionId ? await syncPurchase(sessionId) : null; } catch { /* Offer recovery instead of exposing Stripe errors. */ }
  const user = await currentUser();
  async function continueActivation() {
    "use server";
    const verified = await syncPurchase(sessionId);
    if (!verified?.active) redirect("/pro/activate?error=payment");
    (await cookies()).set("neptune_activation", sessionId, {httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 3600, path: "/"});
    if (!(await currentUser())) {
      try { await sendRecovery(verified.email); } catch { redirect(`/pro/activate?session_id=${encodeURIComponent(sessionId)}&error=email`); }
      redirect(`/pro/activate?session_id=${encodeURIComponent(sessionId)}&email_sent=1`);
    }
    let activated = false;
    try { activated = await activatePurchase(sessionId); } catch { /* Conflicting claim: fail closed. */ }
    if (activated) { (await cookies()).delete("neptune_activation"); redirect("/sandbox?pro=activated"); }
    redirect("/pro/activate?error=identity");
  }
  return <main className="mx-auto max-w-lg px-6 py-20">
    <p className="text-sm text-teal-700">Neptune Pro</p>
    <h1 className="mt-3 text-3xl font-semibold">{purchase?.active ? "Activate your Pro account" : "Check your purchase"}</h1>
    {purchase?.active ? <><p className="mt-5">Your payment is confirmed. Create an account or sign in, and verify the same email address you used at checkout.</p>
      {query.email_sent && <p role="status" className="mt-4">Check your checkout email for your private account activation link. Check spam too; allow ten minutes before requesting another.</p>}
      {query.error === "email" && <p role="alert" className="mt-4">We couldn’t send your activation email. Please try again in a moment. You do not need to pay again.</p>}
      {query.error && query.error !== "email" && <p role="alert" className="mt-4">We couldn’t link this purchase. Verify your checkout email in your account, or sign in to the account that originally activated it. If you have another subscription, contact support before paying again.</p>}
      <form action={continueActivation}><button className="mt-8 rounded bg-teal-800 px-5 py-3 text-white">{user ? "Activate and open Pro forecasts" : "Email my account activation link"}</button></form>
      {!user && <p className="mt-4"><Link className="underline" href={`/sign-in?purchase=${encodeURIComponent(sessionId)}`}>Already have an account? Sign in</Link></p>}
      {user && <p className="mt-4 text-sm">Manage your verified email addresses from your account menu on the dashboard.</p>}
    </> : <p className="mt-5">We couldn’t confirm an active paid purchase. If payment is processing, refresh in a moment. If you already paid, recover your activation link below—do not pay again.</p>}
    <p className="mt-6"><Link className="underline" href="/pro/recover">Recover activation link</Link></p>
    <p className="mt-4"><Link className="underline" href="/sandbox">Back to water quality</Link></p>
  </main>;
}
