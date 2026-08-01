# Subscription Guide for Clients

## Overview

Premium subscription unlocks extended receipt storage and AI credits. This guide explains how to check status, create payments, and handle confirmation via YooKassa webhooks.

## Environment Setup

Add these to your `.env`:

```env
PAYMENT_ACCOUNT_ID=your_shop_id
PAYMENT_SECRET_KEY=your_secret_key
SUBSCRIPTION_PERIOD_DAYS=30
```

## API Flow

### 1. Check Subscription Status

**Request:**
```bash
GET /api/subscription/
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "active": true,
  "platform": "yookassa",
  "expiresAt": "2026-08-16T17:01:28"
}
```

### 2. Check Premium Status (Lightweight)

**Request:**
```bash
GET /api/subscription/is_premium
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "premium": true
}
```

Use this endpoint when you need a simple boolean check before enabling premium features.

### 3. Create Payment

**Request:**
```bash
POST /api/subscription/payment
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "paymentMethod": "bank_card"  // optional
}
```

**Response:**
```json
{
  "url": "https://yookassa.ru/payment/..."
}
```

Open the returned URL in a browser to complete payment. After payment, YooKassa will send a webhook to your server.

#### Payment Method Options

The `paymentMethod` field is optional. If not specified, YooKassa will show all available payment methods for the user to choose from:

| Method | Description |
|--------|-------------|
| `bank_card` | Credit/debit card (default) |
| `sbp` | СБП (Система быстрых платежей) - via banking app |
| `sberbank` | SberPay - via SberBank app |
| `tinkoff_bank` | T-Pay - via T-Bank app |
| `yoo_money` | YooMoney wallet |
| `apple_pay` | Apple Pay |
| `google_pay` | Google Pay |

Example with specific payment method:
```json
{
  "paymentMethod": "sbp"
}
```

### 4. Handle YooKassa Webhook

**Endpoint:** `POST /api/subscription/yookassa/webhook`

YooKassa sends an HTTP POST with JSON body and header `X-Yookassa-Signature`.

**Required header:**
```
X-Yookassa-Signature: sha256=<hmac_sha256_signature>
```

The signature is computed over the raw request body using your `PAYMENT_SECRET_KEY`.

**Success response body example:**
```json
{
  "event": "payment.succeeded",
  "object": {
    "id": "payment_123",
    "metadata": {
      "user_id": "user_id_here"
    }
  }
}
```

**Your server will:**
1. Verify HMAC-SHA256 signature (returns 403 if invalid)
2. Check `event == "payment.succeeded"`
3. Find `Payment` record by `object.id`
4. Mark payment as `success`
5. Extend user subscription by `SUBSCRIPTION_PERIOD_DAYS`

## Webhook Implementation Notes

- Compute HMAC over **raw body bytes**, not parsed JSON
- Use `hmac.compare_digest()` to prevent timing attacks
- Webhook is idempotent — duplicate events do not extend subscription again
- Always return 200 quickly; retries will follow otherwise

## Subscription Storage Rules

- Active premium → receipts stored indefinitely
- Expired/no premium → receipts kept for 30 days
- When `is_premium` detects expired `subscription_expires`, it resets `premium=False` in DB

## Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Webhook returns 403 | Missing or invalid `X-Yookassa-Signature` | Compute HMAC-SHA256 over raw body using `PAYMENT_SECRET_KEY` |
| Premium not activated | `payment` record missing or already `success` | Ensure `/payment` was called first and webhook `payment.id` matches |
| Subscription not extending | Duplicate webhook or expired base | Webhook is idempotent; it only extends from current expiration if still active, otherwise starts from now |

## Sequence Diagram

```
Client       Your Backend      YooKassa
  |              |                |
  |-- GET /subscription/ ----->|
  |<-- {active, platform} ------|
  |              |                |
  |-- POST /payment ----------->|
  |<-- {url} -------------------|
  |              |                |
  |-- Open url -----------------|-- Payment form (user chooses method)
  |              |                |
  |              |<-- webhook -----|
  |              | (with HMAC)    |
  |              |-- verify ----->|
  |              |-- mark success |
  |              |-- extend sub   |
  |<-- 200 OK ------------------|
```

## Security

- Never expose `PAYMENT_SECRET_KEY` to clients
- Always verify webhook signature server-side
- Use HTTPS for all API calls
- Webhook endpoint is public but protected by HMAC