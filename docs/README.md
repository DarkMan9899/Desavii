# Architecture Documents

This folder should contain all nine finalized architecture documents.
**Current state, honestly:**

| Document | Format present here | Note |
|---|---|---|
| `PROJECT_BIBLE.md` | **Missing** | Originally supplied as pasted text early in this project's planning conversation, never saved as a standalone file. Add the authoritative copy here before Sprint 2. |
| `UI_UX_GUIDELINES.docx` | `.docx` | Generated as a Word document (title: "Design Language") before this project standardized on Markdown for architecture docs. Content is final; consider a `.md` conversion for consistency with the rest of `docs/`. |
| `DATABASE_ARCHITECTURE.docx` | `.docx` | Same note as above. |
| `BOOKING_ENGINE_ARCHITECTURE.md` | `.md` | Complete |
| `CALENDAR_AVAILABILITY.md` | `.md` | Complete — date/timezone semantics per unit type, availability precedence, concurrency, range limits, and the Partner Calendar (Calendar Excellence) |
| `API_SPECIFICATION.md` | `.md` | Complete |
| `FRONTEND_ARCHITECTURE.md` | `.md` | Complete as a document — **but see its Implementation Status Addendum**: §4.2/§6.1 describe per-vertical routes/modules that were never built |
| `BACKEND_ARCHITECTURE.md` | `.md` | Complete as a document — **but see its Implementation Status Addendum**: §8–14/§16 describe a per-vertical-module and rate-plan/tax engine that were never built |
| `COMPONENT_LIBRARY.md` | `.md` | Complete |
| `SPRINT_0_IMPLEMENTATION_PLAN.md` | `.md` | Complete — note its repo-topology recommendation (§3.1, two repos) was superseded by direct instruction at the start of Sprint 1; this monorepo is what was actually built. |

This gap (missing `PROJECT_BIBLE.md`, two docs in `.docx` rather than
`.md`) is called out here deliberately rather than silently — flagged for
whoever owns documentation hygiene to close out, not something Sprint 1
was in scope to fix on its own.

**"Complete" in this table means the document itself was finished being
written — it is not a claim that every module/table/route the document
describes was actually implemented.** A P2 forensic audit (2026-08-24)
found `FRONTEND_ARCHITECTURE.md` and `BACKEND_ARCHITECTURE.md` describe
several per-vertical modules (Hotels, Vacation Houses, Restaurants, SPA,
Cars, Tours, Events as separate backend/frontend modules with dedicated
database tables) and a rate-plan/tax/commission pricing engine that were
never built. Both documents now carry an inline
"IMPLEMENTATION STATUS ADDENDUM" near their top and inline warnings on
the specific sections affected, pointing to a new section in each
(`BACKEND_ARCHITECTURE.md` §7A, `FRONTEND_ARCHITECTURE.md` §4.2A)
describing the simpler, unified, metadata-driven architecture that was
actually shipped. Every other section of both documents was checked
against the running code during that audit and found accurate.
