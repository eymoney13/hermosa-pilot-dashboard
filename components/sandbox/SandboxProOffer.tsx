import Link from "next/link";
import s from "./SandboxDashboard.module.css";

// Sandbox-only Pro upgrade card.
//
// The checkout gating below is UNCHANGED and deliberately untouched: the link
// is only rendered when checkoutReady, which already folds in the live-billing
// kill switch. Everything else here is presentation.
const CTA = "Join Neptune Pro for $5/month";

export default function SandboxProOffer({ checkoutReady, alertsEnabled }: { checkoutReady: boolean; alertsEnabled: boolean }) {
  // Pro only. The Free column was cut: a reader looking at this card is already
  // using the free board, so listing what they have back to them spends half
  // the space saying nothing and makes the card read like a pricing page.
  const features = [
    alertsEnabled ? "Elevated bacteria email alerts" : null,
    "3-day forecasts",
    "Water-quality history",
    "What’s affecting the water quality",
  ].filter(Boolean) as string[];

  return (
    <section id="sandbox-pro" className={s.proOffer} aria-label="Neptune Pro">
      <div className={s.proGlow} aria-hidden="true" />
      <div className={s.proInner}>
        {/* The product name IS the headline. A tagline above it pushed the
            one word a reader needs into small grey type and said nothing the
            feature list does not already say. */}
        <h2 className={s.proHeadline}>Neptune Pro</h2>

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
          <Link prefetch={false} className={s.primary} href="/pro/start?plan=monthly&from=%2Fsandbox">{CTA}</Link>
        ) : (
          <>
            <button className={s.primary} disabled>{CTA}</button>
            <p className={s.checkoutNote}>Checkout is currently unavailable in this preview.</p>
          </>
        )}
      </div>
    </section>
  );
}
