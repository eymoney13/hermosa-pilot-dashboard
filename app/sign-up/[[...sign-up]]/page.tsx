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
  let paid = false;
  try { paid = !!(await syncPurchase(session))?.active; } catch { /* Failed receipt validation never opens signup. */ }
  if (!paid) redirect("/pro/recover");
  const target = `/pro/activate?session_id=${encodeURIComponent(session)}`;
  if (await currentUser()) redirect(target);
  return <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-16">
    <SignUp routing="hash" forceRedirectUrl={target} signInForceRedirectUrl={target} signInUrl={`/sign-in?purchase=${encodeURIComponent(session)}`} />
  </main>;
}
