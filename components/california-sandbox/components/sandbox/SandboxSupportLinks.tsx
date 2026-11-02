import Link from "next/link";
export default function SandboxSupportLinks() {
  return <nav aria-label="Support and policies" className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm underline underline-offset-4"><a href="mailto:ethan@projectneptune.co">Support</a><Link href="/sandbox/terms">Subscriptions & refunds</Link><Link href="/sandbox/privacy">Privacy</Link></nav>;
}
