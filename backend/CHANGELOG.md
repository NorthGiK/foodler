# Changelog

## Unreleased

- AI-agent changes require documentation review before commit and are delivered
  through a pushed `agent/...` branch, never directly to `main`.

## v1.5.1 — Subscription simplification and documentation alignment

- YooKassa is the only supported payment provider; the unused alternative
  verification flow and its dependency were removed.
- Added a forward migration that clears unsupported subscription entitlements
  and restricts provider values to `yookassa` and `legacy`.
- Receipt pagination now returns `X-Total-Count`, `X-Page-Offset` and
  `X-Page-Limit`.
- Rewrote subscription documentation to match the authoritative payment
  re-fetch flow, response fields, retention rules and supported methods.
- Updated README, agent rules, environment examples, architecture, legal texts
  and deployment configuration together with the code.

---

## v1.5.0 — Backend reliability and security

- Access JWT now has issuer, audience, type, short expiry and per-user revocation
  version. Refresh tokens and email codes are stored only as hashes; password
  changes revoke all sessions.
- CORS uses an allowlist, provider endpoints require authentication, rate limits
  are shared through the database, and metrics require a separate bearer token.
- Receipt and AI HTTP calls reuse a bounded connection pool and have explicit
  adapter errors/timeouts. Readiness checks the database; retention runs outside
  request handlers.
- YooKassa remains server-verified and idempotent.
- Subscription entitlement has one application service and one database source
  of truth; credits consult it before making decisions.
- Monetary values are stored as integer kopecks, receipt dates are typed, legacy
  data is migrated, and database indexes cover common user/date/status lookups.
- Receipt lists are paginated end to end; analytics aggregates spending in SQL,
  eager loading removes N+1 tag queries, and fuzzy product matching has a bounded
  candidate set.
- The runtime no longer calls `create_all`; Alembic is mandatory. Migration,
  security, provider failure, pagination and exact-money tests cover the new
  guarantees.
- CI audits the locked backend dependency graph against OSV.

---

## v1.4.1 — Subscription security hardening

### Critical security fixes

- **YooKassa webhook verification** — the payload is treated as an event hint;
  backend re-fetches the payment from YooKassa and verifies its trusted fields
- **Webhook idempotency** — duplicate `payment.succeeded` events no longer extend subscription repeatedly
- **Removed debug logging** — eliminated `print(payment.json())` that could leak sensitive payment data
- **Pending payment limit** — users can have at most 3 `in_progress` payments; excess attempts return `429 Too Many Requests`

### Bug fixes & improvements

- **Timezone-safe datetimes** — all subscription timestamps now use consistent UTC handling; no more naive/aware datetime comparison errors
- **Removed UNIQUE constraint on `Payment.user_id`** — allows multiple pending payments per user, controlled by application-level limit instead
- **Configurable subscription period** — added `SUBSCRIPTION_PERIOD_DAYS` env var (default: 30) instead of hardcoded value

### Tests

- Added trusted payment re-fetch and field validation tests
- Added webhook idempotency test
- Added pending payment limit tests (`429` when 3 pending, `200` when fewer)
- Updated timezone handling in all subscription tests
- Total: 17 subscription tests passing, 1 skipped (YooKassa API call)

### Migration

- New Alembic migration generated: `104d0685c008` removes `UNIQUE` constraint from `Payment.user_id` and adds index

---

## v1.4.0 — Multi-tier AI routing & bug fixes

### Multi-tier AI routing (`src/ai_service.py`)

Replaced single-model AI calls with a `TaskRouter` that maps each action to one of three tiers:

| Tier | Actions | Model | Cost |
|------|---------|-------|------|
| **LOCAL** (Level 0) | `overall-analysis`, `expiring-products`, `recipes`, `ingredients` | No AI — local analytics | 0 tokens |
| **LIGHT** (Level 1) | `save-money`, `healthy-food`, `habits`, `shopping-cart` | `AI_LIGHT_MODEL` (default: `gpt-4o-mini`) | Cheap |
| **STRONG** (Level 2) | `diet`, `ask` | `AI_STRONG_MODEL` (default: `gpt-4o-mini`) | Standard |

Key changes:
- **LOCAL actions** — 0 tokens, instant response, no credits deducted, no caching
- **LIGHT/STRONG actions** — context enriched with local analytics data before LLM call
- **Credits not deducted on cache hit**
- **Config replaced**: `AI_MODEL` → `AI_LIGHT_MODEL` and `AI_STRONG_MODEL` in `.env`

### New variables in `.env`

```env
AI_LIGHT_MODEL=gpt-4o-mini
AI_STRONG_MODEL=gpt-4o-mini
```

### Bug fixes

- **Score sections fixed**: `_local_overall_analysis` no longer returns `score` sections with value==max (always 100%)
- **N+1 query fixed**: `suggest_recipes()` now loads substitute products in 2 batch queries instead of 1 query per ingredient
- **HTTP timeout added**: AI API calls have `ClientTimeout(total=30)` — no more hanging requests
- **Parallel execution**: `get_spending_summary` and `get_nutrition_summary` run concurrently via `asyncio.gather`
- **Date parsing**: `get_fridge_status()` handles invalid dates with try/except instead of crashing
- **Receipt pagination**: `routers/ai.py` limits receipt loading to 200 (`.limit(200)`)
- **Recipe limit**: `suggest_recipes()` limits recipes to 50 (`.limit(50)`)
- **History pagination**: `GET /ai/history` now supports `skip` and `limit` query params
- **Removed unused `period` param** from `GET /ai/credits`
- **`ValueError` instead of generic `Exception`** in `config.py`

### Tests

- 3 new tests covering: LOCAL credits bypass, cache-hit without credit deduction, LOCAL receipts skip
- Total: 209 tests, all passing

---

## v1.1.0 — Family members support

### POST /ai/run — new field `members` in parameters

Added optional `members: [FamilyMember]` to `AiRequestParameters`:

```json
{
  "action": "overall-analysis",
  "parameters": {
    "members": [
      {
        "name": "Иван",
        "age": 35,
        "height": 180,
        "weight": 80,
        "gender": "Мужской",
        "additional_info": "аллергия на орехи"
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Имя члена семьи |
| `age` | `int` | Возраст в годах |
| `height` | `int` | Рост в см |
| `weight` | `int` | Вес в кг |
| `gender` | `string` | `"Мужской"` или `"Женский"` |
| `additional_info` | `string` | Привычки, аллергии, особые заметки |

AI will receive this data in the prompt and can tailor its recommendations to each family member.

## v1.2.0 — Feedback endpoint

### POST /users/send-feedback

Allows users to send feedback with optional images to the app owner (SMTP_USER).

```json
{
  "email": "user@example.com",
  "text": "Great app! But I found a bug...",
  "images": ["iVBORw0KGgo...", "iVBORw0KGgo..."]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `email` | `string` | Email пользователя для обратной связи |
| `text` | `string` | Текст сообщения |
| `images` | `string[]` | Base64-encoded изображения (опционально) |

Email is sent to the app owner (`SMTP_USER` from .env) with subject `Feedback from {email}`, text as body, and images as attachments.
