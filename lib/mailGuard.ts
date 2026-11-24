// Outside production, no email may reach a real person.
//
// Local dev and Vercel Preview deployments can read real subscriber addresses
// (they have shared the production database) and hold real mail credentials. So
// every outbound message — Gmail/nodemailer and Resend alike — passes through
// here. In production it is untouched. Anywhere else the recipient is replaced
// with MAIL_SANDBOX_RECIPIENT (falling back to ALERT_TEST_RECIPIENT), and the
// subject is tagged with where it came from and who it was meant for. With no
// sandbox recipient configured, sending fails rather than guessing.
//
// "Production" means Vercel says so: VERCEL_ENV === "production". A missing
// VERCEL_ENV (a bare `next dev`, a script) counts as NOT production on purpose.

type Env = Record<string, string | undefined>;

export function isProductionMail(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

function sandboxRecipient(env: Env): string {
  const to = (env.MAIL_SANDBOX_RECIPIENT || env.ALERT_TEST_RECIPIENT || "").trim();
  if (!to) {
    throw new Error(
      "Email blocked outside production: set MAIL_SANDBOX_RECIPIENT to receive test mail"
    );
  }
  return to;
}

function describe(to: unknown): string {
  if (Array.isArray(to)) return to.map(describe).join(", ");
  if (to && typeof to === "object" && "address" in to) {
    return String((to as { address: unknown }).address);
  }
  return String(to ?? "");
}

/** Recipient + subject to actually use for one message. */
export function guardRecipient(
  to: string,
  subject: string,
  env: Env = process.env
): { to: string; subject: string } {
  if (isProductionMail(env)) return { to, subject };
  const where = env.VERCEL_ENV || "local";
  return { to: sandboxRecipient(env), subject: `[${where} → ${to}] ${subject}` };
}

/** nodemailer options with to/cc/bcc collapsed onto the sandbox recipient. */
export function guardMailOptions<T extends { to?: unknown; cc?: unknown; bcc?: unknown; subject?: string }>(
  options: T,
  env: Env = process.env
): T {
  if (isProductionMail(env)) return options;
  const original = [options.to, options.cc, options.bcc]
    .filter((v) => v !== undefined && v !== null && v !== "")
    .map(describe)
    .join(", ");
  const guarded = guardRecipient(original, options.subject ?? "", env);
  return { ...options, to: guarded.to, cc: undefined, bcc: undefined, subject: guarded.subject };
}

/** Wrap a nodemailer transport so every sendMail goes through guardMailOptions. */
export function guardTransport<T extends { sendMail: (...args: never[]) => unknown }>(
  transport: T,
  env: Env = process.env
): T {
  if (isProductionMail(env)) return transport;
  const send = transport.sendMail.bind(transport) as (...args: unknown[]) => unknown;
  (transport as { sendMail: unknown }).sendMail = (options: Record<string, unknown>, ...rest: unknown[]) =>
    send(guardMailOptions(options, env), ...rest);
  return transport;
}
