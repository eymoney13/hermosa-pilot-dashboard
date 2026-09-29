"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function DashboardClerkProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const inSandbox = pathname === "/sandbox" || pathname?.startsWith("/sandbox/");

  // Clerk configures UserButton sign-out at the provider level. Preserve the
  // default on other boards; sandbox members return to its anonymous free view.
  return (
    <ClerkProvider afterSignOutUrl={inSandbox ? "/sandbox" : undefined}>
      {children}
    </ClerkProvider>
  );
}
