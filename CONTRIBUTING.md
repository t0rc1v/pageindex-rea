# Working on this repo

A cheat sheet for the loop this project uses: branch → PR → checks → merge →
migrate → deploy. Skim it until it's automatic.

If you only remember three things:

1. **Never push to `main`.** Branch, PR, merge.
2. **Migrations go to production before the code that needs them merges.**
3. **Never edit a migration that has already run.** Add a new one.

When it runs but something is wrong — 500s, a console error, a suite that rots —
`docs/DEBUGGING.md` maps symptoms to causes. The three things above are about
changing the repo; that file is about diagnosing it.

---

## The three databases

| Database | Used by | Connection lives in |
| --- | --- | --- |
| dev branch | you, locally | `.env.local` |
| `ci` branch | the `e2e` job | GitHub repo secrets |
| production | the `Migrate database` workflow | GitHub `production` environment secret |

They never mix. Nothing you run locally can reach production, and CI cannot
either — that is the point of the split.

---

## Daily loop (no schema change)

```bash
git switch main && git pull
git switch -c fix-citation-gap

# …work…

pnpm lint && pnpm test          # optional locally; CI runs both
git add -A
git commit -m "fix(chat): keep the citation preview on screen"
git push -u origin fix-citation-gap
# GitHub prints a "Create a pull request" link — click it
```

On the PR: wait for **verify** (lint, types, unit, migration checks, build), review
your own diff, **Squash and merge**, **Delete branch**, then:

```bash
git switch main && git pull
```

---

## Schema-change loop (the one with order)

```bash
git switch main && git pull
git switch -c add-doc-tags

# 1. edit lib/db/schema.ts
pnpm db:generate                 # writes SQL into lib/db/migrations
git diff lib/db/migrations       # READ IT — CI cannot judge intent
pnpm db:migrate                  # applies to your dev branch
pnpm test
pnpm dev                         # exercise the change

git add -A
git commit -m "feat(db): add document tags"
git push -u origin add-doc-tags
```

Then, in this order:

1. Open the PR. `verify` proves the SQL was committed; `e2e` applies it to the
   **ci** branch and runs the UI suite.
2. **Actions → Migrate database → Run workflow** → branch `add-doc-tags` → type
   `migrate` → approve. This applies it to **production** while the old code is
   still serving, which is safe for additive changes.
3. **Squash and merge.** This triggers the Vercel deploy — now the column and the
   code that reads it exist together.
4. Delete the branch, `git switch main && git pull`.

**Why not merge first?** Merging deploys immediately. New code reading a column
that doesn't exist yet is 500s until you migrate. Migrating first closes that
window.

**Destructive changes are different** (drop, rename, change type). Those take two
releases: add the new thing and deploy, then remove the old one later.

---

## What fires when

| You do | What runs |
| --- | --- |
| `git push` a branch with no PR | nothing |
| Open a PR / push to an open PR | `verify` + `e2e` |
| **Migrate database → Run** | applies that branch's migrations to **production** |
| Merge to `main` | `verify` + `e2e` on `main`, **and** the Vercel deploy |

CI does **not** gate the deploy. Ordering is your job, which is why the migration
step comes before the merge.

---

## Migration rules

- **Never edit a migration that has already been applied** anywhere — dev, CI or
  production. Drizzle will see different SQL and try to run it again. New change,
  new file.
- Never paste generated SQL into Neon's SQL editor: the schema changes but
  `__drizzle_migrations` does not, and the next `db:migrate` re-applies it.
- Never migrate on app boot: every instance would race.
- Migrations run through `DATABASE_URL_UNPOOLED` (direct). DDL through the pooler
  is where `drizzle-kit` fails first.
- `verify` fails with *"schema.ts changed but no migration was committed"* if you
  forget `pnpm db:generate`. That is the guard, not a nuisance.

---

## One-time setup (already done — for reference)

### Repository secrets (for CI's `e2e`)

Settings → Secrets and variables → Actions → **secrets**:

- `DATABASE_URL` — `ci` branch, pooled
- `DATABASE_URL_UNPOOLED` — `ci` branch, direct
- `CLERK_SECRET_KEY` — **development** instance
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — development instance

And **variables**: `E2E_CLERK_USER_EMAIL=pageindex-ci+clerk_test@example.com`.

Without these, `e2e` prints a skip notice and the rest of CI still runs.

### The `production` environment (for the migrate workflow)

Settings → Environments → `production`:

- **Required reviewers**: you. Leave **Prevent self-review** off, or your own
  migrations can never be approved.
- **Deployment branches**: **All branches**. Restricting this breaks dispatching
  from a feature branch, which is the step above.
- **Environment secret**: `DATABASE_URL_UNPOOLED` = production branch, direct.

An environment secret overrides a repository secret with the same name, so the
migrate job cannot pick up the CI URL by accident.

### Branch protection for `main`

Settings → Branches → Add rule, pattern `main`:

- ☑ Require a pull request before merging — **leave `Require approvals` unticked**
  (ticking it forces 1–6 approvals, and GitHub forbids self-approval, so a solo
  maintainer would deadlock)
- ☑ Require status checks to pass → `verify`
- ☑ Do not allow bypassing the above settings
- ☐ Allow force pushes, ☐ Allow deletions

Verify with `git push origin main` → `GH006: Protected branch update failed`.

---

## Failure playbook

| Situation | Do |
| --- | --- |
| `verify` red on a PR | Fix on the same branch and push; the PR updates itself |
| "schema.ts changed but no migration" | `pnpm db:generate`, commit the SQL |
| Migration failed in production | Fix **forward** with a new migration; never edit the failed one |
| Merged before migrating | Dispatch Migrate immediately; additive columns survive a short window |
| Migrated, then abandoned the PR | The column stays in production; remove it later with its own migration |
| Accidentally committed on `main`, not pushed | `git branch my-change` → `git reset --hard origin/main` → `git switch my-change` |
| Accidentally pushed to `main` | Don't rewrite history. Branch from there; `git revert` if it's broken |
| e2e skipped in CI | Repo secrets missing — expected on forks |
| e2e fails on sign-in | `pnpm e2e:user` (locally) or the CI provisioning step |

---

## Local e2e

```bash
pnpm build        # the suite serves .next
pnpm e2e:user     # create the sign-in account if this Clerk instance lacks it
pnpm test:e2e     # PLAYWRIGHT_CHANNEL=chromium on a machine without Chrome
```

PageIndex and the model are stubbed; Clerk and Postgres are real. The setup clears
the test user's conversations, registers its document through the real upload
path, and restores the display name.

---

## Useful commands

```bash
pnpm dev            # local app
pnpm test           # unit tests
pnpm test:e2e       # browser tests
pnpm lint           # eslint
pnpm exec tsc --noEmit
pnpm build          # also runs typegen + typecheck

pnpm db:generate    # schema.ts → SQL
pnpm db:migrate     # apply pending migrations (dev branch)
pnpm db:studio      # browse data
pnpm db:claim       # attach pre-existing upstream documents to a tenant
pnpm e2e:user       # provision the e2e sign-in account
```
