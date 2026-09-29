import type { ReactNode } from "react";
import Link from "next/link";
import SandboxSupportLinks from "./SandboxSupportLinks";
export default function SandboxPolicyPage({title, children}: {title:string;children:ReactNode}) {
  return <main className="mx-auto max-w-2xl px-6 py-14 text-slate-800"><Link className="text-sm text-teal-800 underline" href="/sandbox">← Back to free water quality</Link><p className="mt-12 text-sm font-semibold tracking-widest text-teal-800">PROJECT NEPTUNE</p><h1 className="mt-4 text-4xl font-semibold tracking-tight">{title}</h1><div className="mt-8 space-y-6 leading-7">{children}</div><div className="mt-12 border-t border-slate-200 pt-4"><SandboxSupportLinks /></div></main>;
}
