# Foodler Mobile

Expo/React Native Android-приложение с локальной SQLite, учётом чеков,
аналитикой расходов и AI-рекомендациями. Общий запуск и правила находятся в
[корневом README](../README.md).

## Локальный запуск

```bash
npm ci
cp .env.example .env
npm run start
```

Для Android emulator задайте:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000/api
```

Для production-сборки `EXPO_PUBLIC_API_BASE_URL` обязателен: production URL не
зашит в bundle исходным кодом. Завершающий `/` автоматически удаляется.

Проверки:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test -- --runInBand
```

## Данные и API

- `src/storage.ts` и `src/ai/storage.ts` — локальные SQLite-данные.
- `src/api/transport.ts` — JWT, refresh, timeout и нормализация ошибок.
- `src/api/client.ts` — публичный адаптер приложения.
- `src/api/generated/` — generated Foodler SDK; вручную не редактировать.
- `src/api/sync.ts` — синхронизация local-first данных.

Для изменения Foodler API сначала меняют FastAPI/Pydantic, затем из корня
выполняют `make contract`. Прямой `fetch` к Foodler API и ручные копии backend
DTO запрещены.

Expo public variables попадают в bundle и не могут содержать секреты. Ключ
проверки чеков хранится только на backend.

При любом изменении mobile-кода обязательно проверьте README, changelog,
guides, `.env.example`, legal-тексты и корневые `docs/`. Пользовательское
поведение и premium-возможности должны быть описаны так же, как реализованы;
пары `legal/*.md` и публикуемые `legal/*.html` обновляются вместе.
