// Whether Clerk is wired up.
//
// NOT server-only, and no "use server": the proxy reads it at the edge, the
// root layout reads it on the server, and both need the same answer.
//
// Clerk is OPTIONAL by design. The boards are anonymous — a reader checking
// whether the water is clean has never needed an account and still does not —
// so an unconfigured Clerk must leave the site exactly as it was rather than
// taking it down, the way a missing PostHog key currently does. Accounts exist
// only for Pro, and only Pro asks for one.

export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
}
