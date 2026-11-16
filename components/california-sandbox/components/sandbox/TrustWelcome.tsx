"use client";

import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import s from "./TrustWelcome.module.css";

export default function TrustWelcome() {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstVisit = useRef<boolean | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    // Keep the decision stable when React replays effects in development.
    if (firstVisit.current === null) {
      try {
        firstVisit.current = localStorage.getItem("neptune:trust-welcome-seen") !== "1";
      } catch {
        // Visitors can still continue when browser storage is unavailable.
        firstVisit.current = true;
      }
    }
    if (!firstVisit.current) return;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    try {
      localStorage.setItem("neptune:trust-welcome-seen", "1");
    } catch {
      // Storage restrictions must not prevent the dialog from working.
    }
    document.body.style.overflow = "hidden";
    const restore = () => { document.body.style.overflow = previousOverflow; };
    element.addEventListener("close", restore);
    return () => { element.removeEventListener("close", restore); element.close(); restore(); };
  }, []);

  return <dialog ref={dialog} className={s.dialog} aria-labelledby="trust-title" aria-describedby="trust-intro" onCancel={(event) => event.preventDefault()}>
    <div className={s.body}>
      <h2 id="trust-title">Why trust us?</h2>
      <p id="trust-intro" className={s.intro}>Bacteria levels are always changing. Your information should too.</p>
      <div className={s.comparison}>
        <section className={s.old} aria-labelledby="old-system-title">
          <p className={s.label}>OTHER WATER QUALITY SITES</p>
          <h3 id="old-system-title">Old Sample Results.</h3>
          <ul><li><strong>Sparse samples</strong></li><li><strong>Results posted days later</strong></li></ul>
        </section>
        <section className={s.neptune} aria-labelledby="neptune-system-title">
          <p className={s.label}>NEPTUNE</p>
          <h3 id="neptune-system-title">Daily Bacteria Risk Predictions.</h3>
          <ul><li><strong>AI + real-time ocean + weather data</strong></li><li><strong>Know the current bacteria risk</strong></li></ul>
        </section>
      </div>
      <div className={s.honesty}><p>Predictions complement lab testing. Always follow official beach advisories.</p></div>
      <footer className={s.footer}><button autoFocus className={s.continue} onClick={() => dialog.current?.close()}>Continue to Neptune <ArrowRight size={20} aria-hidden="true" /></button></footer>
    </div>
  </dialog>;
}
