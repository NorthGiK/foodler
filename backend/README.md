# Foodler Backend

FastAPI API для аккаунтов, чеков, подписок, базы продуктов, аналитики и
AI-рекомендаций. Общий запуск и правила находятся в [корневом README](../README.md).

## Локальный запуск

```bash
uv sync --all-extras
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn src.main:app --reload
```

Создайте `SECRET_KEY` командой `openssl rand -hex 32`. Swagger:
`http://127.0.0.1:8000/docs`; liveness — `/health`, readiness с проверкой БД —
`/ready`; остальные маршруты имеют префикс `/api`. Приложение намеренно не
создаёт таблицы при старте: перед каждой версией применяйте Alembic.
Alembic использует тот же `DATABASE_URL`, что и приложение.

```bash
uv run ruff check src tests scripts
uv audit --locked
uv run pytest
uv run alembic upgrade head
```

## Структура

- `src/routers/` — HTTP boundary.
- `src/schemas.py` — публичные request/response DTO.
- `src/models.py` — SQLAlchemy-модели.
- `src/analytics.py` — локальная аналитика без LLM.
- `src/ai_service.py` — маршрутизация LOCAL/LIGHT/STRONG.
- `src/integrations/` — адаптеры внешних API с timeout.
- `src/services/` — транзакционная бизнес-логика.
- `alembic/` — миграции.
- `tests/` — unit, route и integration tests.

Backend владеет API-контрактом. После изменения route/schema выполните из корня
`make contract`, проверьте generated diff и обновите route test.

## Внешние сервисы

QR receipt API, AI provider, SMTP, YooKassa и Google Play конфигурируются только
через environment. Полный список с назначением и безопасными defaults находится
в `.env.example`. Тесты не обращаются к провайдерам напрямую: внешние
TCP-соединения запрещены общей fixture.

Для YooKassa зарегистрируйте уведомления `payment.succeeded` и
`payment.canceled` на `/api/subscription/yookassa/webhook`. Входящий payload не
считается доверенным: backend повторно получает платеж через YooKassa API и
сверяет статус, сумму, валюту и владельца. Повторная доставка не продлевает
подписку второй раз.

Для Google Play задайте package name и путь к смонтированному JSON service
account. Клиент отправляет purchase token в `/api/subscription/google/verify`;
backend проверяет статус, acknowledgement, product ID, срок и привязку
`obfuscatedExternalAccountId` к SHA-256 от Foodler user ID. Один purchase token
нельзя привязать к разным пользователям, а допустимые product IDs перечисляются
в `GOOGLE_PLAY_PRODUCT_IDS`.

Access JWT живёт 30 минут, refresh token хранится только в виде SHA-256.
Изменение или сброс пароля отзывает все активные сессии. При ротации ключа
текущий ключ задаётся в `SECRET_KEY`, предыдущие временно перечисляются через
запятую в `PREVIOUS_SECRET_KEYS`.

Логи выводятся в JSON. Входной `X-Request-ID` принимается только в безопасном
формате, иначе генерируется новый; итоговый ID возвращается в response header.
Логи не содержат паролей, токенов, QR/receipt payload или AI-контекста.

`GET /api/receipts` имеет `offset`/`limit` и возвращает заголовки
`X-Total-Count` и `X-Page-Limit`; mobile самостоятельно выгружает все страницы.
Публичного endpoint очистки данных нет — retention выполняется фоновым заданием.

`/metrics` отдаёт Prometheus-метрики только при заданном `METRICS_TOKEN` и
заголовке `Authorization: Bearer ...`; без токена маршрут маскируется как 404.
Нагрузочный smoke-тест уже авторизованного API:

```bash
FOODLER_LOAD_TOKEN=... uv run python -m scripts.load_smoke \
  --base-url http://127.0.0.1:8000 --requests 100 --concurrency 10
```
