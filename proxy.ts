import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { isClerkConfigured } from "@/lib/clerkConfig";

// proxy.ts, not middleware.ts: Next 16 renamed the convention and deprecates
// the old name. A single function, default-exported, is what the file must
// provide (see node_modules/next/dist/docs — proxy.md).
//
// IT PROTECTS NOTHING, and that is the whole design. clerkMiddleware() only
// establishes the session so auth() can be read further in; it does not gate a
// route unless something calls auth.protect(), and nothing here does. Every
// board stays open to anonymous readers. An account is a thing you get when
// you pay, not a toll on the way in — this is a page people open to find out
// whether the water will make them ill, and a sign-in wall in front of that
// would be indefensible.
//
// Pass-through when Clerk is unconfigured, so the site is unchanged until the
// keys exist.
const clerkProxy = isClerkConfigured() ? clerkMiddleware() : null;
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // The local account preview contains sample data and no billing actions.
  if (process.env.NODE_ENV === "development" && request.nextUrl.pathname === "/pro/manage" && request.nextUrl.searchParams.get("preview") === "ended") {
    return NextResponse.next();
  }
  return clerkProxy ? clerkProxy(request, event) : NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
