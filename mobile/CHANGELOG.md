# Changelog

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