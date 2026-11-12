import { isClerkConfigured } from "@/lib/clerkConfig";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { syncPurchase, activatePurchase } from "@/lib/purchase";
import ActivatePurchase from "./ActivatePurchase";
export const dynamic = "force-dynamic";
export const metadata = { title: "Activate Neptune Pro", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Activate({searchParams}: {searchParams: Promise<{session_id?: string; error?: string; email_sent?: string}>}) {
  if (!isClerkConfigured()) notFound();
  const query = await searchParams;
  const sessionId = query.session_id ?? (await cookies()).get("neptune_activation")?.value ?? "";
  let purchase = null;
  try { purchase = sessionId ? await syncPurchase(sessionId) : null; } catch { /* Offer recovery instead of exposing Stripe errors. */ }
  const user = await currentUser();
  const signUpUrl = `/sign-up?purchase=${encodeURIComponent(sessionId)}`;
  // All completed purchases share this flow: monthly, yearly, and free promos.
  if (purchase?.active && !user) redirect(signUpUrl);
  async function continueActivation() {
    "use server";
    let verified = null;
    try { verified = await syncPurchase(sessionId); }
    catch { redirect(`/pro/activate?session_id=${encodeURIComponent(sessionId)}&error=retry`); }
    if (!verified?.active) redirect(`/pro/activate?session_id=${encodeURIComponent(sessionId)}&error=payment`);
    (await cookies()).set("neptune_activation", sessionId, {httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 3600, path: "/"});
    if (!(await currentUser())) {
      redirect(signUpUrl);
    }
    let activated = false;
    try { activated = await activatePurchase(sessionId); } catch { /* Conflicting claim: fail closed. */ }
    if (activated) { (await cookies()).delete("neptune_activation"); redirect("/california?pro=activated"); }
    redirect(`/pro/activate?session_id=${encodeURIComponent(sessionId)}&error=identity`);
  }
  return <main className="mx-auto max-w-lg px-6 py-20">
    <p className="text-sm text-teal-700">Neptune Pro</p>
    <h1 className="mt-3 text-3xl font-semibold">{purchase?.active ? "Activate your Pro account" : "Check your purchase"}</h1>
    {purchase?.active ? <><p className="mt-5">{purchase.freeUntil ? "Your free Neptune Pro is ready. No card needed. " : "Your payment is confirmed. "}Create an account or sign in, and verify the same email address you used at checkout.</p>
      {query.error === "retry" ? <p role="alert" className="mt-4">We couldn’t finish activation just now. Please try again. You do not need to check out again.</p> : query.error && <p role="alert" className="mt-4">We couldn’t link this purchase. Verify your checkout email in your account, or sign in to the account that originally activated it. If you have another subscription, contact support before paying again.</p>}
      <ActivatePurchase action={continueActivation} automatic={!query.error} />
      {user && <p className="mt-4 text-sm">Manage your verified email addresses from your account menu on the dashboard.</p>}
    </> : <p className="mt-5">We couldn’t confirm active Pro access. If payment is processing, refresh in a moment. If you already paid, recover your activation link below. Do not pay again.</p>}
    <p className="mt-6"><Link className="underline" href="/pro/recover">Recover activation link</Link></p>
    <p className="mt-4"><Link className="underline" href="/california">Back to water quality</Link></p>
  </main>;
}
