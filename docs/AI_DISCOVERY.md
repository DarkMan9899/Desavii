# AI-assisted discovery (Home "Ask Desavii")

How Desavii's AI layer turns a traveller's own words into a real search,
what it is never allowed to do, and how the same layer can serve partners
later without sharing their permissions.

## 1. What already existed (audit, 2026-10-29)

AI infrastructure: **EXISTS**, provider-agnostic.

| Part | Where |
| --- | --- |
| Providers | `apps/api/src/modules/ai/providers/` — OpenAI, Anthropic, Gemini, Azure OpenAI, Ollama, and `local` (a deterministic stand-in: templates and keyword rules, no model), selected by `AI_DEFAULT_PROVIDER` (default `local`) through `ProviderRegistry` |
| Gateway | `services/aiService.js` — provider selection, Redis response cache (keyed by a SHA-256 hash of the messages), bounded retries, usage recording (user, feature, provider, tokens, latency — never the request text) |
| Prompts | `prompts/*.js` with `promptGrounding.js` (system prompt + grounding clause; no prompt text in services or React) |
| Traveller AI | search parse (`POST /ai/search/parse`), assistant, trip planner, recommendations, memory |
| Partner AI | `/ai/partner/listings/:listingId/{description,seo,title,amenities,translate,faqs}`, `/ai/partner/usage` — `PartnerAiService` resolves the listing through the partner's own ownership (`#resolveOwnedListingContext`) before any call |
| Admin AI | moderation queue / scoring, usage dashboards (permission-gated) |
| Limits | `aiRateLimiter` on every AI route; `publicRateLimiter` platform-wide |
| Frontend | `apps/web/src/api/ai.js`, `apps/web/src/modules/ai/` (`AiSearchBar` on the Search page, assistant, trip planner, partner tools) |

In this environment no model is configured (no provider keys, default
`local`), so the honest state of traveller AI search here is **not
available**.

## 2. The Home flow

```
the traveller's words
  → POST /ai/search/parse {query, locale}        (signed in, rate-limited)
      model: restates the request as a short keyword phrase
      server: resolves destination, category and amenities against the
              real catalog in that locale (names and slugs) — ids are
              never taken from the model
  → interpreted intent shown as chips (destination, category, amenities,
    search words), each removable — nothing opens on its own
  → "Show results": the same normalisation and URL builder as /search
  → GET /search — real listings, prices and availability only
```

- `GET /ai/search/availability` (public, no model call) returns only
  `{available}`: true only when the default provider is a real model —
  the `local` stand-in never counts. While false, Home shows the composer
  disabled with "Ask Desavii is not available yet" and a way back to
  Search; nothing pretends to be AI.
- Guests are asked to log in (the parse route is per-user rate-limited and
  usage-tracked); the request is kept in `sessionStorage` for that tab and
  restored on return (`/{locale}?ask=1`), then forgotten.
- AI failure is not search failure: the request stays, and "Search with
  these words" puts it into the structured fields at once.
- One mapping (`modules/ai/utils/parsedSearchToFilters.js`) serves both the
  Search page's `AiSearchBar` and Home, so the two can never disagree.

Supported today: destination (city), category, amenities and a keyword
phrase. Dates, party size, price, cuisine, duration, family or vehicle
needs and accessibility are **not** derived yet — adding them means asking
the model for a structured intent (JSON) and validating every value
server-side against the same catalogs and the category's capabilities
(`getSearchCapabilities`), never trusting the model's values.

## 3. Security review

| Concern | Status |
| --- | --- |
| Prompt injection | The model's output is used only as a keyword string. Ids come from deterministic catalog matching, so injected text cannot select data it could not already search for. |
| Output escaping / HTML injection | All AI text is rendered as React text (no `dangerouslySetInnerHTML`); chips and keyword wrap safely. |
| Rate limiting | `aiRateLimiter` on parse; availability is under `publicRateLimiter` and makes no model call. |
| Provider secrets | Never sent to the browser; availability exposes no provider, model or key. |
| System prompts | Server-side only (`prompts/`); never returned. |
| PII | The request text goes to the configured provider (state this in the privacy notice before enabling a provider). It is not written to usage records or logs; cached responses are keyed by hash and expire (`AI_CACHE_TTL_SECONDS`). |
| Private listings / partner data | Parse reads only the public catalogs (categories, destinations, filter definitions); results come from the public Search API with its visibility rules. |
| Identity | Parse requires `requireAuth`; the principal is the server's, never the client's. |
| Error leakage | Only localized messages are shown — `AiSearchBar` no longer displays server error text. |

## 4. Partner AI later — one layer, separate boundaries

The traveller and partner features already share the gateway (`AiService`:
provider, cache, retries, usage), the prompt grounding, and the registry.
Partner capabilities to build on the same layer:

- listing creation and description assistance; missing-field suggestions;
- listing quality and amenity completeness (against the category's real
  attribute and amenity catalog);
- HY/EN/RU localization (the existing `translate` route);
- publish readiness and moderation preparation (with the admin moderation
  scoring);
- operational assistance for a partner's own bookings.

What must **not** be shared: authorization. Every partner feature resolves
the listing or booking through the partner's own ownership
(`#resolveOwnedListingContext`), uses partner-scoped usage reporting, and
never runs from a traveller route; traveller features never read
partner-only fields. Availability for partner tools should use the same
`isModelBacked()` rule, so neither side presents the `local` stand-in as AI.
