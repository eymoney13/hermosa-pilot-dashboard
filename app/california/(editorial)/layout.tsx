import type { ReactNode } from "react";
import { EditorialShell } from "@/components/sandbox/SandboxEditorial";
export default function CaliforniaEditorialLayout({children}: {children: ReactNode}) { return <EditorialShell>{children}</EditorialShell>; }
