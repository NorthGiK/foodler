# Changelog

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