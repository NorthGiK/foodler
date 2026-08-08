# Changelog

# v0.0.8 — receipt identity and AI plans

### changed
- Receipt synchronization uses a server-side hash of a fiscal QR payload to make scanned receipts idempotent across devices.
- AI prompts now use action-specific templates; locally stored profile goals and restrictions are sent only with the active AI request.
- YooKassa payments carry either the Budget or Premium monthly plan.

### fixed
- External AI actions now request Markdown text rather than JSON section data,
  so their answers are rendered normally in the mobile application.
- AI prompts safely preserve literal JSON examples, so external AI actions no
  longer fail while rendering their request prompt.
- Receipt ordering is based on the purchase date; the obsolete local `createdAt` receipt field has been removed from new development databases.
- Legacy SQLite databases gain missing device metadata columns before device registration.
- Receipt import uses a provider's fiscal `dateTime` when `ticketDate` is absent.
- QR recognition preserves the provider's fiscal QR payload, saves authenticated
  scans on the server, and uses that payload for duplicate detection.
- Bulk sync and local SQLite normalize fiscal QR fields, so an already saved
  receipt cannot be re-added with a differently formatted QR string.
- Statistics and category screens initially show the current year so receipts
  with an earlier fiscal purchase date are visible immediately after scanning.
- Product categories are assigned by canonical server products and fiscal GTIN
  mappings instead of mobile keyword rules after synchronization.

###

# v0.0.7 — guest receipt-image recognition

### changed
- Receipt QR recognition from an image no longer requires an account. It
  returns recognition data without retaining the image or creating a receipt.

###

# v0.0.6 — AI storage and receipt-sync repair

### fixes
- Legacy backend SQLite databases gain the AI cache/report fields required by
  AI runs and history reads.
- Mobile sync sends receipt dates in the API's calendar-date format, and local
  AI report storage is initialized before loading reports.

###

# v0.0.5 — confirmation-code login fix

### fixes
- Confirming an email code no longer applies new-password requirements to an
  existing account or replaces its password during sign-in.

###

# v0.0.4 — AI-agent delivery workflow

### changed
- Root and scoped agent rules now require documentation review and updates
  before every commit.
- Completed AI-agent tasks are delivered through an `agent/...` branch with a
  scoped commit and push to `origin`; direct pushes to `main` are prohibited.

###

# v0.0.3 — reliable receipt synchronization

### fixes
- Fresh backend SQLite databases are now created through the Alembic migration
  chain, so the deployment migration service can initialize its persistent
  volume before the API starts.
- The migration chain now creates the AI credit usage ledger required by
  `GET /api/ai/credits`.
- A newly saved local receipt queues an upload while the user is signed in;
  receipts downloaded from the server are marked as already synchronized.
- Password fields on mobile now provide an accessible show/hide toggle.

###

# v0.0.2 — fix init_db

### fixes
- changed `async_session.connection` to `async_session.begin` + импорт моделей 

###

---

## v0.0.1 — added db init if it doesn't exists

### fixes
- **created function `init_db`** — and added to lifespan

---

## v Not Documented

### Решения

Backend и mobile живут в одном репозитории. FastAPI routes и Pydantic schemas —
источник публичного контракта. OpenAPI и TypeScript API-типы генерируются и
коммитятся; CI проверяет отсутствие drift.

### Причины

- Изменение API и клиента становится атомарным.
- Агенту не нужно вручную сопоставлять два набора DTO.
- Reviewer видит фактическое изменение wire format.
- Один README, набор команд и quality gates уменьшают скрытые знания.

### Последствия

- Generated-файлы нельзя редактировать вручную.
- Любое API-изменение включает `make contract`.
- Mobile-specific UI/state всё равно изменяются вручную, если новая возможность
  должна появиться в интерфейсе; генерация устраняет только контрактный drift.

---
