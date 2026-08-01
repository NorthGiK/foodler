# Разработка

## Рабочий цикл

```bash
make bootstrap
make dev
make check
make audit
make test
```

`make dev` сначала выполняет `alembic upgrade head`. Отдельный backend можно
запустить через `cd backend && make run`. `/ready` проверяет доступность БД, в
отличие от простого liveness `/health`.

Для изменения API:

1. Изменить Pydantic-схему и FastAPI route.
2. Добавить или обновить backend contract/route test.
3. Выполнить `make contract`.
4. Использовать generated operation/type в mobile.
5. Выполнить `make check test`.

Generated-файлы коммитятся, чтобы изменение контракта было видно в review.

Любое изменение кода также требует проверки README, changelog, guides,
`.env.example`, ADR/known issues и legal-текстов. Документацию обновляют в том
же коммите. Если изменение документа не требуется, причина фиксируется в
описании PR/итоговом отчёте агента.

## Тестовые уровни

- Backend unit: чистая бизнес-логика.
- Backend route/integration: ASGI transport и in-memory SQLite, все внешние
  сервисы замокированы; любые внешние TCP-соединения блокируются autouse
  fixture.
- Mobile unit: transport, storage и преобразование данных.
- Mobile component: loading/empty/error/success и обновление после локальной
  записи.
- Contract: воспроизводимость OpenAPI и TypeScript generated-кода.

Тест не должен обращаться к production, ждать реальные таймеры или зависеть от
порядка запуска. Для временного отключения теста требуется отдельная задача с
причиной и сроком.

Изменение SQLAlchemy-модели сопровождается Alembic migration и тестом перехода
с предыдущей revision. Локально применить миграции: `uv run alembic upgrade
head`.

Перед выкладкой SQLite-базы сделайте резервную копию, примените
`uv run alembic upgrade head`, проверьте `/ready` и только затем направляйте
трафик на новую версию. Новая security-миграция инвалидирует старые email-коды
и refresh tokens; пользователям потребуется повторный вход.

## Конфигурация

`.env.example` содержит только безопасные значения. Если добавлена переменная:

1. добавить её в соответствующий example;
2. валидировать при запуске с понятной ошибкой;
3. описать назначение в README;
4. настроить secret в deployment environment.

## Диагностика

- Drift API: `make contract`, затем посмотреть diff.
- Backend test завис: запустить конкретный файл с `-vv`; глобальный
  `pytest-timeout` завершит зависший тест.
- Ошибка типов mobile: сначала проверить generated schema, затем transport и
  только после этого UI.
- Ошибка offline sync: проверить отдельно локальную запись, публикацию состояния
  и сетевую очередь.
- Базовый профиль API: запустить `scripts.load_smoke` с тестовым access token и
  сравнить median/p95 с сохранённым результатом той же среды.
- Runtime: безопасные HTTP counters/duration доступны в `/metrics` только с
  отдельным `METRICS_TOKEN`.
- Dependency security: `make audit` проверяет зафиксированный backend lockfile
  через OSV; CI блокирует новую известную уязвимость.
