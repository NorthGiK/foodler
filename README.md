# Foodler

Foodler — мобильное приложение для учёта продуктовых покупок, анализа расходов
и AI-рекомендаций. Репозиторий содержит FastAPI-бэкенд и React Native/Expo
клиент.

## Быстрый старт

Требования:

- Python 3.13 и [uv](https://docs.astral.sh/uv/);
- Node.js 24 и npm;
- Android Studio/SDK для локального Android-приложения.

```bash
make bootstrap
cp backend/.env.example backend/.env
cp mobile/.env.example mobile/.env
cd backend && uv run alembic upgrade head && cd ..
make dev
```

Перед первым запуском заполните переменные из обоих `.env`. Реальные ключи и
токены нельзя добавлять в Git.

Основные команды:

| Команда | Назначение |
|---|---|
| `make bootstrap` | Установить фиксированные зависимости обоих проектов |
| `make dev` | Применить backend-миграции, затем запустить API и Expo |
| `make build-apk` | Собрать release APK мобильного приложения (ARM64) |
| `make check` | Линтеры, форматирование, typecheck, контракт и секреты |
| `make test` | Все backend- и mobile-тесты |
| `make audit` | Проверить backend lockfile и production-граф mobile |
| `make contract` | Перегенерировать OpenAPI и TypeScript API-типы |
| `make contract-check` | Проверить, что generated-файлы актуальны |

## Как устроен проект

```text
backend/                 FastAPI, SQLAlchemy, Alembic, локальная аналитика и AI
mobile/                  Expo/React Native, SQLite и пользовательский интерфейс
contracts/openapi.json   generated API-контракт; вручную не редактировать
docs/                    архитектура, разработка и известные проблемы
```

Backend — единственный источник правды для публичного Foodler API. Pydantic
схемы и маршруты экспортируются в OpenAPI, из которого генерируются типы
мобильного клиента. При изменении API выполните `make contract`; файлы в
`mobile/src/api/generated/` вручную не изменяются.

Мобильное приложение работает local-first: чеки сначала доступны из локальной
SQLite, а авторизованный пользователь синхронизирует их с сервером. Нельзя
ломать офлайн-сценарии ради упрощения серверной интеграции.

Подробности:

- [Архитектура](docs/architecture.md)
- [Разработка и проверки](docs/development.md)
- [Известные проблемы](docs/known-issues.md)
- [Решение об API-контракте](docs/adr/0001-monorepo-and-api-contract.md)
- [Backend](backend/README.md)
- [Mobile](mobile/README.md)
- [Подписка backend](backend/SUBSCRIPTION_GUIDE.md)
- [Подписка mobile](mobile/SUBSCRIPTION_GUIDE.md)

## Документация — часть изменения

При любом изменении кода обязательно проверьте и обновите связанные README,
changelog обоих проектов, guides, `docs/`, `.env.example`, ADR/known issues,
legal-тексты и generated API-контракт. Задача не завершена, если документация
описывает старые endpoint-ы, конфигурацию, ограничения или пользовательское
поведение. Если обновление конкретного документа не требуется, это явно
фиксируется в итоговом описании изменения.

## Конфигурация

Backend читает `backend/.env`; полный список и безопасные примеры находятся в
`backend/.env.example`. Mobile использует только Expo-переменные с префиксом
`EXPO_PUBLIC_` из `mobile/.env.example`.

Production URL не должен быть зашит в код: задайте
`EXPO_PUBLIC_API_BASE_URL`. Для Android emulator локальный API обычно доступен
как `http://10.0.2.2:8000/api`.

## Перед pull request

```bash
make contract
make check
make audit
make test
```

PR не объединяется, пока backend, mobile, API contract, secret scan и
документация/changelog не соответствуют фактическому изменению.

## Работа AI-агентов с Git

Перед коммитом AI-агент обязан проверить все относящиеся к изменению документы
и обновить их до коммита. Когда задача завершена и проверки прошли, агент сам
создаёт ветку `agent/<краткое-название>`, коммитит только файлы задачи и делает
`git push -u origin <ветка>`. Прямые commit/push в `main`, включение чужих
изменений и перезапись истории запрещены. В handoff агент указывает ветку, SHA,
статус push, проверки и документы, которые не требовали изменений.
