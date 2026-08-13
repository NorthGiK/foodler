# Changelog

## Unreleased

- Added a local Profile manager for store display names. Aliases apply to
  receipt views on the current device only, can be restored to the original
  name, and never change the receipt or server sync payload.
- Profile subscription button now has enough space below its glow, and AI
  reports show a small notice that recommendations may contain errors.
- Mobile API URLs now normalize a configured host to exactly one `/api` prefix,
  so QR uploads and generated SDK requests reach FastAPI.
- Navigation transitions now keep the active theme background, preventing a
  white flash when opening receipt details and returning from subscription or
  AI questions in dark mode.
- Добавлена категория «Сладости» для шоколада, конфет и похожих товаров.
- Приведена к одному значению fallback-категория товаров: `прочее`.
- Newly recognized receipts retain backend product categories in local SQLite;
  expanded offline rules cover common fruit, grocery, household, egg, sauce,
  snack, alcohol and ready-meal names.
- Updated the production brace-expansion override to the security-fixed 1.1.18.
- AI-agent changes require documentation review before commit and are delivered
  through a pushed `agent/...` branch, never directly to `main`.
- Receipt synchronization now sends a calendar date accepted by the API, and
  AI report storage is initialized before it is queried.
- Guests can recognize a receipt QR code from a photo before creating or
  signing in to an account.
- Receipt-image uploads include an access JWT when available, allowing the
  server to save recognized receipts for signed-in users.
- Provider-specific QR response fields are narrowed safely in the mobile API
  adapter, so generated `unknown` payloads cannot break TypeScript builds.

## [1.3.0] — 2026-08-02

### Fixed

- Локальная запись и удаление чеков теперь транзакционны и публикуют batched
  observable-сигнал: список, статистика и детали обновляются без повторного
  входа и без ожидания сети.
- Ручной чек использует выбранную пользователем дату, валидирует существование
  даты, положительные цену/количество и округляет денежные значения до копеек.
- Неуспешная синхронизация больше не помечается успешной; повторная полная
  синхронизация после login удалена.
- Локально удалённый чек сохраняется в очереди удаления, исключается из
  server pull и не появляется снова при временной ошибке сети; очередь
  повторяется после авторизации.
- Ошибка загрузки AI-кредитов больше не отображается как нулевой баланс:
  карточка показывает отдельное состояние и кнопку повторной загрузки.
- Исправлен семейный контекст AI: рост, вес, пол и предпочтения больше не
  теряются из-за несовместимых `any`-объектов.
- Удалено логирование AI-ответов, QR, email и потенциально чувствительных
  ошибок.
- Проверка permission для фотографии использует `granted`, а успешное
  распознавание сразу открывает актуальный список чеков.

### Performance

- Чеки и товарные позиции переведены на настроенные `FlatList`; строка списка
  memoized и не запускает animation во время render.
- Удалены неиспользуемые JS `onScroll` с экранов статистики, типов, профиля и
  ассистента; tab/progress animations выполняются native driver.
- Временной ряд расходов теперь агрегирует каждый чек один раз.
- Серверный batch чеков схлопывается в одно обновление observable state.

### Changed

- Единственная форма ручного ввода и её доменная логика находятся в
  `features/receipts`; дублирующий modal и мёртвые UI-компоненты удалены.
- Удалены случайные/неиспользуемые NativeWind, Tamagui, web, server Tailwind,
  ngrok и другие зависимости. Production `npm audit` — 0 advisory,
  Expo Doctor — 21/21.
- Mobile lint очищен со 147 warnings до 0; добавлено 13 новых behavior-тестов.
- Версия приложения и package синхронизирована на 1.3.0.
- Добавлены performance budgets, audit policy и актуализированы architecture,
  development guide и known issues.

---

## [1.2.0] — 2026-08-02

### Fixed

- Multipart-загрузка изображения чека теперь передаёт access JWT и больше не
  получает `401` от защищённого backend endpoint.
- Production-сборка теперь требует явный `EXPO_PUBLIC_API_BASE_URL`; dev
  использует адрес Android emulator и нормализует завершающий `/`.
- Premium-карточка показывает только реально ограниченные подпиской функции.
- Удалена не связанная с backend-конфигурацией цена подписки; фактическая сумма
  показывается платёжной страницей до подтверждения.
- Удалена пустая кнопка управления подпиской, повторное нажатие во время
  открытия оплаты блокируется состоянием компонента.

### Changed

- Subscription guide синхронизирован с YooKassa API и generated-контрактом.
- Обновлены retention/privacy-описание и порядок запроса удаления аккаунта.
- В `AGENTS.md` и README закреплено обязательное обновление документации,
  changelog, legal-текстов и generated-контракта вместе с кодом.

---

## [1.1.0] — 2026-07-11

### Fixed
- **ProfileScreen**: Исправлен чёрный экран при авторизованном пользователе. Причина — `KeyboardAvoidingView` без `style={{ flex: 1 }}`, из-за чего контейнер схлопывался в нулевую высоту.
- **getReceiptByRawQR**: Исправлена отправка изображения чека в API proverkacheka.com. Вместо curl-синтаксиса `"@" + imgPath` теперь используется `expo-file-system/legacy` `uploadAsync` с `FileSystemUploadType.MULTIPART`, что корректно работает в React Native.
- **ReceiptDetailScreen**: Кнопка "назад" уходила за правый край и была труднодоступна. Исправлен хедер: вместо `{ width: 24 }`-спейсера и голого `Pressable` используется симметричный `headerButton` (48×48) с обеих сторон и `hitSlop={12}`.
- **NewReceiptScreen**: Аналогичная проблема с кнопкой "закрыть" — исправлен хедер по тому же паттерну.
- **ReceiptDetailScreen**: Товары отображались нестабильно (то пусто, то 1 позиция). Добавлен `useFocusEffect` для перезагрузки товаров при каждом фокусе экрана, а также `useEffect` для первой загрузки.

### Changed
- **ProfileScreen** полностью реорганизован: монолитный файл (~700 строк) разбит на переиспользуемые компоненты в `src/components/profile/`:
  - `ProfileHeaderCard` / `ProfileGuestCard` — шапка профиля (авторизованный/гость)
  - `PremiumCard` — карточка подписки (активная/промо)
  - `ProfileInfoCard` — личная информация с режимом просмотра/редактирования
  - `FamilySection` — управление членами семьи (список, модалка добавления, удаление)
  - `FeedbackSection` — форма обратной связи с загрузкой изображений
  - `ConfirmModal` — универсальный модальный диалог подтверждения
- **ProfileScreen** теперь ~120 строк, вся логика разделена по компонентам
- **AGENTS.md** обновлён: добавлена секция `src/components/profile/` с описанием каждого компонента и состояний экрана

### Added
- `src/components/profile/index.ts` — barrel export для всех компонентов профиля
- `CHANGELOG.md` — файл изменений проекта
