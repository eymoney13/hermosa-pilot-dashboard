"use client";
import { useSyncExternalStore } from "react";
import posthog from "posthog-js";
import s from "./ProLapsedNotice.module.css";
const subscribe = (callback: () => void) => { window.addEventListener("storage", callback); return () => window.removeEventListener("storage", callback); };
export default function ProLapsedNotice({ endedAt, promo, onInterest, properties = {} }: { endedAt: string; promo?: boolean; onInterest?: () => void; properties?: Record<string, string | number> }) {
  const key = `neptune_pro_lapsed_${endedAt}`;
  const dismissed = useSyncExternalStore(subscribe, () => { try { return localStorage.getItem(key) === "1"; } catch { return false; } }, () => true);
  if (dismissed) return null;
  return <aside className={s.notice} aria-label="Pro access ended"><button className={s.close} aria-label="Dismiss Pro notice" onClick={() => { try { localStorage.setItem(key, "1"); window.dispatchEvent(new Event("storage")); } catch { /* Storage may be disabled. */ } }}>×</button><strong>Your {promo ? "free " : ""}Neptune Pro access ended on {new Date(endedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}.</strong><p>You are on the free plan. Pro forecasts, history and alerts are paused. Your account and saved beaches are still here.</p><a href="#sandbox-pro" onClick={() => { onInterest?.(); posthog.capture("pro_interest_clicked", { ...properties, board_location: "California", cta_location: "lapsed_notice" }); }}>Get Pro again</a></aside>;
}
