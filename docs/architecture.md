# Архитектура Foodler

## Компоненты

Mobile — Expo/React Native приложение с локальной SQLite. UI читает локальное
состояние, поэтому добавление или изменение чека должно сразу публиковаться в
экранное состояние. Авторизация хранится в AsyncStorage, а Foodler API
вызывается через единый типизированный transport.

Backend — FastAPI-приложение с async SQLAlchemy. Оно отвечает за аккаунты,
серверную копию чеков, подписки, базу продуктов, аналитику и AI-запросы.
Внешние сервисы (проверка чеков, LLM, email, YooKassa и Google Play) находятся
за отдельными адаптерами с общим connection pool, timeout и явным
преобразованием ошибок. Они подменяются в тестах.

```text
UI -> local SQLite -> sync queue -> typed Foodler client -> FastAPI
                                                |
                                                +-> external service adapters
```

## Источники правды

- Публичный API: FastAPI routes и Pydantic schemas.
- Схема backend-БД: SQLAlchemy models + Alembic migrations.
- Локальные данные mobile: SQLite migrations в storage-модулях.
- API-типы mobile: generated OpenAPI types.
- Команды разработки: корневой Makefile.

## Инварианты

- Локальные данные показываются до завершения сети и не исчезают при её ошибке.
- Повторная синхронизация идемпотентна; идентификаторы стабильны на обеих
  сторонах.
- AI credits проверяются и списываются только сервером.
- Credit balance обновляется атомарно внутри периодического bucket; ledger
  хранит отдельные операции использования.
- `Subscription` — источник правды о premium-доступе; поля пользователя
  поддерживаются только как совместимый cache.
- LOCAL AI actions не вызывают LLM и не списывают credits.
- Webhook оплаты считается недоверенным вводом и не активирует подписку без
  повторного получения платежа через API YooKassa.
- Google Play purchase активируется только после серверной проверки статуса,
  acknowledgement, product, срока и привязки к Foodler user ID.
- Деньги хранятся целыми копейками, календарные даты — типом DATE.
- Refresh/OTP никогда не хранятся открытым текстом; смена пароля отзывает
  access- и refresh-сессии.
- Любое изменение модели БД поставляется с Alembic migration; `create_all` не
  используется при runtime-запуске.
- Логи структурированы и не содержат чувствительные payload.
