"use server";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { neon } from "@neondatabase/serverless";
import { isValidEmail, normalizeEmail } from "@/lib/alerts";
import { sendAlertVerification, isAlertSendingConfigured } from "@/lib/alertSend";
import { getLocation } from "@/lib/data";
import { loadStationCodes } from "@/lib/loadData";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sql = () => neon(process.env.DATABASE_URL!);
const COOKIE = "neptune_california_alert_session";

export async function requestCaliforniaAlertCode(raw: string) {
  const email = normalizeEmail(raw);
  if (!isValidEmail(email)) return { error: "Enter a valid email address." };
  if (!isAlertSendingConfigured()) return { error: "Email alerts are unavailable right now." };
  try {
    const id = randomBytes(32).toString("hex");
    const code = String(randomInt(100000, 1000000));
    // Serialize requests per email in the database to enforce the cooldown.
    const rows = await sql()`SELECT request_california_alert_code(${email},${id},${hash(id + code)}) AS accepted`;
    if (!rows[0]?.accepted) return { error: "Please wait a minute before requesting another code." };
    await sendAlertVerification(email, code);
    return { id };
  } catch {
    return { error: "Couldn't send a verification code. Please try again later." };
  }
}

export async function verifyCaliforniaAlertCode(id: string, code: string) {
  if (!/^[a-f0-9]{64}$/.test(id) || !/^\d{6}$/.test(code)) return { error: "Enter the six-digit code from your email." };
  try {
    const session = randomBytes(32).toString("hex");
    const rows = await sql()`UPDATE california_alert_verifications
      SET attempts=attempts+1,
        session_hash=CASE WHEN code_hash=${hash(id + code)} THEN ${hash(session)} ELSE NULL END,
        session_expires_at=CASE WHEN code_hash=${hash(id + code)} THEN now()+interval '30 minutes' ELSE NULL END
      WHERE id=${id} AND expires_at>now() AND attempts<5 AND session_hash IS NULL
      RETURNING session_hash`;
    if (!rows.length || rows[0].session_hash !== hash(session)) return { error: "Invalid or expired code. Request a new code after five attempts." };
    (await cookies()).set(COOKIE, session, {httpOnly:true, secure:process.env.NODE_ENV === "production", sameSite:"strict", path:"/", maxAge:1800});
    return { ok: true };
  } catch { return { error: "Couldn't verify your email. Please try again." }; }
}

export async function saveCaliforniaFreeAlert(station: string) {
  try {
    const session = (await cookies()).get(COOKIE)?.value;
    if (!session) return { error: "Verify your email before saving your beach." };
    const valid = await loadStationCodes(getLocation("california")!);
    if (!valid.includes(station)) return { error: "Select one beach." };
    // Identity comes only from an unguessable, verified HttpOnly session.
    const rows = await sql()`SELECT set_california_free_alert(email,${station}) AS result
      FROM california_alert_verifications WHERE session_hash=${hash(session)} AND session_expires_at>now()`;
    if (!rows.length) return { error: "Your verification expired. Verify your email again." };
    if (rows[0].result === "pro") return { error: "This address has Neptune Pro alert settings. Sign in to your Pro account to manage them." };
    return { ok:true, changed:rows[0].result === "changed", created:rows[0].result === "created" };
  } catch { return { error: "Couldn't save your alert. Please try again." }; }
}
