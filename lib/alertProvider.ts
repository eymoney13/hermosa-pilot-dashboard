import "server-only";

// Email transport for the daily bacteria alert run.
//
// Gmail SMTP is kept here unchanged behind a flag so the migration can be
// rolled back by moving one environment variable, and so purchase/account mail
// (lib/purchase.ts, also nodemailer) is untouched -- this module is only ever
// used by the alert run.
//
// WHY THE MOVE. The 2026-10-12 run was the first time this system ever had a
// bulk list: every previous day had 0 or 1 recipient. At 69 it returned
// 69 failed / 0 sent. Gmail SMTP is not a bulk sender -- a consumer mailbox
// caps around 500 recipients/day and throttles bursts on a single connection
// -- and the old code reused one cached nodemailer transport that was never
// reset after an error, so one early rejection cascaded to every remaining
// message. Neither problem is fixable at the volume this needs to reach.
//
// Resend is addressed over its documented HTTP API rather than the SDK. That
// keeps the dependency list unchanged and, more importantly, gives this code
// direct access to two things the run genuinely needs: the Idempotency-Key
// request header, and the `retry-after` / `ratelimit-*` response headers.

export type SendOutcome =
  | { ok: true; id: string | null; deduplicated: boolean }
  // retryable: a later run should try again. permanent: it never will work.
  | { ok: false; code: string; retryable: boolean; retryAfterMs?: number };

export interface AlertSender {
  readonly name: string;
  send(msg: OutboundAlert, idempotencyKey: string): Promise<SendOutcome>;
}

export interface OutboundAlert {
  to: string;
  subject: string;
  html: string;
  text: string;
  oneClickUrl: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Resend's documented error codes, split by whether a later attempt can work.
// Anything not listed is treated as retryable only if the HTTP status is 5xx,
// so an unknown 4xx is never retried forever.
const RETRYABLE_CODES = new Set([
  "rate_limit_exceeded",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
  "application_error",
  "service_unavailable",
  "resource_locked",
  "concurrent_idempotent_requests",
  "invalid_idempotency_key",
]);

const PERMANENT_CODES = new Set([
  "validation_error",
  "missing_api_key",
  "restricted_api_key",
  "not_found",
  "method_not_allowed",
  "invalid_attachment",
  "invalid_parameter",
  "missing_required_field",
  "missing_required_parameter",
]);

// Local-part@domain, no spaces or angle brackets. Deliberately loose: the
// authority on whether an address can send is Resend's domain verification,
// not a regex. This only catches the configuration mistakes that would
// otherwise surface as a rejected batch.
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * The bare address inside `Name <a@b.c>`, or a bare `a@b.c`. Null if absent or
 * malformed.
 */
export function fromAddressEmail(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const angled = value.match(/<([^>]+)>\s*$/);
  const address = (angled ? angled[1] : value).trim();
  return EMAIL_RE.test(address) ? address : null;
}

/**
 * The sender for alert mail. ALERT_FROM_ADDRESS must be set explicitly.
 *
 * There is deliberately NO fallback to RESEND_EMAIL_DOMAIN. That variable is
 * provisioned by the Vercel Resend Marketplace integration and points at
 * projectneptune.co, which is registered in a DIFFERENT Resend workspace and
 * has never been verified -- its DKIM and SPF records are not published at
 * all. Falling back to it would build a From address on an unverified domain
 * and have every send rejected, at the one moment nobody is watching. Failing
 * loudly here is the cheaper outcome.
 */
export function resendFrom(): string {
  const raw = process.env.ALERT_FROM_ADDRESS;
  const address = fromAddressEmail(raw);
  if (!address) {
    throw new Error(
      "ALERT_FROM_ADDRESS must be set to a verified sender, e.g. " +
        '"Project Neptune <updates@alerts.projectneptune.co>". ' +
        "RESEND_EMAIL_DOMAIN is NOT used as a fallback: it belongs to the " +
        "Marketplace integration's workspace and is unverified."
    );
  }
  const value = raw!.trim();
  return value.includes("<") ? value : `Project Neptune <${address}>`;
}

/**
 * The key alert mail sends under.
 *
 * ALERT_RESEND_API_KEY wins. RESEND_API_KEY is Marketplace-managed and belongs
 * to the workspace the integration created, which does not own the verified
 * sending domain -- it is kept only as a fallback so that removing the new
 * variable restores the previous behaviour rather than crashing.
 */
export function resendApiKey(): string | undefined {
  return process.env.ALERT_RESEND_API_KEY || process.env.RESEND_API_KEY || undefined;
}

export function createResendSender(
  fetchImpl: typeof fetch = fetch
): AlertSender {
  const apiKey = resendApiKey();
  if (!apiKey) {
    throw new Error(
      "No Resend API key configured: set ALERT_RESEND_API_KEY (preferred) or RESEND_API_KEY"
    );
  }
  const from = resendFrom();
  const replyTo = process.env.ALERT_REPLY_TO ?? "ethan@projectneptune.co";

  return {
    name: "resend",
    async send(msg, idempotencyKey) {
      let res: Response;
      try {
        res = await fetchImpl(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            // The key is only ever put in this header. It is never logged,
            // never returned, and never reaches the client bundle -- this
            // module is server-only.
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            // Resend keeps a key for 24h. Replaying the same key with the same
            // payload returns the original id WITHOUT sending again, which is
            // what makes a retry after an ambiguous crash safe.
            "Idempotency-Key": idempotencyKey.slice(0, 256),
          },
          body: JSON.stringify({
            from,
            to: [msg.to],
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
            reply_to: replyTo,
            headers: {
              // RFC 8058. Keeps the list off the spam-complaint path, and is
              // what Gmail's own unsubscribe control posts to.
              "List-Unsubscribe": `<${msg.oneClickUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }),
        });
      } catch {
        // DNS, TLS, socket, abort. Never surface the thrown value: it can
        // contain the request, and the request contains a recipient.
        return { ok: false, code: "network_error", retryable: true };
      }

      if (res.ok) {
        const body = await safeJson(res);
        const id = typeof body?.id === "string" ? body.id : null;
        return { ok: true, id, deduplicated: false };
      }

      const body = await safeJson(res);
      const code =
        (typeof body?.name === "string" && body.name) ||
        (typeof body?.error === "string" && body.error) ||
        `http_${res.status}`;

      // A replay of the same key with a DIFFERENT payload. The key was already
      // used on a request Resend accepted, so this person already has mail for
      // this date. Treating it as a fresh failure would send them a second one
      // tomorrow; treating it as sent is both true and the safe direction.
      if (res.status === 409 && code === "invalid_idempotent_request") {
        return { ok: true, id: null, deduplicated: true };
      }

      if (PERMANENT_CODES.has(code)) {
        return { ok: false, code, retryable: false };
      }
      if (RETRYABLE_CODES.has(code) || res.status >= 500 || res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        return {
          ok: false,
          code,
          retryable: true,
          retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
        };
      }
      // Unknown 4xx: do not retry it forever.
      return { ok: false, code, retryable: false };
    },
  };
}

async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Which transport the alert run should use. Defaults to gmail so that merging
// this change alone cannot move production mail; flipping ALERT_EMAIL_PROVIDER
// to "resend" is the deliberate cutover, and flipping it back is the rollback.
export function configuredProvider(): "resend" | "gmail" {
  return process.env.ALERT_EMAIL_PROVIDER === "resend" ? "resend" : "gmail";
}
