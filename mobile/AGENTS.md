# Mobile agent rules

Сначала прочитайте корневые `README.md` и `AGENTS.md`.

## Архитектурные правила

- Foodler API вызывается только через `src/api/client.ts` и generated SDK.
  Ручные DTO и URL backend-маршрутов запрещены. Единственное исключение —
  multipart-загрузка файла через Expo FileSystem, если generated transport её
  не поддерживает; такой вызов остаётся в `src/api/client.ts`, использует
  `API_BASE`, JWT и тестируется отдельно.
- `src/api/generated/` создаётся командой `make contract` и вручную не
  редактируется.
- Внешние API изолируются от Foodler transport отдельным адаптером.
- SQLite — первичный источник для local-first UI. После mutation обновите
  observable экранное состояние до сетевой синхронизации.
- Компоненты не выполняют SQL или `fetch` напрямую.
- Для длинных данных используйте виртуализированные списки; не создавайте
  анимацию на каждый render и предпочитайте native/reanimated path.
- Новые экраны имеют loading, empty, error и success состояния.
- Не добавляйте `any`; используйте generated types, `unknown` с narrowing или
  существующие доменные типы.
- Не логируйте токены, QR payload, содержимое чеков или профиль пользователя.

## Проверки

```bash
npm run typecheck
npm run lint
npm run test -- --runInBand
```

Для API-изменения дополнительно выполните из корня `make contract-check`.

## Документация

Любое изменение mobile-кода обязательно включает проверку и при необходимости
обновление `README.md`, `SUBSCRIPTION_GUIDE.md`, `CHANGELOG.md`, `.env.example`,
legal-текстов и корневых `docs/`. Изменение пользовательского поведения,
premium-функций, хранения или состава передаваемых данных нельзя коммитить со
старым описанием. Публикуемые `.html` и соответствующие исходные `.md` в
`legal/` всегда обновляются вместе.
