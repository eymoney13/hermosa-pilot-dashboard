"use client";

import { useEffect } from "react";

export default function LocationError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold text-slate-900">
        Today’s readings didn’t load.
      </h1>
      <p className="text-sm leading-6 text-slate-600">
        This is usually temporary. Nothing on the beaches has been changed.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="w-fit rounded-md bg-[#246f72] px-4 py-3 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </main>
  );
}
