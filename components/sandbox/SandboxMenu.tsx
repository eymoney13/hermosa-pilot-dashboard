"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Menu, X } from "lucide-react";
import s from "./SandboxEditorial.module.css";

export const sandboxLinks = [
  { href: "/california/how-it-works", label: "How Neptune Works" },
  { href: "/california/stories", label: "Why It Matters" },
  { href: "/california/team", label: "Meet the Team" },
];

export default function SandboxMenu({ account }: { account?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const close = () => {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <button ref={trigger} type="button" className={s.menuButton} aria-label="Open Neptune menu" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}>
        <Menu size={21} aria-hidden="true" />
      </button>
      <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} className={s.drawer} onClose={() => { setOpen(false); trigger.current?.focus(); }} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const targets = event.currentTarget.querySelectorAll<HTMLElement>("button, a[href]");
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }} onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }}>
        <div className={s.drawerTop}>
          <p id={`${id}-title`}>Explore Neptune</p>
          <button ref={closeButton} type="button" className={s.menuButton} aria-label="Close Neptune menu" onClick={close}><X size={22} aria-hidden="true" /></button>
        </div>
        <nav className={s.drawerNav} aria-label="About Neptune">
          <p className={s.navLabel}>About Neptune</p>
          {/* No slice: the array is the whole nav now. It was sliced to 3
              when a fourth entry needed its own "Transparency" heading. */}
          {sandboxLinks.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={close}>{link.label}<ArrowUpRight size={17} aria-hidden="true" /></Link>)}
          {account && <div className={s.menuAccount}>{account}</div>}
        </nav>
        <Link href="/california" className={s.drawerBack} onClick={close}><ArrowLeft size={17} aria-hidden="true" />Back to Water Quality</Link>
      </dialog>
    </>
  );
}
