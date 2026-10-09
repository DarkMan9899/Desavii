# E2E test data lifecycle

Most specs in this directory only read seeded/demo data or exercise
already-existing accounts (`admin@travelhub.dev`, `vendor@travelhub.dev`,
etc.) and leave nothing behind. A small number of specs instead drive the
**real** registration / partner-application flow to reach a state that
can only be reached that way, and therefore create **real, permanent**
`users` and `partners` rows through the live API:

- `partnerOnboarding.spec.js`
- `partnerProfile.spec.js`
- `partnerStaff.spec.js`

These rows are named identifiably (`registerNewUser()`'s
`e2e-<prefix>-<timestamp>@example.com`; business names like
`E2E Staff Co ${Date.now()}`) but **none of the three specs delete
anything afterward**, and — by design — this product has no delete API
for either entity (`users`/`partners` only ever get soft-transitioned via
PATCH; see `modules/users/module.routes.js` and
`modules/partners/module.routes.js`). Per-test cleanup therefore isn't
achievable from inside the spec without adding a delete capability that
would only ever exist to serve test teardown — exactly what we don't want
in this codebase.

## The actual fix: run against a disposable database, not the dev one

`fixtures.js` is deliberately HTTP/Redis-only (see its header comment) —
no DB pool, matching the rest of this Playwright suite. That's correct:
the fix isn't in-spec cleanup, it's **which database the API server is
pointed at while this suite runs.**

`apps/api` already ships the exact tool for this:

```bash
# from apps/api — recreates, migrates, and seeds the disposable
# travelhub_test database; refuses to run against anything that doesn't
# look like a test database (see cli/resetTest.js)
npm run db:reset:test
```

Start the API server with `NODE_ENV=test` (so it targets
`DATABASE_NAME_TEST` / `travelhub_test`, per `src/config/index.js`)
before running `npx playwright test`, and run `db:reset:test` beforehand.
With a database that's wiped and reseeded before every run, the three
specs above leave no cross-run residue — there's nothing to clean up
because nothing persists past the next reset.

**Do not** run this suite against an already-running dev-mode
(`NODE_ENV=development`, `desavii` — the canonical local manual-QA
database) API server for anything beyond one-off manual/local
debugging — the development database is not reset between runs, so
every such run permanently accumulates `e2e-*@example.com` users
and `E2E *` partners with no automated way to remove them (2026-09-04:
root-caused and one-time-cleaned 38 stale users / 19 stale partners that
had accumulated in `travelhub_dev` this way).
