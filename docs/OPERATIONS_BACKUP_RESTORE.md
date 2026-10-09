# Database Backup & Restore

**Status:** P0.9 of the Master Roadmap. This document plus the two scripts
it describes (`npm run db:backup`, `npm run db:backup:verify`) are real
and tested against a real MySQL 8 database — the scripts have been run
against a live copy of `travelhub_dev` and confirmed to produce a
genuinely restorable dump. What this document does **not** do: provision
real backup infrastructure (a cloud storage bucket, a scheduler, an
encryption-key vault). That wiring depends on decisions — which cloud
provider, retention budget, who holds the encryption key — that belong
to whoever owns Desavii's production infrastructure, not to a codebase
audit. Everything below is written so that wiring is a configuration
step, not a rewrite.

---

## 1. Backup strategy

### What gets backed up

The entire application database (`config.database.name` — `desavii`
locally, whatever `DATABASE_NAME` resolves to in a real environment) via
`mysqldump --single-transaction`. Every table in this schema is InnoDB
(every migration in `apps/api/src/infrastructure/database/migrations/`
declares `ENGINE=InnoDB`), so `--single-transaction` takes a consistent
snapshot without locking any table for the backup's duration — a backup
never blocks live traffic.

Not covered by this document, and requiring separate treatment before
production:

- **Redis** — holds rate-limit counters, session/login-attempt tracking,
  and BullMQ job queues. Nothing in Redis is a system of record (every
  durable fact lives in MySQL); losing Redis loses in-flight jobs and
  resets rate limits, but never loses booking/payment/user data. Decide
  whether BullMQ's at-least-once job semantics are enough, or whether
  Redis persistence (AOF/RDB) needs to be enabled once real background
  jobs (notification delivery, inventory reconciliation) matter in
  production.
- **Uploaded media** (listing photos, message attachments) — currently
  local-disk storage (P0.7 of the Master Roadmap covers replacing this
  with a real object-storage provider). Whatever that provider is, its
  own versioning/replication is the backup story for media — this
  document only covers the MySQL database.

### Recommended frequency and retention

**This is a recommendation for whoever owns Desavii's production
operations to review and adjust, not a mandate baked into the tooling.**
The scripts below don't enforce a cadence — that's a scheduler's job
(cron, a CI scheduled workflow, a cloud provider's managed backup
feature), none of which exist yet for this project.

A reasonable starting point for a marketplace of this size: daily full
backups retained 30 days, plus one backup per week retained 90 days,
plus one per month retained 1 year for financial/compliance reasons
(this app processes payment and refund records). Adjust based on actual
transaction volume and whatever compliance requirements apply to
Desavii's real jurisdiction.

### Encrypted storage (once wired to real infrastructure)

A `mysqldump` output contains everything: user emails, booking details,
payment references, connector credentials (now encrypted at rest inside
the dump itself as of P0.6 — the `inventory_connections.config` column's
ciphertext survives a dump/restore unchanged, since it's just a JSON
value like any other column). Wherever backups are stored once this is
wired to real infrastructure, that storage MUST be encrypted at rest
(e.g. S3 with SSE-KMS, or an equivalent on whatever provider is chosen)
and access-restricted to the smallest group of people/systems that
genuinely need it. Never commit a backup file to source control, and
never leave one on a developer's local machine longer than needed to
verify it.

---

## 2. Taking a backup

```bash
npm run db:backup --workspace apps/api
```

