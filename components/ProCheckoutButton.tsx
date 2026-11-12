"use client";

import { useFormStatus } from "react-dom";

export default function ProCheckoutButton({ label = "Continue to secure checkout" }: { label?: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} aria-busy={pending} className="mt-6 rounded bg-teal-800 px-5 py-3 text-white disabled:cursor-wait disabled:opacity-70">
    {pending ? "Opening secure checkout…" : label}
  </button>;
}
