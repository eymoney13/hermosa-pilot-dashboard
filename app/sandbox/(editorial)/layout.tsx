import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EditorialShell } from "@/components/sandbox/SandboxEditorial";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Only these secondary sandbox pages use this layout. The dashboard and
// all live location pages keep their existing layouts and data paths.
export default function SandboxEditorialLayout({ children }: { children: ReactNode }) {
  return <EditorialShell>{children}</EditorialShell>;
}
