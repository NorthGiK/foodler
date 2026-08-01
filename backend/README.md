# Foodler Backend

FastAPI API для аккаунтов, чеков, подписок, базы продуктов, аналитики и
AI-рекомендаций. Общий запуск и правила находятся в [корневом README](../README.md).

## Локальный запуск

```bash
uv sync --all-extras
cp .env.example .env
uv run uvicorn src.main:app --reload
```

Swagger: `http://127.0.0.1:8000/docs`. Healthcheck: `/health`, остальные
маршруты имеют префикс `/api`.

```bash
uv run ruff check src tests scripts
uv run pytest
```

## Структура

- `src/routers/` — HTTP boundary.
- `src/schemas.py` — публичные request/response DTO.
- `src/models.py` — SQLAlchemy-модели.
- `src/analytics.py` — локальная аналитика без LLM.
- `src/ai_service.py` — маршрутизация LOCAL/LIGHT/STRONG.
- `alembic/` — миграции.
- `tests/` — unit, route и integration tests.

Backend владеет API-контрактом. После изменения route/schema выполните из корня
`make contract`, проверьте generated diff и обновите route test.

## Внешние сервисы

QR receipt API, AI provider, SMTP и YooKassa конфигурируются только через
environment. Тесты не должны обращаться к ним напрямую. YooKassa webhook сейчас
намеренно fail-closed (404) до реализации официальной проверки подлинности;
см. `docs/known-issues.md`.
