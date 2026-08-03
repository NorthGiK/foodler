# Changelog

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