Writes a timestamped `.sql` file to `./backups` (relative to wherever
the command runs — override with `DB_BACKUP_DIR=/some/path`). Requires
`mysqldump` on `PATH` (override the binary location with
`MYSQLDUMP_BIN=/full/path/to/mysqldump` if it isn't). Targets whatever
`config.database.name` resolves to for the current `NODE_ENV` — in
practice this means the production database, once this script is wired
into a real deployment's scheduler with production's connection
settings in its environment.

The script never touches any database other than the one it reads from,
and never overwrites a previous backup (every filename is timestamped).

---

## 3. Verifying a backup is genuinely restorable

**A backup nobody has ever successfully restored is not a real backup —
it's an assumption.** This is the step most backup strategies skip.

```bash
npm run db:backup:verify --workspace apps/api -- --file=./backups/travelhub_dev_2026-08-19T18-27-43-304Z.sql
```

This restores the dump into a throwaway, randomly-named scratch database
(`travelhub_backup_verify_<random>`), confirms a representative sample
of core tables (`users`, `partners`, `listings`, `bookings`) actually
have rows in them, then drops the scratch database. It never touches
the real database — there is no code path in `verifyBackup.js` that
writes to `config.database.name` or to any pre-existing database at
all. Safe to run against a production backup file from any machine that
can reach the database server, without any risk to production data.

Run this immediately after every backup in a real operational setup
(a scheduler can do this automatically), and periodically re-verify
older retained backups — a dump that restored cleanly the day it was
taken can still degrade in storage (bit rot, a bad transfer) between
then and when it's actually needed.

---

## 4. Restoring for a real incident

This is the procedure for restoring the real, live database — read
this section carefully before running any of it, and confirm you are
targeting the intended database. There is no dry-run flag for this
step; it is the one genuinely destructive operation in this document.

1. **Stop write traffic.** Take the application out of service, or at
   minimum stop the API server, before restoring over a live database —
   otherwise in-flight writes race the restore and the end state is
   undefined.
2. **Back up the current (possibly corrupted) state first**, even if
   it's bad — `npm run db:backup --workspace apps/api`. A restore is
   itself risky; never discard the pre-restore state until the
   post-restore state is confirmed good.
3. **Restore the chosen dump:**
   ```bash
   mysql --host=<host> --port=<port> --user=<user> <database_name> < path/to/backup.sql
   ```
   (`MYSQL_PWD=<password>` as an environment variable, never
   `--password=` on the command line — the same reasoning `backupDatabase.js`/
   `verifyBackup.js` already follow.)
4. **Verify the restored data**, the same way `db:backup:verify` does
   for a scratch database — but this time against the real, now-restored
   database: spot-check row counts on the core tables, confirm the most
   recent bookings/payments you expect to see are actually present (or
   confirm you understand exactly which recent transactions were lost —
   any backup is only as current as when it was taken; anything written
   between that backup and the incident is gone unless a binary log or
   point-in-time-recovery mechanism is also in place, which this project
   does not currently have).
5. **Re-run migrations** (`npm run db:migrate --workspace apps/api`) if
   the backup predates a migration that has since shipped — a restored
   dump reflects the schema at backup time, not today's `main`.
6. **Resume write traffic** only after the above steps are confirmed.

### Migration rollback considerations

Every migration in this project has a paired `.down.sql` file and a
real, tested `npm run db:migrate:down --workspace apps/api`. Rolling
back a migration is a much smaller, faster operation than a full
database restore, and is the right tool when the problem is "the last
migration broke something" rather than "the whole database is
corrupted/lost." Two real caveats specific to this MySQL 8 schema,
already documented at the migration-runner level:

- **MySQL DDL is not transactional.** A migration file with multiple
  `ALTER TABLE`/`CREATE TABLE` statements that fails partway through
  can leave the schema in a partially-applied state — a plain
  `migrate down` may not cleanly reverse it. Check `npm run
  db:migrate:status --workspace apps/api` after any failed migration
  before assuming a rollback will be clean.
- **A `down` migration that drops a column is itself destructive** (the
  data in that column is gone, not just the column definition) — treat
  rolling back a migration that shipped real user data into a new
  column exactly like the restore procedure above: back up first.

---

## 5. Disaster recovery checklist

Use this as a starting checklist during a real incident, not as a
substitute for a real, rehearsed runbook once Desavii has production
infrastructure to rehearse against.

- [ ] Confirm the actual scope of the incident (one bad migration?
      Corrupted table? Full server/host loss? A security incident
      requiring forensic preservation before any restore?) — the right
      response differs significantly by scope.
- [ ] Stop write traffic to prevent further divergence.
- [ ] Identify the most recent verified-restorable backup
      (`db:backup:verify` should have already confirmed this — if it
      hasn't been run recently, verify now before trusting the backup).
- [ ] Back up current state before restoring over it, even if suspect.
- [ ] Restore following §4 above.
- [ ] Re-run pending migrations if the backup predates them.
- [ ] Verify restored data against known-good checkpoints (recent order
      volumes, spot-check specific bookings/payments if the incident
      report names any).
- [ ] Resume traffic.
- [ ] Write an incident report: what happened, what was lost (if
      anything — be specific about the time window between the backup
      and the incident), what will change to prevent a recurrence.
- [ ] If real customer payment data was involved in any way, follow
      whatever legal/compliance notification obligations apply in
      Desavii's actual jurisdiction — this document does not cover
      that; it is a legal question, not an engineering one.

---

## 6. What's still needed before this is production-grade

Honestly scoped, not overstated:

- **Scheduling** — nothing currently runs `db:backup` automatically.
  Needs a real scheduler (cron on a persistent host, a managed cloud
  backup service, or a scheduled CI/CD job) once production
  infrastructure exists.
- **Encrypted, off-host storage** — backups currently write to local
  disk (`./backups` by default). Production backups must land somewhere
  that survives the loss of the database host itself, encrypted at
  rest, per §1 above.
- **Point-in-time recovery** — this document only covers full-dump
  restore, which loses everything written since the last backup. A real
  production deployment should evaluate MySQL binary-log-based
  point-in-time recovery once backup frequency/retention needs are
  decided.
- **A rehearsed restore drill** — `db:backup:verify` proves a dump is
  technically restorable; it does not replace an actual team rehearsal
  of the full §4 procedure against a realistic incident scenario before
  the first time it's needed for real.
