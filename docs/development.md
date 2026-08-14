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

Release APK собирается командой `make build-apk`. Готовый файл находится в
`mobile/android/app/build/outputs/apk/release/app-release.apk`; сборка по
умолчанию рассчитана на ARM64-устройства.

Подписанный AAB для RuStore собирается командой `make build-aab-rustore`.
Команда требует переменные `RUSTORE_KEYSTORE`, `RUSTORE_STORE_PASSWORD`,
`RUSTORE_KEY_ALIAS` и `RUSTORE_KEY_PASSWORD`, экспортирует публичный
сертификат и не использует debug-ключ. Результаты находятся в
`mobile/dist/Foodler-RuStore-release.aab` и
`mobile/dist/Foodler-RuStore-release.cer.pem`. Keystore и пароли должны
храниться вне Git; для обновления приложения используется тот же ключ, что и
при предыдущей публикации.

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

## Git workflow для AI-агентов

Проверка и обновление относящейся к задаче документации обязательны **до**
коммита. После прохождения релевантных проверок агент самостоятельно создаёт
ветку `agent/<краткое-название>`, добавляет только файлы задачи, создаёт
содержательный conventional-style commit и выполняет
`git push -u origin <ветка>`. Commit/push в `main`, включение чужих изменений,
force push и переписывание истории запрещены. В итоговом отчёте обязательны
ветка, SHA, статус push, проверки и перечень документов без изменений.

## Тестовые уровни

- Backend unit: чистая бизнес-логика.
- Backend route/integration: ASGI transport и in-memory SQLite, все внешние
  сервисы замокированы; любые внешние TCP-соединения блокируются autouse
  fixture.
- Mobile unit: transport, storage и преобразование данных.
- Mobile component: loading/empty/error/success и обновление после локальной
  записи.
- Mobile performance: release-профиль по бюджетам из
  `mobile/PERFORMANCE.md`.
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
- Dependency security: `make audit` проверяет backend lockfile через OSV.
  `cd mobile && npm run audit:prod` остаётся ручной диагностикой и не блокирует
  CI, пока upstream Expo/Metro не предоставляет исправленный dependency graph.
  Полный dev-граф и принятые исключения описаны в `mobile/README.md`.
