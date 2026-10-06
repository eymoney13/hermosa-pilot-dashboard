"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import s from "./BeachRequestForm.module.css";

export default function BeachRequestForm({ basePath = "/california" }: { basePath?: string }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const response = await fetch("/api/beach-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), message: data.get("message"), website: data.get("website"), source: basePath === "/sandbox" ? "sandbox" : "california" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn’t save your request. Please try again.");
      setSent(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please check your connection and try again."); }
    finally { setPending(false); }
  }
  return <section className={s.wrap}>
    <Link className={s.back} href={basePath}>← Back to beaches</Link>
    <p className={s.eyebrow}>Help us grow the coast</p>
    <h1>Request your beach</h1>
    <p className={s.intro}>Where would you like to see Neptune next? Tell us the beach and where it is.</p>
    {sent ? <div className={s.success} role="status"><h2>Thanks for the suggestion.</h2><p>We’ve saved your request. We may contact you about this beach using the email you shared.</p><Link href={basePath}>Explore the coast →</Link></div> :
      <form onSubmit={submit} className={`${s.form} ph-no-capture`}>
        <label htmlFor="request-email">Your email</label>
        <input id="request-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" disabled={pending} />
        <label htmlFor="request-message">Which beach would you like us to add?</label>
        <textarea id="request-message" name="message" required minLength={2} maxLength={2000} rows={5} placeholder="Beach name, city or county, and anything else you’d like us to know…" disabled={pending} />
        <div className={s.trap} aria-hidden="true"><label htmlFor="request-website">Website</label><input id="request-website" name="website" tabIndex={-1} autoComplete="off" /></div>
        <p className={s.note}>We’ll save your email and message to review your request and contact you about this beach. <Link href={`${basePath}/privacy`}>Privacy policy</Link></p>
        {error && <p className={s.error} role="alert">{error}</p>}
        <button type="submit" disabled={pending}>{pending ? "Sending…" : "Send beach request"}</button>
      </form>}
  </section>;
}
