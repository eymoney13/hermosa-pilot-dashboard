import "server-only";
import { cookies } from "next/headers";

// Who is allowed to see the paid half of a board.
//
// ONE function, on purpose. Everything else in the codebase asks this and
// nothing else, so replacing what "entitled" means — a Clerk session, then a
// live Stripe subscription — is a change to this file and to nowhere else.
//
// RIGHT NOW IT IS A COOKIE YOU SET BY HAND. There is no login and no payment
// yet, so this is a development stand-in for building and judging the locked
// UI, and it is trivially forgeable by anyone who reads this sentence. It must
// not reach a board that real readers are paying for.

/** The stand-in. Set `neptune_pro=1` in devtools to see the paid view. */
const DEV_COOKIE = "neptune_pro";

export async function isEntitled(): Promise<boolean> {
  // Async because Next 16 made cookies() async; keeping this signature a
  // promise now means Clerk and Stripe can slot in without every caller
  // changing shape.
  const jar = await cookies();
  return jar.get(DEV_COOKIE)?.value === "1";
}
