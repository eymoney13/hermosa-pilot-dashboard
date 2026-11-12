import { SignUp } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { isClerkConfigured } from "@/lib/clerkConfig";
import { syncPurchase } from "@/lib/purchase";
export const metadata = { title: "Activate your account · Neptune Pro", robots: {index: false, follow: false}, referrer: "no-referrer" as const };
export default async function SignUpPage({searchParams}: {searchParams: Promise<{purchase?: string}>}) {
  if (!isClerkConfigured()) notFound();
  const session = (await searchParams).purchase ?? (await cookies()).get("neptune_activation")?.value;
  if (!session) redirect("/pro/recover");
  let purchase = null;
  try { purchase = await syncPurchase(session); } catch { /* Failed receipt validation never opens signup. */ }
  if (!purchase?.active) redirect("/pro/recover");
  const target = `/pro/activate?session_id=${encodeURIComponent(session)}`;
  if (await currentUser()) redirect(target);
  return <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 px-6 py-16">
    <div className="max-w-md text-center"><h1 className="text-2xl font-semibold">Finish creating your account</h1><p className="mt-3">{purchase.freeUntil ? "Your free Neptune Pro is ready. " : "Your Neptune Pro payment is confirmed. "}Set a password and verify your checkout email once to open Neptune Pro.</p></div>
    <SignUp routing="hash" initialValues={{ emailAddress: purchase.email }} forceRedirectUrl={target} signInForceRedirectUrl={target} signInUrl={`/sign-in?purchase=${encodeURIComponent(session)}`} />
  </main>;
}
