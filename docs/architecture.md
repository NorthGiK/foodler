# Архитектура Foodler

## Компоненты

Mobile — Expo/React Native приложение с локальной SQLite и AsyncStorage для
локальных пользовательских настроек. Запись чека и его
позиций атомарна; после commit batched observable-сигнал перечитывает чек и
агрегаты текущего экрана. Поэтому локальное добавление или удаление видно без
повторного входа и до сетевой синхронизации. Авторизация хранится в
AsyncStorage, а Foodler API вызывается через единый типизированный transport.

Backend — FastAPI-приложение с async SQLAlchemy. Оно отвечает за аккаунты,
серверную копию чеков, подписки, базу продуктов и AI-запросы.
Внешние сервисы (проверка чеков, LLM, email и YooKassa) находятся за отдельными
адаптерами с timeout и явным преобразованием ошибок. HTTP-вызовы проверки чеков
и LLM используют общий process-local connection pool; SMTP и YooKassa
используют собственные клиенты. Все адаптеры подменяются в тестах.

Product analytics is sent directly from the consented Android application to
MyTracker. Tracer receives native and Java/Kotlin crashes, ANRs, crash-free
sessions and scrubbed JavaScript errors. Neither SDK starts before the current
legal consent is accepted. Foodler never sends email, account ID, tokens, QR or
receipt/AI content to either provider.

```text
consent -> mobile event adapter -> MyTracker
        -> native crash SDK / scrubbed JS transport -> Tracer
```

Guests keep the analytics identity preference locally. Authenticated users
synchronize an account-wide preference through the generated Foodler API. A
disabled identity immediately clears MyTracker `customUserId` without stopping
anonymous SDK events; enabling identity is applied only after backend
confirmation. The backend returns a stable pseudonymous external ID only while
the account link is enabled.

```text
UI -> transaction SQLite -> observable state -> sync queue -> typed client -> FastAPI
                                                |
                                                +-> external service adapters
```

Изменения в этой архитектуре поставляются через task-ветки `agent/...`: AI-агент
обновляет связанную документацию до коммита, запускает релевантные проверки и
самостоятельно push-ит готовую ветку в `origin`. В `main` напрямую не push-ят.

## Источники правды

- Публичный API: FastAPI routes и Pydantic schemas.
- Схема backend-БД: SQLAlchemy models + Alembic migrations.
- Локальные данные mobile: SQLite migrations в storage-модулях.
- API-типы mobile: generated OpenAPI types.
- Команды разработки: корневой Makefile.

## Инварианты

- Локальные данные показываются до завершения сети и не исчезают при её ошибке.
- Пользовательский alias магазина хранится только в AsyncStorage устройства и
  заменяет исходное название лишь при отображении; SQLite-чек и sync payload
  сохраняют распознанное исходное значение.
- Ручное переопределение категории товара хранится в отдельной SQLite-таблице
  только на устройстве. Оно сопоставляется с обрезанным именем без учёта
  регистра, имеет приоритет при отображении и локальной статистике для истории
  и новых чеков, но не меняет базовую category/server metadata и не попадает в
  sync payload. Сброс правила немедленно раскрывает сохранённую
  автоматическую/server category.
- Повторная синхронизация идемпотентна; идентификаторы стабильны на обеих
  сторонах. Неуспешная загрузка не помечается синхронизированной. Локальное
  удаление сначала сохраняет tombstone в AsyncStorage; pending ID исключается
  из server pull до успешного DELETE или подтверждающего `404`.
- Длинные mobile-списки виртуализированы; render строки не создаёт анимацию, а
  кадровые анимации выполняются native driver.
- AI credits проверяются и списываются только сервером.
- Категория новой позиции чека определяется строгим каскадом: подтверждённый
  cache → точный GTIN → единственный точный нормализованный alias/имя →
  однозначное локальное правило → один AI batch → `прочее`. Локальные решения
  сохраняются с источником `local`; конфликтующие совпадения каталога передаются
  в AI batch. Batch использует короткие непрозрачные ключи и один bounded retry
  только для отсутствующих строк или transient `429/5xx`; общий timeout не
  расширяется. Fuzzy используется отдельно для поиска каталога и не влияет на
  категоризацию. Receipt categorization is server-canonical, а исторические
  snapshot не пересчитываются; mobile reconciles snapshots by the stable receipt
  ID.
- Credit balance обновляется атомарно внутри периодического bucket; ledger
  хранит отдельные операции использования.
- `Subscription` — источник правды о premium-доступе; поля пользователя
  поддерживаются только как совместимый cache.
- Гибридные AI-действия сначала строят локальные проверяемые факты, затем
  передают их LLM для краткой рекомендации; такой запрос списывает credit.
- Webhook оплаты считается недоверенным вводом и не активирует подписку без
  повторного получения платежа через API YooKassa.
- Деньги хранятся целыми копейками, календарные даты — типом DATE.
- Refresh/OTP никогда не хранятся открытым текстом; смена пароля отзывает
  access- и refresh-сессии.
- Подтверждённый сброс пароля использует короткоживущий подписанный reset-токен
  без отдельной таблицы; после смены пароля все сессии отзываются.
- Любое изменение модели БД поставляется с Alembic migration; `create_all` не
  используется при runtime-запуске.
- Логи структурированы и не содержат чувствительные payload.
- Backend не принимает и не хранит поток product analytics. Миграция удаляет
  прежнюю analytics history; downgrade восстанавливает только пустые таблицы.
