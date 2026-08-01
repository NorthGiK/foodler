# Разработка

## Рабочий цикл

```bash
make bootstrap
make dev
make check
make test
```

Для изменения API:

1. Изменить Pydantic-схему и FastAPI route.
2. Добавить или обновить backend contract/route test.
3. Выполнить `make contract`.
4. Использовать generated operation/type в mobile.
5. Выполнить `make check test`.

Generated-файлы коммитятся, чтобы изменение контракта было видно в review.

## Тестовые уровни

- Backend unit: чистая бизнес-логика.
- Backend route/integration: ASGI transport и in-memory SQLite, все внешние
  сервисы замокированы.
- Mobile unit: transport, storage и преобразование данных.
- Mobile component: loading/empty/error/success и обновление после локальной
  записи.
- Contract: воспроизводимость OpenAPI и TypeScript generated-кода.

Тест не должен обращаться к production, ждать реальные таймеры или зависеть от
порядка запуска. Для временного отключения теста требуется отдельная задача с
причиной и сроком.

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
