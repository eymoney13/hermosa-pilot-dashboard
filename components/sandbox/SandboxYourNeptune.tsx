"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { addBeachAlerts, getMyAlerts, setBeachAlert } from "@/app/actions/sandboxAlerts";
import s from "./SandboxDashboard.module.css";

// "Your Neptune" — a Pro member's alert list, on the list and map views only.
//
// They have already paid and their address is on their account, so this asks
// for neither. Adding a beach is a picker, not a signup form; removing one is
// a switch, not an unsubscribe link in an email.
//
// EVERY MUTATION IS SERVER-AUTHORISED. Nothing here is trusted: the actions
// re-check entitlement and take the address from the Clerk session rather than
// from this component. The optimistic state below is presentation only — the
// server's returned list always wins.
export default function SandboxYourNeptune({
  location,
  beaches,
}: {
  location: string;
  beaches: { code: string; name: string }[];
}) {
  const [stations, setStations] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    getMyAlerts(location).then((r) => {
      if (!live) return;
      if (r.ok) setStations(r.stations ?? []);
      else setError(r.error ?? null);
    });
    return () => { live = false; };
  }, [location]);

  const apply = (r: { ok: boolean; stations?: string[]; error?: string }) => {
    if (r.ok) { setStations(r.stations ?? []); setError(null); }
    else setError(r.error ?? "Something went wrong.");
  };

  const toggle = async (code: string, on: boolean) => {
    setBusy(code);
    apply(await setBeachAlert(location, code, on));
    setBusy(null);
  };

  const save = async () => {
    if (chosen.length === 0) { setPicking(false); return; }
    setSaving(true);
    apply(await addBeachAlerts(location, chosen));
    setSaving(false);
    setChosen([]);
    setPicking(false);
  };

  const subscribed = beaches.filter((b) => stations?.includes(b.code));
  // Only beaches they are not already following are worth offering.
  const available = beaches.filter((b) => !stations?.includes(b.code));

  return (
    <section className={s.yourNeptune} aria-label="Your Neptune">
      <p className={s.eyebrow}>Your Neptune</p>
      <h2>Email alerts when your beach has elevated bacteria levels.</h2>

      {error && <p className={s.alertError} role="alert">{error}</p>}

      {stations === null ? (
        <p className={s.alertMuted}>Loading your alerts…</p>
      ) : (
        <>
          <ul className={s.alertList}>
            {subscribed.map((b) => (
              <li key={b.code}>
                <div>
                  <p className={s.alertBeach}>{b.name}</p>
                  <p className={s.alertSub}>Elevated bacteria alerts</p>
                </div>
                {/* A switch, labelled by the beach it belongs to so a screen
                    reader does not hear "On" eight times with no subject. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked
                  aria-label={`Elevated bacteria alerts for ${b.name}`}
                  className={s.switchOn}
                  disabled={busy === b.code}
                  onClick={() => toggle(b.code, false)}
                >
                  <span className={s.switchKnob} />
                  <span className={s.switchText}>On</span>
                </button>
              </li>
            ))}
          </ul>

          {subscribed.length === 0 && (
            <p className={s.alertMuted}>You aren&rsquo;t following any beaches yet.</p>
          )}

          {available.length > 0 && !picking && (
            <button type="button" className={s.addBeach} onClick={() => setPicking(true)}>
              <Plus size={16} aria-hidden="true" /> Add another beach
            </button>
          )}

          {picking && (
            <div className={s.picker}>
              <div className={s.pickerHead}>
                <p>Which beach?</p>
                <button type="button" aria-label="Close" onClick={() => { setPicking(false); setChosen([]); }}>
                  <X size={16} />
                </button>
              </div>
              <ul>
                {available.map((b) => (
                  <li key={b.code}>
                    <label>
                      <input
                        type="checkbox"
                        checked={chosen.includes(b.code)}
                        onChange={(e) =>
                          setChosen((prev) =>
                            e.target.checked ? [...prev, b.code] : prev.filter((c) => c !== b.code)
                          )
                        }
                      />
                      {b.name}
                    </label>
                  </li>
                ))}
              </ul>
              <button type="button" className={s.pickerSave} onClick={save} disabled={saving || chosen.length === 0}>
                {saving ? "Saving…" : `Save${chosen.length ? ` (${chosen.length})` : ""}`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
