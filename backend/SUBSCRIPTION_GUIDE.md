# Подписка Foodler

Единственный платёжный провайдер подписки — YooKassa. `Subscription` является
источником premium-доступа, а поля `User.premium` и
`User.subscription_expires` поддерживаются как совместимый cache.

## Конфигурация

```dotenv
PAYMENT_ACCOUNT_ID=
PAYMENT_SECRET_KEY=
PAYMENT_AMOUNT_RUB=5.00
PAYMENT_RETURN_URL=https://foodler.site/
PAYMENT_TIMEOUT_SECONDS=10
PAYMENT_MAX_ATTEMPTS=2
SUBSCRIPTION_PERIOD_DAYS=30
```

Секрет YooKassa хранится только на backend. Перед запуском новой версии
обязательно выполните `uv run alembic upgrade head`.

## Клиентский поток

### Получить статус

```http
GET /api/subscription
Authorization: Bearer <access-token>
```

```json
{
  "active": true,
  "platform": "yookassa",
  "expiresAt": "2026-09-01T10:00:00"
}
```

Для одной булевой проверки используется
`GET /api/subscription/is_premium`.

### Создать платёж

```http
POST /api/subscription/payment
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "paymentMethod": "sbp"
}
```

`paymentMethod` необязателен. Поддерживаются `bank_card`, `sbp`, `sberbank`,
`tinkoff_bank` и `yoo_money`. Без него YooKassa показывает доступные методы
самостоятельно.

```json
{
  "confirmationUrl": "https://yookassa.ru/checkout/..."
}
```

Клиент открывает `confirmationUrl` во внешнем браузере. После возвращения в
приложение клиент повторно получает статус подписки.

## Уведомления YooKassa

В кабинете YooKassa зарегистрируйте `payment.succeeded` и `payment.canceled` на:

```text
POST /api/subscription/yookassa/webhook
```

Тело уведомления используется только как указатель на payment ID. Backend
повторно получает платёж через YooKassa API и доверяет только результату этого
запроса. Проверяются:

- payment ID и ожидаемый статус;
- `paid` для успешной оплаты;
- сумма и валюта;
- `metadata.user_id`;
- наличие локального платежа со статусом `in_progress`.

Обработка идемпотентна: повторное успешное уведомление не продлевает подписку
второй раз. Недоступность YooKassa возвращает `503`, несоответствие проверок —
`400`.

## Хранение чеков

- новый чек при активной подписке получает бессрочное серверное хранение;
- новый чек без подписки получает срок хранения 30 дней;
- окончание подписки не меняет срок уже сохранённых чеков;
- просроченные чеки удаляет фоновая retention-задача.

## Безопасность и тестирование

- webhook публичный, но не активирует подписку без повторной проверки через
  YooKassa;
- создание платежа и чтение статуса требуют access JWT;
- одновременно допускается не более трёх незавершённых платежей пользователя;
- интеграционные тесты мокируют `YooKassaGateway` и не обращаются в сеть.

При изменении этого потока одновременно обновите FastAPI/Pydantic, route tests,
OpenAPI-контракт, mobile client, этот guide, README и changelog.
