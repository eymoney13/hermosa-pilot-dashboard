# Building and testing California features before they go live

## The three places the site runs

| Where | How you get there | Who sees it | `VERCEL_ENV` |
|---|---|---|---|
| **Local** | `npm run dev` → http://localhost:3000/california | Only you | `development` (or unset) |
| **Preview** | Push any branch that isn't `main` → Vercel posts a URL on the PR | Anyone with the link | `preview` |
| **Production** | Merge to `main` | Everyone at projectneptune.co | `production` |

`/sandbox` is a copy of the California board that only exists locally (production
redirects it to `/california`). Use it to try layout ideas without touching the real page.

## The routine for every feature

1. **Branch off `main`.** If your main folder has uncommitted work, use a worktree so the
   two never mix:
   ```sh
   git fetch origin
   git worktree add ../neptune-my-feature -b feature/my-feature origin/main
   cd ../neptune-my-feature && npm ci && vercel env pull .env.local
   ```
2. **Build it locally.** `npm run dev`, open `/california` (or `/sandbox` for experiments).
3. **Push and open a PR.** `git push -u origin feature/my-feature`, then `gh pr create`.
   Vercel builds a Preview and comments its URL on the PR. Open it on your phone, and
   share it with anyone who should look.
4. **Let CI pass.** `.github/workflows/ci.yml` typechecks, lints, runs every
   `scripts/test-*.mjs`, and builds. A red check blocks the merge.
5. **Merge.** Production deploys from `main` in a couple of minutes.
6. **If production breaks:** Vercel dashboard → Deployments → the previous good one →
   **Instant Rollback**. Then fix it on a branch and go through the routine again.
7. **Clean up:** `git worktree remove ../neptune-my-feature`.

## What's safe to do on Preview and Local

- **Email** never reaches a real person outside production. `lib/mailGuard.ts` sends every
  message (alerts, Pro, purchase) to `MAIL_SANDBOX_RECIPIENT` instead, with the intended
  recipient in the subject: `[preview → someone@example.com] …`. If that variable is
  unset, sending fails instead.
- **Scheduled jobs** (alerts, data trigger, Stripe sync, Pro lifecycle) only run in
  production. They need `CRON_SECRET`, which exists only there.
- **Database:** Preview and Local use the `staging` branch of the Neon database, a copy of
  production. Sign-ups and test purchases there never touch real data. *(One-time setup
  below; until it's done they share the production database, so be careful.)*
- **Payments:** Local (and Preview, after setup step 3) use Stripe **test mode**. Pay with card
  `4242 4242 4242 4242`, any future date, any CVC.
- **Sign-in:** Clerk uses its test instance on Preview and Local, so accounts there are
  separate from real ones.

## One-time setup

These are account settings, not code, so they're done in dashboards:

1. **Separate database.** Neon console → project → Branches → *Create branch* `staging`
   from `main`. Copy its connection string. In Vercel → Settings → Environment Variables,
   set `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_*` and `PG*` for **Preview** and
   **Development** to the `staging` branch values; leave **Production** alone. (If the vars
   are managed by the Neon integration, enable its *Preview branching* option instead.)
   Then `vercel env pull .env.local` in each working folder.
2. **Test-mail inbox.** Add `MAIL_SANDBOX_RECIPIENT` = your own address to **Preview** and
   **Development**.
3. **Stripe test mode on Preview.** Copy the Development values of `STRIPE_SECRET_KEY`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and the test price IDs into **Preview**.
4. **Protect `main`.** GitHub → Settings → Branches → add a rule for `main`: require a pull
   request and require the `checks` status check.

## Shipping something before it's finished

Merge it hidden. Add a flag in `lib/features.ts`, leave it off for `california`, and turn it
on when it's ready: a one-line PR. That keeps branches short-lived, so they don't drift far from `main`.
