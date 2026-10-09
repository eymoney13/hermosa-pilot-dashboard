"use client";
import { useImperativeHandle, useRef, useState, useTransition, type Ref } from "react";
import posthog from "posthog-js";
import { requestCaliforniaAlertCode, verifyCaliforniaAlertCode, saveCaliforniaFreeAlert } from "@/app/actions/californiaAlerts";
import { addBeachAlerts } from "@/app/actions/sandboxAlerts";
import s from "./sandbox/SandboxDashboard.module.css";
import styles from "./CaliforniaAlertSignup.module.css";

export interface CaliforniaAlertSignupHandle { open: () => void }

export default function CaliforniaAlertSignup({ beaches, beach, pro, source, onSaved, ref }: {
  beaches: {code:string;name:string}[]; beach?:string; pro:boolean; source:string; onSaved?:()=>void;
  ref?: Ref<CaliforniaAlertSignupHandle>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(beach ?? "");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string>();
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const track = (event:string, station=selected) => posthog.capture(event, {page_source:source, selected_beach:station || null, subscriber_plan:pro ? "pro" : "free"});
  const openSignup = () => {
    setSelected(beach ?? "");setDone(false);setMessage("");
    track("alert_cta_clicked", beach ?? "");track("alert_signup_started", beach ?? "");
    dialog.current?.showModal();
  };
  useImperativeHandle(ref, () => ({ open: openSignup }));
  const submit = () => start(async () => {
    setMessage("");
    if (!selected) {setMessage("Select one beach.");return;}
    if (!pro && !verified) {
      if (challenge) {
        const result = await verifyCaliforniaAlertCode(challenge, code);
        if (result.error) {setMessage(result.error);return;}
        setVerified(true);
      } else {
        const result = await requestCaliforniaAlertCode(email);
        if (result.error) setMessage(result.error);
        else {setChallenge(result.id);setMessage("Enter the verification code sent to your email.");}
        return;
      }
    }
    const result = pro ? await addBeachAlerts("california", [selected]) : await saveCaliforniaFreeAlert(selected);
    if (result.error) {setMessage(result.error);return;}
    if ("changed" in result && result.changed) track("alert_beach_changed");
    else track("alert_signup_completed");
    onSaved?.();
    setDone(true);setMessage("Your beach alert is saved.");
  });
  return <section className={styles.signup}>
    <button className={s.primary} onClick={openSignup}>{beach ? "Email me when this beach has elevated bacteria levels" : "Email me when my beach has elevated bacteria levels"}</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="california-alert-title">
      <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="Close signup">×</button>
      <h2 id="california-alert-title">Elevated bacteria email alerts</h2>
      {!done && <form className={styles.form} onSubmit={event => {event.preventDefault();submit();}}>
        {!pro && <label>Email address<input className="ph-no-capture" type="email" required autoComplete="email" value={email} disabled={pending || verified || !!challenge} onChange={event=>setEmail(event.target.value)} /></label>}
        <label>Beach<select required value={selected} disabled={pending} onChange={event=>{setSelected(event.target.value);track("alert_beach_selected",event.target.value);}}>
          <option value="">Select a beach</option>{beaches.map(b=><option key={b.code} value={b.code}>{b.name}</option>)}
        </select></label>
        {!pro && challenge && !verified && <><label>Verification code<input className="ph-no-capture" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value)} /></label>
          <button type="button" disabled={pending} onClick={()=>{setChallenge(undefined);setCode("");setMessage("");}}>Use another email or request a new code</button></>}
        <button className={s.primary} disabled={pending} type="submit">{pending ? "Saving…" : pro || verified ? "Save beach alert" : challenge ? "Verify and save alert" : "Keep me updated"}</button>
      </form>}
      {message && <p role="status">{message}</p>}
      {!pro && <p>Want alerts for multiple beaches? <a href="#sandbox-pro" onClick={()=>{track("alert_upgrade_clicked");dialog.current?.close();}}>Explore Neptune Pro</a></p>}
    </dialog>
  </section>;
}
