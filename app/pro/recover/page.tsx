import Link from "next/link";
import { redirect } from "next/navigation";
import { sendRecovery } from "@/lib/purchase";
export const metadata = { title: "Recover Neptune Pro", robots: {index: false, follow: false} };
export default async function Recover({searchParams}: {searchParams: Promise<{sent?: string; error?: string}>}) {
  const query = await searchParams;
  async function recover(form: FormData) {
    "use server";
    try { await sendRecovery(String(form.get("email") ?? "")); } catch { redirect("/pro/recover?error=1"); }
    redirect("/pro/recover?sent=1");
  }
  return <main className="mx-auto max-w-lg px-6 py-20"><h1 className="text-3xl font-semibold">Already paid?</h1>
    <p className="mt-5">Enter your checkout email to recover your activation link. You do not need to pay again.</p>
    {query.sent ? <p role="status" className="mt-6">If a purchase matches, an activation link will arrive by email. Check spam too. Please wait ten minutes before requesting another.</p> : <form action={recover} className="mt-6">
      <label htmlFor="email">Checkout email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} className="mt-2 w-full rounded border p-3"/>
      <button className="mt-4 rounded bg-teal-800 px-5 py-3 text-white">Send activation link</button>
      {query.error && <p role="alert" className="mt-4">We couldn’t send the link. Check your email and try again later.</p>}
    </form>}
    <p className="mt-6"><Link href="/sign-in" className="underline">Already activated? Sign in</Link></p>
    <p className="mt-4"><Link href="/california" className="underline">Back</Link></p>
  </main>;
}
