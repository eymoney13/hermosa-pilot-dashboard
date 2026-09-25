import "server-only";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "./clerkConfig";

// Who is allowed to see the paid half of a board.
//
// ONE function, on purpose. Everything else in the codebase asks this and
// nothing else, so what "entitled" means can change without anything else
// moving. It has already changed once — a hand-set cookie became a Clerk
// session — and it changes once more when Stripe lands and being signed in
// stops being enough on its own.
//
// FREE READERS NEVER AUTHENTICATE. There is no route protection anywhere (see
// proxy.ts): an anonymous reader gets the free board, and signing in is
// something you do because you pay, not something the site asks of you on the
// way in. This function returning false is the normal case, not an error.

/**
 * The development stand-in, used only while Clerk is unconfigured.
 *
 * Trivially forgeable — set `neptune_pro=1` in devtools. It exists so the
 * locked UI can be built and judged before any vendor is wired up, and it stops
 * mattering the moment CLERK_SECRET_KEY exists, because the branch below never
 * reaches it.
 */
const DEV_COOKIE = "neptune_pro";

export async function isEntitled(): Promise<boolean> {
  if (isClerkConfigured()) {
    // Signed in IS entitled, for now. Phase 3 narrows this to "signed in AND
    // holding a live subscription" — until then there is nothing to buy, so
    // an account is the only thing there is to check.
    //
    // auth() is async in Clerk Core 3, and it needs clerkMiddleware to have
    // run — proxy.ts runs it whenever Clerk is configured, which is the same
    // condition as this branch.
    const { userId } = await auth();
    return Boolean(userId);
  }

  const jar = await cookies();
  return jar.get(DEV_COOKIE)?.value === "1";
}
