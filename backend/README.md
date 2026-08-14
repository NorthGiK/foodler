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

`docker compose up` использует `.env`, отдельный одноразовый migration service и
persistent volume `/data`. Тег образа задаётся через `GITHUB_SHA`, без него
используется `latest`.

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
- `src/ai_service.py` — маршрутизация HYBRID/LIGHT/STRONG: гибридные действия
  добавляют к проверяемым локальным фактам AI-рекомендации и расходуют credit.
  Действие `save-money` передаёт модели локальную сводку трат, магазинов и
  месяцев, чтобы рекомендации по экономии опирались на проверенные данные.
- `src/integrations/` — адаптеры внешних API с timeout.
- `src/services/` — транзакционная бизнес-логика.
- `alembic/` — миграции.
- `tests/` — unit, route и integration tests.

Backend владеет API-контрактом. После изменения route/schema выполните из корня
`make contract`, проверьте generated diff и обновите route test.

## Product analytics

Analytics stores a domain-separated installation hash, approved event dimensions
and small allowlisted properties, never the raw ID, IP identity, email, QR or
receipt payload, token, payment payload or AI text. It is default-enabled only
after policy acceptance/consent resolution. `POST /api/product-analytics/events`
accepts optional authentication, at most 50 events and 64 KiB with a 24-hour
clock-skew bound; `PUT /api/product-analytics/preference` controls the guest
installation or the authenticated account. Account-wide opt-out disables linked
installations and irreversibly anonymizes historical links. Storage and
reporting stay inside the Foodler backend; no external analytics provider is
used. There is no automatic analytics retention; use read-only aggregates in
[`docs/analytics-reporting.sql`](../docs/analytics-reporting.sql).

## Внешние сервисы

QR receipt API, AI provider, SMTP и YooKassa конфигурируются только через
environment. Полный список с назначением и безопасными defaults находится в
`.env.example`. Тесты не обращаются к провайдерам напрямую: внешние
TCP-соединения запрещены общей fixture.

Для ранее неизвестного продукта backend запрашивает у AI-провайдера описание и
одну из допустимых товарных категорий через `AI_LIGHT_MODEL`. Категории в API и
каталоге нормализуются к lowercase canonical key; регистр, legacy display labels
и известная опечатка `молоченые` не создают отдельные категории. Если провайдер
недоступен или возвращает некорректную категорию, сохраняется результат локальной
эвристики по тегам.

`POST /api/receipts/get_receipt_by_raw_qr` доступен без аккаунта: он распознаёт
фото QR-кода, но не сохраняет изображение. При валидном access JWT распознанный
чек сохраняется в аккаунте; без JWT результат возвращается только клиенту.
Для уже выпущенных mobile-сборок с URL без `/api` временно поддерживается тот же
маршрут по `/receipts/get_receipt_by_raw_qr`. Ограничение частоты и лимит размера
файла действуют для обоих путей. Вложенный ответ внешнего QR-провайдера
сохраняет исходные поля, а для авторизованного запроса backend дополняет
товарные позиции проверенными `gtin` и `category`. Категория определяется по
каноническому продукту и GTIN, затем по alias/fuzzy-каталогу, однозначным
локальным правилам и, только для неоднозначных названий, структурированному
AI-классификатору. Результаты с уверенностью ниже 0.8 не добавляются в каталог.

Для YooKassa зарегистрируйте уведомления `payment.succeeded` и
`payment.canceled` на `/api/subscription/yookassa/webhook`. Входящий payload не
считается доверенным: backend повторно получает платеж через YooKassa API и
сверяет статус, сумму, валюту и владельца. Повторная доставка не продлевает
подписку второй раз.

Полный клиентский и webhook-поток описан в
[SUBSCRIPTION_GUIDE.md](SUBSCRIPTION_GUIDE.md).

Access JWT живёт 30 минут, refresh token хранится только в виде SHA-256.
Изменение или сброс пароля отзывает все активные сессии. При ротации ключа
текущий ключ задаётся в `SECRET_KEY`, предыдущие временно перечисляются через
запятую в `PREVIOUS_SECRET_KEYS`.

Логи выводятся в JSON. Входной `X-Request-ID` принимается только в безопасном
формате, иначе генерируется новый; итоговый ID возвращается в response header.
Логи не содержат паролей, токенов, QR/receipt payload или AI-контекста.

`GET /api/receipts` имеет `offset`/`limit` и возвращает заголовки
`X-Total-Count`, `X-Page-Offset` и `X-Page-Limit`; mobile самостоятельно
выгружает все страницы.
Публичного endpoint очистки данных нет — retention выполняется фоновым заданием.

`/metrics` отдаёт Prometheus-метрики только при заданном `METRICS_TOKEN` и
заголовке `Authorization: Bearer ...`; без токена маршрут маскируется как 404.
Нагрузочный smoke-тест уже авторизованного API:

```bash
FOODLER_LOAD_TOKEN=... uv run python -m scripts.load_smoke \
  --base-url http://127.0.0.1:8000 --requests 100 --concurrency 10
```

При любом изменении backend-кода обязательно обновите связанные README,
changelog, guides, `docs/`, `.env.example`, migration notes и OpenAPI. Документ
не может описывать endpoint, поле или гарантию, которых больше нет в коде.

Перед коммитом AI-агент проверяет этот список документации. После успешных
проверок он создаёт отдельную `agent/...` ветку, коммитит только текущую задачу
и отправляет её в `origin`; прямой push в `main` запрещён. Точные правила и
формат handoff определены в корневом [AGENTS.md](../AGENTS.md).
