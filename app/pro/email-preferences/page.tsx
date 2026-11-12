import { subscriptionDb } from "@/lib/subscription";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function EmailPreferences({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token, done } = await searchParams;
  async function unsubscribe() {
    "use server";
    if (!token || !/^[a-f0-9-]{36}$/i.test(token)) return;
    await subscriptionDb()`UPDATE pro_email_preferences SET marketing_unsubscribed_at = now() WHERE unsubscribe_token = ${token}`;
    redirect("/pro/email-preferences?done=1");
  }
  return <main className="mx-auto max-w-xl p-12"><h1 className="text-2xl">Neptune Pro email preferences</h1>{done ? <p>Promotional emails are turned off. Account and billing messages continue.</p> : <form action={unsubscribe}><p>Stop promotional follow-ups from Neptune Pro.</p><button className="mt-4 underline">Unsubscribe</button></form>}</main>;
}
