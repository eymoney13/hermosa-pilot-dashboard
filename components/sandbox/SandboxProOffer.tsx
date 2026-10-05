"use client";
import posthog from "posthog-js";
import Link from "next/link";
import { useEffect, useRef } from "react";
import s from "./SandboxDashboard.module.css";

// Sandbox-only Pro upgrade card.
//
// checkoutReady comes from the sandbox-only payment-first gate. Test checkout
// requires test keys; live checkout still requires the live-billing switch.
const CTA = "Join Neptune Pro for $5/month";

export default function SandboxProOffer({ checkoutReady, alertsEnabled }: { checkoutReady: boolean; alertsEnabled: boolean }) {
  // Seen, not merely rendered: the card often mounts below the fold, and the
  // funnel step means the reader actually had a chance to buy.
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = card.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      posthog.capture("pro_offer_viewed", { board_location: "California", checkout_ready: checkoutReady });
      seen.disconnect();
    }, { threshold: 0.5 });
    seen.observe(el);
    return () => seen.disconnect();
  }, [checkoutReady]);

  // Pro only. The Free column was cut: a reader looking at this card is already
  // using the free board, so listing what they have back to them spends half
  // the space saying nothing and makes the card read like a pricing page.
  const features = [
    alertsEnabled ? "High risk alerts" : null,
    "3-day forecasts",
  ].filter(Boolean) as string[];

  return (
    <section ref={card} id="sandbox-pro" className={s.proOffer} aria-label="Neptune Pro">
      <div className={s.proGlow} aria-hidden="true" />
      <div className={s.proInner}>
        {/* The product name IS the headline. A tagline above it pushed the
            one word a reader needs into small grey type and said nothing the
            feature list does not already say. */}
        <h2 className={s.proHeadline}>Neptune Pro</h2>
        <p className={s.proMission}>Our mission is to build the most accurate real-time beach water quality platform to help prevent millions of oceanborne illnesses a year and make checking the water as easy as checking the weather. We’re just getting started; joining Neptune Pro helps bring that mission to life.</p>

        <ul className={s.proFeatures}>
          {features.map((f) => (
            <li key={f}>
              {/* Drawn rather than a ✓ glyph: the character renders at a
                  different weight and baseline in every font, and these sit
                  in a tight column where that shows. */}
              <svg
                className={s.proTick}
                viewBox="0 0 16 16"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M3.5 8.5l3 3 6-6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {f}
            </li>
          ))}
        </ul>

        {checkoutReady ? (
          <div className={s.planChoices}>
            <Link onClick={() => posthog.capture("pro_cta_clicked", {plan:"yearly",board_location:"California"})} prefetch={false} className={`${s.primary} ${s.annualPrimary}`} href="/pro/start?plan=yearly&from=%2Fcalifornia">Join for $40/year <span>Save 33% with annual billing</span></Link>
            <Link onClick={() => posthog.capture("pro_cta_clicked", {plan:"monthly",board_location:"California"})} prefetch={false} className={s.annualChoice} href="/pro/start?plan=monthly&from=%2Fcalifornia">{CTA}</Link>
          </div>
        ) : (
          <>
            <button className={`${s.primary} ${s.annualPrimary}`} disabled>Join for $40/year <span>Save 33% with annual billing</span></button>
            <button className={s.annualChoice} disabled>{CTA}</button>
            <p className={s.checkoutNote}>Checkout is currently unavailable in this preview.</p>
          </>
        )}
      </div>
    </section>
  );
}
