"use client";
import posthog from "posthog-js";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BeachData } from "@/lib/data";
import { beachProperties, planProperties, type CtaLocation, type PageContext } from "@/lib/analytics";
import card from "./SandboxProOffer.module.css";

// Sandbox-only Pro upgrade card.
//
// checkoutReady comes from the sandbox-only payment-first gate. Test checkout
// requires test keys; live checkout still requires the live-billing switch.


export default function SandboxProOffer({ checkoutReady, promoReady = false, alertsEnabled, ctaLocation, pageContext, beach }: {
  checkoutReady: boolean;
  promoReady?: boolean;
  alertsEnabled: boolean;
  ctaLocation: CtaLocation;
  pageContext: PageContext;
  // The beach on screen, when the card sits under one.
  beach?: BeachData;
}) {
  const [plan, setPlan] = useState<"yearly" | "monthly">("yearly");
  const context = { board_location: "California", cta_location: ctaLocation, page_context: pageContext, ...(beach ? beachProperties(beach, "southbay") : {}) };
  const clicked = (plan: "monthly" | "yearly") => {
    posthog.capture("pro_cta_clicked", { ...context, ...planProperties(plan) });
    posthog.capture("alert_upgrade_clicked", { page_source: "california_pro_offer", selected_beach: beach?.code ?? null, subscriber_plan: "free" });
  };

  // Count an offer view when the billing selector and CTA are fully visible.
  // Observe the controls, not a percentage of the differently sized card. Seen again
  // when the card moves to a new view or beach, or a different link sends the
  // reader to it, so cta_location and page_context stay honest.
  const paidOptions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = paidOptions.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting && e.intersectionRatio >= 1)) return;
      posthog.capture("pro_offer_viewed", { ...context, checkout_ready: checkoutReady });
      seen.disconnect();
    }, { threshold: 1 });
    seen.observe(el);
    return () => seen.disconnect();
    // context is rebuilt every render; its inputs are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutReady, ctaLocation, pageContext, beach?.code]);

  return (
    <section id="sandbox-pro" className={card.wrapper} aria-labelledby="pro-comparison-title">
      <div className={card.offer}>
      <h2 id="pro-comparison-title" className={card.headline}>Don’t just check today.<br /><span>Check the future.</span></h2>
      <div className={card.comparison}>
        <article className={card.free} aria-label="Neptune Free">
          <header className={card.planHeader}><p className={card.eyebrow}>The everyday check</p><h3>Neptune</h3></header>
          <div className={card.feature}><p className={card.eyebrow}>Forecast access</p><h4>Today’s forecast</h4><p>Check before you go.</p><div className={card.days} aria-label="Today only"><span>Today</span><span className={card.locked}>Day 1</span><span className={card.locked}>Day 2</span><span className={card.locked}>Day 3</span></div></div>
          {alertsEnabled && <div className={card.feature}><p className={card.eyebrow}>Bacteria alerts</p><h4>1 beach</h4><p>Alerts for your go-to spot.</p></div>}

        </article>
        <article className={card.pro} aria-label="Neptune Pro">
          <header className={card.planHeader}><p className={card.eyebrow}>More days. More beaches.</p><h3>Neptune Pro</h3></header>
          <div className={card.feature}><p className={card.eyebrow}>Forecast access</p><h4>Today + the next 3 days</h4><p>Find the day that fits your plans.</p><div className={card.days} aria-label="Today and the next three days included"><span>Today</span><span>Day 1</span><span>Day 2</span><span>Day 3</span></div></div>
          {alertsEnabled && <div className={card.feature}><p className={card.eyebrow}>Bacteria alerts</p><h4>Unlimited beaches</h4><p>Alerts across your favorite spots.</p></div>}

        </article>
      </div>
      </div>
      <div className={card.upgrade} ref={paidOptions}>
        <div className={card.planSelector} role="group" aria-label="Choose billing period">
          <button type="button" aria-pressed={plan === "yearly"} onClick={() => setPlan("yearly")}><strong>$20<span>/year</span></strong><small>Save 17%</small></button>
          <button type="button" aria-pressed={plan === "monthly"} onClick={() => setPlan("monthly")}><strong>$2<span>/month</span></strong></button>
        </div>
        {checkoutReady ? <Link className={card.upgradeCta} prefetch={false} onClick={() => clicked(plan)} href={`/pro/start?plan=${plan}&from=%2Fcalifornia`}>Get Neptune Pro <span aria-hidden="true">→</span></Link> : <button className={card.upgradeCta} type="button" disabled>Get Neptune Pro <span aria-hidden="true">→</span></button>}
        {checkoutReady && promoReady && <Link className={card.redeemLink} prefetch={false} href="/pro/redeem" onClick={() => posthog.capture("promo_redemption_clicked", context)}>Have a code? <span>Redeem</span></Link>}
        {!checkoutReady && <p className={card.previewNote}>Checkout is currently unavailable in this preview.</p>}
      </div>
    </section>
  );
}
