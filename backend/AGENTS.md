# Backend agent rules

Сначала прочитайте корневые `README.md` и `AGENTS.md`.

## Архитектурные правила

- Routes принимают/возвращают Pydantic-модели и объявляют `response_model`.
- Изменение публичной схемы завершается `make contract` из корня.
- SQLAlchemy используется только асинхронно. Связи загружаются явно в запросе;
  `Product.aliases` и `Product.tags` нельзя лениво читать в async-контексте.
- Изменение модели БД сопровождается Alembic migration и тестом upgrade.
- LOCAL AI actions не вызывают LLM, не используют AI cache и не списывают
  credits.
- Операции списания credits и обработки платежей должны быть атомарными и
  идемпотентными.
- Внешние сервисы вызываются через адаптер с timeout; тесты обязаны мокировать
  сеть.
- Используйте `logging.getLogger(__name__)`. Не добавляйте `print`, payload
  чеков, email, токены и AI-контекст в логи.

## Проверки

```bash
uv run ruff check src tests scripts
uv run pytest
```

Для API-изменения дополнительно выполните из корня `make contract-check`.
