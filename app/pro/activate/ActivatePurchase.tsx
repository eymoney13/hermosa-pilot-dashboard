"use client";

import { useEffect, useRef } from "react";

export default function ActivatePurchase({ action, automatic }: {
  action: () => Promise<void>;
  automatic: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!automatic || started.current) return;
    started.current = true;
    form.current?.requestSubmit();
  }, [automatic]);
  return <form ref={form} action={action}>
    <button className="mt-8 rounded bg-teal-800 px-5 py-3 text-white">
      {automatic ? "Opening your Pro dashboard…" : "Continue to Pro"}
    </button>
  </form>;
}
