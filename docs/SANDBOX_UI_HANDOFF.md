# Neptune sandbox UI handoff

## Working state

- Branch: `feature/sandbox-ui-ux`.
- All work is local and uncommitted. Do not discard the existing changes or untracked files.
- No deployment, push, merge, or billing/auth configuration changes were performed.
- User wants to review layouts and fill in the copy personally. STOP after delivering these shells; do not fill placeholders automatically.
- Never modify `/southbay`, Stripe, Clerk, webhooks, entitlement/redaction, subscription/database logic, or the live billing kill switch for this UI work.

## Local preview

Run `npm run dev` from this repository if no server is running. The existing preview used port 3000.

- http://localhost:3000/sandbox
- http://localhost:3000/sandbox/how-it-works
- http://localhost:3000/sandbox/stories
- http://localhost:3000/sandbox/team
- http://localhost:3000/sandbox/sources

Chrome must use localhost to see these changes. The live site is not deployed.

## Files for this secondary-page request

Created:

- `app/sandbox/(editorial)/layout.tsx`: noindex/nofollow metadata and shared editorial shell. The route group does not appear in URLs.
- `app/sandbox/(editorial)/how-it-works/page.tsx`: hero, intro, four numbered steps, methodology note, disclaimer placeholder, three functioning FAQ disclosures.
- `app/sandbox/(editorial)/stories/page.tsx`: hero, one featured quote plus four story placeholders, two optional metrics, disabled request-your-beach CTA.
- `app/sandbox/(editorial)/team/page.tsx`: Max and Ethan, portrait placeholders, roles/bios, founder story, neutral advisor/scientist placeholder.
- `app/sandbox/(editorial)/sources/page.tsx`: four source groups with two placeholder source rows each, anchor navigation, review-note placeholder.
- `components/sandbox/SandboxEditorial.tsx`: reusable shell, hero, numbered section, photo placeholder, team member, story, source row.
- `components/sandbox/SandboxEditorial.module.css`: scoped editorial and drawer styling, responsive layouts.
- `components/sandbox/SandboxMenu.tsx`: reusable sandbox-only navigation drawer.
- `docs/SANDBOX_UI_HANDOFF.md`: this document.

Modified:

- `components/sandbox/SandboxDashboard.tsx`: imports and displays the menu beside the existing account control.
- `components/sandbox/SandboxDashboard.module.css`: allows the logo to shrink when the new menu is present on narrow screens.

## Navigation behavior

- Desktop: 440px-wide drawer at the right edge, full viewport height, dim backdrop.
- Mobile: full width and full dynamic viewport height; safe-area padding at the bottom.
- Native modal dialog keeps background content inert. Opening focuses Close; explicit Tab/Shift+Tab wrapping; Escape, Close, and desktop backdrop close the drawer. Focus returns to the trigger. Background scrolling is restored on close/unmount.
- Links close the drawer and navigate. Current route is highlighted.
- Menu groups: About Neptune (How Neptune Works, Why It Matters, Meet the Team), Transparency (Data & Sources), Back to Water Quality at the bottom.
- No Neptune Pro item in this menu.

## Content ownership

All new narrative copy is intentionally bracketed placeholder text. Page titles, section labels, interface labels, Max, and Ethan are the only non-placeholder identifiers. No final scientific explanation, testimonial, stat, bio, credential, or source was invented.

- Replace bracketed text in page files and reusable component props with user-approved text.
- SourceRow accepts `title`, `description`, and optional `href`. Without a real verified URL it renders an inert `[External link]` label, not a fake anchor.
- Request-your-beach is disabled with a visible placeholder note. No form or backend was added.
- Photos are deliberate neutral boxes, not fake people or broken image links.
- All four new pages are noindex/nofollow.

## Reference material

Reviewed the PDF at:
`/Users/ethanyoung/Downloads/Copy of Neptune Pro — Credibility & Likability Mockups (Sept 2026).pdf`

Team, Why It Matters, and Sources pages inspired the hierarchy and structure only. No wording from the PDF was inserted as final production copy. The PDF has inconsistent advisor names/roles, so the UI intentionally uses `[Advisor / scientist name]` and `[Role / credentials to confirm]`. Confirm identities, credentials, quote consent, and source links before publishing actual content.

## Earlier sandbox work already in this working tree

- `app/[location]/page.tsx` has a narrow `location === "sandbox"` presentation return AFTER the existing entitlement redaction. Everything in the original shared return remains unchanged.
- `components/sandbox/SandboxDashboard.tsx`, `SandboxBeachDetail.tsx`, `SandboxProOffer.tsx`, and `SandboxDashboard.module.css` implement the previously approved dashboard redesign.
- Neptune Index is a heading for Low / Moderate / High bacteria. Do not add a 0–100 score.
- Dashboard copy: `Daily water-quality` and `Know what you're going into.`
- Pro CTA is a simple side-by-side Free vs Pro comparison and the exact button text `Become an early member of Neptune Pro for $5/month`.
- The CTA uses the existing monthly checkout endpoint only when the unchanged checkoutReady gate permits it; otherwise it is disabled. No live-billing switch was enabled.
- Elevated-bacteria emails exist; all-clear emails are NOT implemented in the existing alert sender. The latest compact comparison does not promise them. Do not add that promise without separately approved implementation.

## Validation

- `npx tsc --noEmit`: passed after Next regenerated route types. An initial stale `.next/dev/types` error disappeared after route generation/build; do not edit generated type files by hand.
- Targeted ESLint on sandbox components/pages: passed.
- `npm run lint`: 0 errors; two existing unused-variable warnings in `lib/data.ts` (`code` and `thresholdMap`). That file was not modified.
- `npm run build -- --webpack`: production build passed, listing all four new static routes. Webpack is used only via CLI; package scripts/config are unchanged. Default Turbopack previously failed in this host due to worker port permissions.
- `git diff --check`: passed.
- Browser: dashboard menu, all four page URLs, desktop drawer geometry, 390px full-height/full-width drawer, active route styling, link navigation, Escape/focus return, Tab/Shift+Tab wrapping, FAQ expansion, mobile layout inspected. Narrow 320px methodology page had no document overflow.
- `/southbay`: original shared rendering path byte-for-byte unchanged; visible server-rendered main markup matches saved pre-redesign baseline after excluding Next development-only diagnostic templates. Shared UI components, global CSS, and protected infrastructure files were not modified.

## Resume guidance

Read this file and current git diff first. Keep changes in sandbox-only components and the editorial route group. Read relevant local Next docs in `node_modules/next/dist/docs/` before editing, per AGENTS.md. No new dependencies were added. Await the user's layout/copy review before doing more.
