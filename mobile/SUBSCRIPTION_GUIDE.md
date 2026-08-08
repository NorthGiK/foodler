# Подписка в Foodler Mobile

Mobile не содержит платёжных секретов и не обрабатывает webhook. Авторитетное
описание backend-потока находится в
[backend/SUBSCRIPTION_GUIDE.md](../backend/SUBSCRIPTION_GUIDE.md).

## Клиентский сценарий

1. Пользователь должен быть авторизован.
2. `api.makePurchase()` вызывает generated operation
   `POST /api/subscription/payment`.
3. Клиент открывает полученный `confirmationUrl` через `Linking.openURL`.
4. После возвращения или повторного открытия профиля клиент обновляет
   `/api/users/me` либо `/api/subscription/is_premium`.

Все Foodler API-вызовы выполняются через `src/api/client.ts` и generated SDK.
Платёжные реквизиты и `PAYMENT_SECRET_KEY` запрещено добавлять в mobile `.env`,
код или Expo public variables.

Budget (300 ₽/30 дней) использует light-модель для всех внешних AI-запросов.
Premium (800 ₽/30 дней) предоставляет увеличенный лимит AI credits, выбирает
strong-модель для сложных действий и бессрочное серверное
хранение новых чеков. Синхронизация чеков доступна любому авторизованному
пользователю и не должна отображаться как отдельная premium-функция.

При изменении подписки обновите backend guide, этот файл, интерфейс
`PremiumCard`, OpenAPI/generated SDK и оба changelog.
