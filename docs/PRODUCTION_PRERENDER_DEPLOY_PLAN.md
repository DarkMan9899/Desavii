# Production Prerender Deploy Plan

Pass 3 remediation. This is a **plan and a proposed script**, not an applied
change — `desavii-deploy` (`/usr/local/bin/desavii-deploy` on the production
host) is external to this repository, opaque to this session (no SSH/server
access was available or used to inspect it), and was **not modified**. This
document is what a human operator (or a future session with server access)
should review and apply deliberately.

## Why this can't be a one-line `postbuild` hook

`npm run prerender` needs a **live, reachable API serving real production
data** to build its route manifest (`fetchRouteManifest.mjs` hits
`/search/categories`, `/search/destinations`, `/partners`, `/search`,
`/blog/posts`) — it is not a pure static build step. That means prerendering
production content can only happen *after* the production API is already
running the new code against the current database, not as part of a bare
`vite build` before the API restarts. Doing it earlier would either fail (no
API yet) or bake in stale/pre-migration data.

## Proposed sequence

```bash
#!/usr/bin/env bash
# PROPOSED desavii-deploy sequence — review and adapt to the real script's
# current structure; this is not a verbatim replacement, since this repo
# cannot see what desavii-deploy already does today.
set -euo pipefail

REPO_DIR=/srv/desavii            # adjust to the real path
RELEASE_DIST=/srv/desavii/apps/web/dist
LIVE_DIST=/srv/desavii-static/current   # whatever nginx actually serves today
STAGING_DIST=/srv/desavii-static/staging-$(date +%s)

# 1. Update checkout
cd "$REPO_DIR"
git fetch origin
git checkout main
git reset --hard origin/main

# 2. Install dependencies
npm ci

# 3. Build web assets (plain build only — NOT prerendered yet, the API
#    isn't running the new code against the new schema until step 6)
npm run build --workspace apps/web

# 4. Database backup (existing backup tooling — P0.9, `docs/
#    OPERATIONS_BACKUP_RESTORE.md` — already real and already exists;
#    invoke it here, do not reinvent it)
/usr/local/bin/desavii-backup-database   # placeholder for the real command

# 5. Migrations
npm run db:migrate --workspace apps/api

# 6. Restart API with the new code/env
sudo systemctl restart desavii-api      # or the real process manager command
# or, if PM2-managed (brief mentions "pm2 save" in step 13):
# pm2 reload desavii-api --update-env

# 7. Verify local API health BEFORE prerendering against it — fail closed,
#    do not proceed on a half-started process.
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:4000/health/ready && break
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "API did not become healthy after restart — aborting deploy." >&2
    exit 1
  fi
done

# 8. Prerender against the NOW-current production API/data
cd "$REPO_DIR/apps/web"
API_BASE_URL=http://127.0.0.1:4000/api/v1 \
VITE_PUBLIC_SITE_URL=https://desavii.com \
SKIP_BUILD=1 \
  npm run prerender
# prerender.mjs already fails non-zero on any per-route error — do not
# swallow that exit code. If this step fails, the deploy must stop here;
# do NOT fall back to serving the un-prerendered dist/.

# 9. The prerendered output already lives at $RELEASE_DIST (prerender.mjs
#    writes in place). Copy it to a fresh staging directory rather than
#    overwriting the live one directly — this is what makes step 11 atomic.
rm -rf "$STAGING_DIST"
cp -r "$RELEASE_DIST" "$STAGING_DIST"

# 10. Validate representative raw HTML BEFORE exposing it publicly — the
#     same seoRawHtml.spec.js assertions the CI seo-prerender job already
#     runs, pointed at the staging copy instead of a CI-local dist/.
#     (Requires Playwright's Chromium available on the production host —
#     see "Open risk" below; if unavailable, substitute the curl-based
#     spot checks shown further down.)
npx playwright test tests/e2e/seoRawHtml.spec.js --project=chromium \
  -- --dist-dir="$STAGING_DIST"   # spec would need a --dist-dir override added; see "Repo-side support" below
if [ $? -ne 0 ]; then
  echo "Raw HTML validation failed — aborting before the swap." >&2
  exit 1
fi

# 11. Atomic swap — a symlink flip, not a directory overwrite, so nginx
#     never serves a half-copied directory.
ln -sfn "$STAGING_DIST" "$LIVE_DIST"
sudo systemctl reload nginx   # or however static content is re-read

# 12. Public health check against the real, now-live URL.
curl -sf https://desavii.com/ > /dev/null || { echo "Public health check failed" >&2; exit 1; }
curl -sf https://desavii.com/sitemap.xml > /dev/null || { echo "sitemap.xml missing" >&2; exit 1; }

# 13. Process-manager persistence / cleanup
pm2 save   # if PM2-managed
# prune old staging directories older than N releases, keep a rollback target
```

## Repo-side support this pass DID implement (real, tested, not touching the server)

- The `seo-prerender` CI job (kept, per section 18) already proves steps
  8–10's mechanism works end-to-end against a real (ephemeral, seeded)
  database.
- `staticServer.mjs`'s documented resolution order (exact file match →
  `<route>/index.html` → root `index.html` fallback) is exactly what the
  production static host (nginx `try_files`, or equivalent) must already
  implement for the prerendered output to work at all — verify the current
  nginx config matches this before step 11 is ever attempted for real.

## Open risks / what still needs a human decision

1. **Chromium on the production host.** Step 10 as drafted needs
   Playwright's Chromium available there. Per the brief's explicit caution
   ("do not casually make production deployment depend on downloading/
   installing a full browser at deploy time"), the safer alternative is:
   run steps 8–10 in CI (which already has Chromium cached) against a
   **read replica or a tunneled connection to the production API**, then
   `scp`/`rsync` the validated `dist/` to the production host for the
   atomic swap — Option B from the original brief. This avoids installing
   a browser on the production host at all. Which of these two is
   preferred is a decision only the person who controls the production
   host's disk space, image, and hardening posture should make.
2. **`--dist-dir` override doesn't exist yet** in `seoRawHtml.spec.js` —
   it currently always reads `apps/web/dist`. If step 10 is adopted as
   drafted, that's a small, additive test-runner argument to add (with its
   own test), not a production change — happy to implement it once the
   Chromium-location decision above is made, since it depends on it.
3. **`desavii-deploy`'s actual current content is unknown to this repo.**
   Everything above is a proposal built from what this repo can prove
   (prerender's real requirements, the CI job's proven mechanism) — it is
   not a diff against the real script, since no access to read it was
   available this pass.
4. **Backup/restart commands above are placeholders** — `docs/
   OPERATIONS_BACKUP_RESTORE.md` documents the real backup tooling; the
   restart command depends on how the API process is actually supervised
   in production (systemd vs. PM2 vs. something else), which this repo
   doesn't state authoritatively.

## Fail-closed principle applied throughout

Every step above either `set -e`-aborts or explicitly checks an exit
code/HTTP status before proceeding — migrations before restart, health
check before prerender, prerender's own non-zero exit before the copy,
raw-HTML validation before the swap, public health check after. A failure
at any step stops the deploy with the live site still serving the
previous, known-good static output (the symlink swap in step 11 is the
only point of no return, and everything before it is non-destructive to
what's currently live).
