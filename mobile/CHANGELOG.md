# Changelog

## Unreleased

- На AI-вкладке авторизованный пользователь видит перед «Общим анализом»
  компактный баланс доступных AI-действий с загрузкой, повтором после ошибки и
  обновлением после успешного действия; гостевой сценарий не менялся.

- В локальные профили владельца и членов семьи добавлены любимые и нелюбимые
  продукты, цель питания и уровень физической нагрузки. При AI-запросе они
  объединяются с ручной дополнительной информацией; публичный API не менялся.

- Экран «Аккаунт» после перехода из профиля приведён к макету Figma для светлой
  и тёмной темы: добавлены тематические карточки данных и чипы, а CTA подписки
  перенесён перед анкетой; локальное хранение и редактирование профиля сохранены.

- Добавлен нижний отступ в меню вкладок, чтобы подписи не прилегали к нижнему
  краю экрана.

- Разрешение записи аудио отключено для Android-сборок: приложение использует
  `expo-image-picker` только для выбора изображений и не записывает звук.

- Добавлен Android-виджет Foodler с суммой расходов за текущую неделю. Виджет
  использует локальный агрегат, поддерживает светлую и тёмную системные темы и
  открывает QR-лист приложения по нажатию.

- Нижнее меню вкладок скрывается за клавиатурой при вводе в полях профиля и
  возвращается после закрытия клавиатуры.

- Исправлено положение header на внутренних экранах профиля: safe-area теперь
  отделяет навигационный header от keyboard-aware содержимого, поэтому экран
  «Обратная связь» не скрывает заголовок при открытии и вводе текста.

- Кнопка «Подписка» на экране аккаунта получила акцентную карточку в стиле
  профиля с premium-иконкой, описанием и сохранённой навигацией.

- Карточка личной информации на экране «Аккаунт» выровнена по стилю профиля:
  обновлены типографика, скругления, action-кнопки, поля и отступы без изменения
  локального хранения или поведения редактирования.

- Профиль и его внутренние разделы приведены к единому редакционному стилю:
  обновлены группировка пунктов, карточки, иконки, скругления и навигационный
  header без изменения действий, локальных данных и API.

- Добавлены короткие native-анимации для вкладок, интерактивных кнопок,
  карточек и нижних листов. Системная настройка уменьшения движения отключает
  перемещения, а длинные виртуализированные списки не получили анимацию каждой
  строки.

- Секции «Обратная связь» и «Семья» в профиле, включая форму добавления
  члена семьи и карточки участников, выровнены по единому редакционному стилю
  профиля без изменения локального хранения и поведения.

- Исправлен сброс пароля: код подтверждается отдельным запросом, а ошибки
  валидации показываются понятным текстом вместо `HTTP 422`.

- Активные светлая и тёмная темы переведены на приглушённую палитру gruvbox;
  QR-кнопка использует общие theme-токены и стала менее контрастной.

- Базовая тёмная тема переведена в тёплую палитру Foodler с графитовым фоном,
  зелёным вторичным акцентом, кремовым текстом и томатным primary.

- Экран «Статистика» обновлён в редакционном стиле Foodler: добавлены выбор дня,
  недели, месяца и года, навигация по соседним периодам, круговая диаграмма
  категорий и столбчатая динамика расходов (для года — по месяцам). Для пустого
  периода добавлен CTA загрузки QR; аналитическая плашка сравнения расходов не
  используется.

- AI-отчёты получили единый receipt-ribbon экран: строки отчётов теперь имеют
  тонкий action-акцент и inline pin-состояние, а ответ показывает снимок чеков
  отдельными строками, editorial summary, плоские секции и список действий для
  сохранения, sharing и удаления без изменения данных и callback-поведения.

- AI-вкладка получила редакционный экран с корзиной продуктов, четырьмя
  основными действиями и раскрываемым разделом дополнительных AI-действий.
  Для гостей добавлен нижний лист с предложением войти в аккаунт или
  продолжить без аккаунта; локальные чеки остаются доступны.

- QR-лист теперь показывает inline-состояние «Не удалось распознать QR» с
  повторным выбором фото и закрытием без скрытия экрана чеков. Детали чека
  обновлены: добавлены предпросмотр, отдельные сгруппированные товары, итоги по
  нормализованным категориям и общий итог; локальное редактирование категорий и
  удаление чека сохранены.

- Первый запуск теперь состоит из двух отдельных экранов по новому макету:
  подтверждение всех обязательных документов с ссылками на legal-тексты, затем
  выбор между входом в аккаунт и продолжением в гостевом local-first режиме.
  Пользователь больше не попадает на главный экран сразу после принятия политик.

- Обновлены светлые экраны входа и профиля: кремовая палитра, томатный primary,
  редакционные заголовки и иллюстрации корзины/томата. Профиль теперь открывает
  отдельные экраны аккаунта, семьи, приватности, настроек чеков и обратной
  связи; члена семьи можно редактировать локально. Тёмные темы, API и правила
  синхронизации не менялись.

- Главная навигация упрощена до четырёх статичных вкладок: «Чеки»,
  «Статистика», «AI» и «Профиль»; переключение сохраняет состояние вкладок.
- Вкладка «Чеки» получила новый редакционный дизайн с QR-карточкой, списком
  покупок от новых к старым и компактным предпросмотром чека. QR-распознавание
  снова доступно из нижнего листа через камеру или медиатеку; отдельный экран
  сканирования удалён.

- Receipt details now allow a local category override for every item with the
  same case-insensitive product name. Overrides update local history and
  statistics immediately, remain device-only, and never change the sync
  payload; users can restore the saved automatic/server category at any time.

- Receipt sync now converges provisional local categories to server-confirmed
  metadata without creating a second receipt; date-only fiscal dates render as
  calendar dates rather than a fabricated local time.

- Added a `make build-aab-rustore` release command that requires an explicit
  production keystore and exports its public certificate without storing
  signing secrets in the repository.
- Added consent-gated product analytics queue and account-wide preference
  handling; disabled analytics clears local pending events.
- Store name aliases now keep the "Показывать как" editor above the keyboard
  inside the profile modal on mobile.
- Login email and password fields now remain visible above the keyboard on
  mobile.
- Product category aliases are compared case-insensitively and rendered with a
  single display label, preventing duplicate groups such as `фрукты`/`Фрукты`.
- Receipt details combine repeated product lines with the same normalized name
  and price, summing their quantity and line total for display.
- Removed the unused vulnerable `ngrok` package and updated the locked
  `js-yaml` override to 4.3.1.
- Mobile `npm audit` remains available as a manual diagnostic but no longer
  blocks CI while the Expo/Metro graph has no patched `image-size` release.
- Login now keeps the password-recovery action enabled and anchors the
  password visibility toggle to the input's right edge.

- SQL локального SQLite вынесен из хранилищ в отдельные query-модули для чеков
  и AI-отчётов без изменения поведения базы данных.
- Login validation now shows email and password errors only beside the relevant
  field and clears them when that field is edited.
- The Ask screen input bar is anchored below the message list and moves above
  the keyboard through `KeyboardAvoidingView`.
- AI answers in the question screen now render Markdown, and the family-member
  form keeps focused inputs visible above the keyboard.
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

## Unreleased

- Исправлена Android release-сборка: Gradle wrapper закреплён на версии 8.13,
  совместимой с Foojay resolver из React Native 0.85.3.
