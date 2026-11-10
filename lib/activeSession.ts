type SessionAnalytics = {
  get_session_id: () => string;
  capture: (event: string, properties: Record<string, string | number>) => unknown;
};

// Foreground time after an intentional interaction, once per PostHog session.
// Merely restoring/focusing a tab never starts the clock.
export function startActiveSessionTracking(analytics: SessionAnalytics) {
  const storageKey = "neptune_engaged_session";
  let sessionId = "";
  let activeMs = 0;
  let emitted = false;
  let lastActivity = 0;
  let lastTick = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const foreground = () => document.visibilityState === "visible" && document.hasFocus();
  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const tick = () => {
    const now = performance.now();
    if (!foreground() || now - lastActivity > 15_000) {
      stop();
      return;
    }
    // Do not credit a suspended/throttled timer with a long inactive gap.
    activeMs += Math.min(Math.max(now - lastTick, 0), 1000);
    lastTick = now;
    if (activeMs < 5000 || emitted) return;
    emitted = true;
    stop();
    try { sessionStorage.setItem(storageKey, sessionId); } catch { /* Storage can be blocked. */ }
    analytics.capture("engaged_session", { engagement_reason: "active_5_seconds", active_seconds: 5 });
  };
  const interact = (event: Event) => {
    if (!event.isTrusted || !foreground()) return;
    const nextSession = analytics.get_session_id();
    if (nextSession !== sessionId) {
      sessionId = nextSession;
      activeMs = 0;
      emitted = false;
      try { emitted = sessionStorage.getItem(storageKey) === sessionId; } catch { /* Optional persistence. */ }
      stop();
    }
    if (emitted) return;
    lastActivity = performance.now();
    if (timer === undefined) {
      lastTick = lastActivity;
      timer = setInterval(tick, 250);
    }
  };
  const visibilityChanged = () => { if (!foreground()) stop(); };
  // A scroll event can come from browser scroll restoration or an anchor jump.
  // Use the input that causes scrolling, so a restored tab alone cannot qualify.
  const activityEvents = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  for (const name of activityEvents) window.addEventListener(name, interact, { passive: true });
  window.addEventListener("blur", stop);
  window.addEventListener("pagehide", stop);
  document.addEventListener("visibilitychange", visibilityChanged);
  return () => {
    stop();
    for (const name of activityEvents) window.removeEventListener(name, interact);
    window.removeEventListener("blur", stop);
    window.removeEventListener("pagehide", stop);
    document.removeEventListener("visibilitychange", visibilityChanged);
  };
}
