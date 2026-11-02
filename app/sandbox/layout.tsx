import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ExperimentalSandboxLayout({ children }: { children: ReactNode }) {
  // This experiment must never be served by a production build.
  if (process.env.NODE_ENV !== "development") notFound();
  return children;
}
