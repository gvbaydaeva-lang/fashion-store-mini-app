# PWA Migration with Telegram Owner Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать самостоятельную mobile-first PWA-версию каталога с тем же покупательским и seller-функционалом, сохранив рабочую Telegram Mini App-версию и отправляя уведомления о заказах только владельцу в Telegram.

**Architecture:** PWA и существующий Telegram Mini App используют общий каталог, остатки, фотографии, заказы и серверные бизнес-правила, но получают разные платформенные адаптеры и способы авторизации. PWA не зависит от Telegram и не передаёт Telegram ID покупателя. Telegram остаётся отдельным каналом уведомлений владельца: заказ сначала надёжно сохраняется в базе и панели, затем асинхронно доставляется боту с кнопкой перехода в конкретный заказ.

**Tech Stack:** Статический HTML/CSS/JavaScript без сборщика в `tg-app/`, Supabase Postgres, Supabase Edge Functions, Supabase Auth, Supabase Storage, PWA manifest/service worker, Telegram Bot API для owner-only уведомлений.

**Spec:** Этот документ фиксирует согласованный целевой дизайн, ограничения и пошаговый план реализации.

## Global Constraints

- Текущая Telegram Mini App-версия не удаляется, не отключается и не переводится на непроверенный новый поток до завершения параллельной проверки PWA.
- Визуальный интерфейс PWA сохраняет текущую mobile-first структуру, экраны, навигацию, размеры touch-targets, карточки цветов, размеры, остатки, корзину, checkout, заказы и seller-панель.
- Telegram не является обязательным для покупателя PWA и не используется как источник идентичности веб-покупателя.
- Telegram используется только для уведомлений владельца; покупателю Telegram-сообщения не отправляются.
- Заказ сохраняется в базе и появляется в панели до попытки отправки Telegram-уведомления.
- Ошибка, тайм-аут или недоступность Telegram не отменяет заказ и не блокирует оформление.
- Панель продавца является источником правды; Telegram-сообщение является дубликатом и быстрым переходом к заказу.
- `service_role`, `BOT_TOKEN`, `OWNER_TELEGRAM_ID` и секрет доставки уведомлений никогда не попадают в публичный клиент или Git.
- Существующий demo-статус не объявляется оплатой. Уведомление `order_created` не должно называться «оплаченный заказ».
- Новые Supabase-таблицы и политики должны иметь RLS; авторизация продавца не может основываться на изменяемом `user_metadata`.
- Статусы production, реальная оплата, Telegram owner smoke-test и iOS/Android device QA считаются неподтверждёнными, пока не пройдены отдельные проверки.
- После каждого изменения кода обновляются соответствующие `README.md`, `ARCHITECTURE.md`, `CHANGELOG` или `.env.example`, если они затронуты.

## Target Result and Non-Goals

После завершения пользователь открывает обычную ссылку в браузере и видит приложение, визуально совпадающее с текущей Mini App-версией. Он может просматривать каталог, выбирать цвет и размер, видеть остатки, добавлять товары в корзину и оформлять заказ без Telegram.

Владелец открывает отдельную защищённую seller-панель в браузере. Новый заказ появляется в ней и дублируется в личном Telegram владельца сообщением с кратким составом, суммой и кнопкой `Открыть заказ`.

В эту миграцию не входят:

- удаление Telegram Bot API и текущей Telegram Mini App;
- отправка Telegram-уведомлений покупателям;
- создание новой CRM вместо существующей seller-панели;
- подключение реального эквайринга, кассы, возвратов или доставки;
- полная миграция Supabase на другой хостинг;
- перенос старых Telegram-покупателей в веб-аккаунты без подтверждённого способа связать личности.

## Current Boundaries to Preserve

- Client entry point: `tg-app/index.html`.
- Client state, routes, rendering and platform events: `tg-app/app.js`.
- Pure catalog/cart/order logic: `tg-app/core.js`.
- API client and request normalization: `tg-app/api.js`.
- PWA-compatible styling base: `tg-app/styles.css`.
- Local draft storage: `tg-app/admin-draft-store.js`.
- Public catalog: `supabase/functions/catalog-api/`.
- Seller catalog and access: `supabase/functions/admin-api/`.
- Checkout and seller order queue: `supabase/functions/order-api/`.
- Existing notification delivery: `supabase/functions/order-notifications/`.
- Existing Telegram webhook and legacy bonus contour: `supabase/functions/bot-webhook/` and `supabase/functions/user-api/`; these remain isolated until a separate decision removes them.
- Product semantics remain unchanged: every color card is an independent `products` row; `group_id` only connects cards; deletion removes only the selected card; published catalog never exposes drafts.

## Target Identity and Access Model

### Buyer

- PWA buyer receives a web session through Supabase Auth or a server-issued equivalent.
- Browsing and cart remain available without a blocking registration screen.
- The order owns a stable web identity when available and stores the entered customer contact inside the order snapshot.
- Existing Telegram orders remain readable by their existing Telegram identity until an explicit, verified account-linking flow is designed.
- Client never supplies or controls price, total, payment status, stock confirmation or seller permissions.

### Seller

- Seller panel receives a separate web authentication path, preferably email OTP/magic link through Supabase Auth.
- Seller authorization is stored in server-controlled app metadata or a dedicated allowlist keyed by Supabase Auth user ID, not by editable user metadata.
- Existing Telegram seller access remains available for the Mini App during migration.
- All seller API actions continue to be authorized server-side; hiding the admin link is not authorization.

### Owner Telegram

- The bot sends messages only to the configured owner chat ID.
- The owner must start the bot once so Telegram can deliver private messages.
- The bot token and owner chat ID are server secrets/configuration, never PWA configuration.
- The notification button opens the authenticated web panel at the selected order route.
- If the panel session is absent, the route redirects to seller login and preserves the requested order ID after successful login.

## Order and Notification Flow

```text
PWA checkout
  -> server validates published product, current price, stock and idempotency key
  -> database commits order
  -> seller panel reads the order
  -> durable notification row/event is created
  -> notification worker claims the event
  -> Telegram Bot API sends owner message with panel URL
  -> delivery status is marked sent or retried with error details
```

The notification layer must support at least these owner-only events:

- `order_created`: needed for the current demo checkout and first PWA launch;
- `order_paid`: used only after a real payment provider confirms payment;
- `order_ready`: optional owner audit event when the seller marks the order assembled;
- `delivery_failed`: internal alert or visible panel status when repeated Telegram delivery fails.

Each `(event_type, order_id, channel)` is idempotent. A retry must not produce duplicate Telegram messages after a successful send. The implementation must define the claim lease, retry count/backoff, sent state, permanent failure state and manual retry action before production activation.

The owner message includes only the minimum necessary data: order ID, current status, customer name/phone as required for processing, item count, total, receiving method and a signed/authorized panel URL. It does not include secrets, access tokens or raw customer data beyond the owner’s operational need.

## Planned File Map

### Create

- `tg-app/manifest.webmanifest` — PWA name, icons, theme/background colors, standalone display and start URL.
- `tg-app/service-worker.js` — versioned cache for the app shell only; no stale caching of prices, stock, orders or private admin responses.
- `tg-app/platform.js` — browser/Telegram capability adapter for back navigation, theme, safe areas, sharing and optional Telegram-specific behavior.
- `tg-app/tests/platform.test.js` — deterministic tests for browser fallback and Telegram capability detection.
- `supabase/migrations/20260914_web_identity_and_owner_notifications.sql` — web identity/order ownership and durable owner notification schema.
- `supabase/functions/tests/owner-notifications-contract.test.js` — contract tests for owner-only order events, idempotency, retry behavior and deep links.

### Modify

- `tg-app/index.html` — remove the assumption that Telegram SDK is required; add manifest, theme metadata and service worker registration while keeping conditional Telegram support.
- `tg-app/styles.css` — preserve the current visual system and add browser/PWA safe-area and standalone-mode rules.
- `tg-app/app.js` — replace direct platform branching with `platform.js`; keep screen routes and state behavior unchanged; add web auth/session handling and deep-link order opening.
- `tg-app/api.js` — send the correct web session/auth headers for PWA and retain Telegram `initData` only for the legacy Mini App path.
- `tg-app/core.js` — change only identity/idempotency interfaces required by the shared order contract; do not alter product, variant, stock or cart rules.
- `tg-app/data.js` — remove Telegram-only customer copy from the PWA-facing text while preserving the same store information and visual content.
- `tg-app/tests/app-smoke.test.js`, `tg-app/tests/api.test.js`, `tg-app/tests/core.test.js`, `tg-app/tests/ui.test.js` — extend coverage for browser mode without removing Telegram assertions.
- `supabase/functions/order-api/index.ts` — accept authorized web identity alongside verified Telegram identity and use one server-side order contract.
- `supabase/functions/admin-api/index.ts` — add web seller authorization while keeping legacy Telegram authorization during coexistence.
- `supabase/functions/order-notifications/index.ts` — add owner-only `order_created`, delivery state handling, panel deep link and safe retry behavior.
- `supabase/functions/_shared/telegram-bot.ts` — keep server-only Telegram Bot API client; add only the minimal inline keyboard/deep-link support needed for owner messages.
- relevant SQL functions and policies in `supabase/migrations/` — preserve server-side price/stock checks, add web ownership and notification permissions without exposing service operations to public roles.
- `README.md` — document PWA URL/build, dual-platform behavior, owner-only Telegram notifications and remaining production checks.
- `ARCHITECTURE.md` — document PWA, legacy Telegram adapter, web identity and notification queue.
- `.env.example` — document names only for public API URL, PWA URL, owner notification config and auth redirect configuration; never add values.

## Implementation Tasks

### Task 1: Freeze the current Telegram baseline

**Files:**
- Read: `README.md`, `ARCHITECTURE.md`, `brief.md`, `tg-app/app.js`, `tg-app/api.js`, `supabase/functions/order-api/index.ts`, `supabase/functions/order-notifications/index.ts`.
- Test: existing `tg-app/tests/*.test.js` and `supabase/functions/tests/*.test.*`.

- [ ] Record the current git diff and preserve unrelated user changes.
- [ ] Run the current syntax and contract test commands from `README.md`.
- [ ] Record which tests are local-only and mark production/Telegram-device checks as unverified.
- [ ] Treat the passing baseline as the rollback reference; do not modify the existing Telegram flow in this task.

### Task 2: Introduce a platform adapter without changing business behavior

**Files:**
- Create: `tg-app/platform.js`, `tg-app/tests/platform.test.js`.
- Modify: `tg-app/index.html`, `tg-app/app.js`, `tg-app/styles.css`.

**Interfaces:**
- `createPlatform(windowLike)` returns `mode`, `getUserName()`, `goBack()`, `setBackVisibility(visible)`, `applyTheme()`, `share(url, text)`, and `isTelegram()`.
- Browser mode uses history/back, store CSS variables, `navigator.share` with clipboard fallback, and regular page safe areas.
- Telegram mode delegates only to the existing SDK capabilities and keeps raw `initData` available for the legacy API path.

- [ ] Write tests for browser mode when `window.Telegram` is absent.
- [ ] Write tests that Telegram mode still exposes the current BackButton/theme/share capability shape.
- [ ] Replace direct `window.Telegram` calls in `app.js` with the adapter.
- [ ] Verify all existing screen routes and local cart/draft behavior remain unchanged.

### Task 3: Add PWA shell and safe caching

**Files:**
- Create: `tg-app/manifest.webmanifest`, `tg-app/service-worker.js`.
- Modify: `tg-app/index.html`, `tg-app/styles.css`, `README.md`.

- [ ] Add standalone PWA metadata, icons and a versioned app-shell cache.
- [ ] Cache only static HTML/CSS/JS/fonts/assets that are safe to cache.
- [ ] Never cache private admin responses, signed image URLs, stock, order responses or auth tokens in the service worker.
- [ ] On a new deployment, activate the new cache and remove only previous app-shell caches.
- [ ] Add a visible offline/error state that explains when live catalog or order data cannot be loaded.
- [ ] Verify normal browser mode, standalone installed mode and cache-version update behavior.

### Task 4: Add web buyer identity while preserving Telegram identity

**Files:**
- Create: `supabase/migrations/20260914_web_identity_and_owner_notifications.sql`.
- Modify: `tg-app/api.js`, `tg-app/app.js`, `supabase/functions/order-api/index.ts`, relevant SQL functions/policies, `README.md`, `ARCHITECTURE.md`.

**Interfaces:**
- The API resolves exactly one authenticated server identity per request: `telegram` for the legacy Mini App or `web` for PWA.
- Order creation accepts a server-resolved identity and a client idempotency key; the server remains the source of price, total, status and stock.
- Existing `buyer_telegram_id` data remains readable during coexistence; new web orders use the new web identity relation rather than a fake Telegram ID.

- [ ] Add the smallest schema extension that supports web buyer ownership and preserves old Telegram rows.
- [ ] Add RLS and server policies for buyer-owned order reads; do not expose seller/service operations to public roles.
- [ ] Add web session bootstrap and recovery without forcing registration before catalog browsing.
- [ ] Add tests for web order creation, duplicate idempotency, ownership isolation and rejected forged totals/statuses.
- [ ] Keep existing Telegram auth tests passing.

### Task 5: Add browser seller authentication and dual authorization

**Files:**
- Modify: `tg-app/app.js`, `tg-app/api.js`, `supabase/functions/admin-api/index.ts`, `supabase/functions/order-api/index.ts`.
- Test: `tg-app/tests/app-smoke.test.js`, `tg-app/tests/api.test.js`, `supabase/functions/tests/admin-api-contract.test.js`, `supabase/functions/tests/order-contract.test.js`.

- [ ] Add the web seller login entry point and redirect back to the requested admin route.
- [ ] Add a server-controlled web seller allowlist/role check.
- [ ] Preserve Telegram seller access until the PWA has passed seller regression testing.
- [ ] Ensure a normal buyer session cannot access products, users, stock, publishing, deletion or seller order actions.
- [ ] Test expired sessions, missing roles, direct admin URLs and successful return to the requested order.

### Task 6: Make owner-only order notifications durable and deep-linkable

**Files:**
- Modify: `supabase/functions/order-notifications/index.ts`, `supabase/functions/_shared/telegram-bot.ts`, relevant notification migration/RPC files.
- Create/modify: `supabase/functions/tests/owner-notifications-contract.test.js`.

**Interfaces:**
- `POST /order-notifications` accepts an internal event `{ event: 'order_created' | 'order_paid' | 'order_ready', orderId: string }` authenticated by an internal secret or equivalent server authorization.
- The function claims `(event_type, order_id, channel)` before delivery and marks it `sent` only after Telegram confirms success.
- Owner message includes an HTTPS panel URL with the order route and an inline button labelled `Открыть заказ`.

- [ ] Add `order_created` to the durable notification event model.
- [ ] Make the claim/lease safe for concurrent invocations and retries.
- [ ] Implement Telegram error classification: retryable API/network errors versus validation/configuration failures.
- [ ] Ensure a Telegram failure returns an observable delivery failure but never rolls back the already committed order.
- [ ] Add tests for success, duplicate event, concurrent claim, expired lease, Telegram failure, malformed order ID and missing owner configuration.
- [ ] Confirm the function queries order data server-side and never trusts client-provided message content.

### Task 7: Connect order creation to the notification queue

**Files:**
- Modify: `supabase/functions/order-api/index.ts` and the selected database webhook/RPC/queue integration.
- Test: `supabase/functions/tests/order-contract.test.js`, `supabase/functions/tests/owner-notifications-contract.test.js`.

- [ ] Commit the order first, then enqueue `order_created` using a transaction-safe or after-commit mechanism.
- [ ] Ensure retries cannot create a second order or a second notification record.
- [ ] Ensure the PWA response is successful when order persistence succeeds even if Telegram delivery is delayed or unavailable.
- [ ] Add a seller-panel delivery status and manual retry endpoint restricted to the seller.
- [ ] Keep `order_paid` reserved for a future verified payment webhook and label current demo orders correctly.

### Task 8: Preserve the same visual and functional experience in PWA mode

**Files:**
- Modify: `tg-app/app.js`, `tg-app/styles.css`, `tg-app/data.js`, shared UI tests.

- [ ] Compare PWA and Telegram render states for home, catalog, filters, product, cart, checkout, orders, store and every seller screen.
- [ ] Keep independent color cards, sizes, stock, photo ordering, drafts, publish validation, deletion and group linking unchanged.
- [ ] Replace only Telegram-specific controls with browser equivalents: back action, theme, share, safe areas and user greeting.
- [ ] Keep the same loading, empty, error, retry and optimistic-action feedback.
- [ ] Verify widths 320, 375 and 430 px and absence of horizontal scrolling.

### Task 9: Regression, staging and coexistence verification

**Files:**
- Modify: `README.md`, `ARCHITECTURE.md`, `.env.example` and deployment workflow only as required by the chosen PWA host.
- Test: all existing client/server tests plus browser and API regression checks.

- [ ] Run JavaScript syntax checks and all existing client/server tests.
- [ ] Run `git diff --check`.
- [ ] Test a PWA buyer flow from a fresh browser session through order creation.
- [ ] Test Telegram Mini App buyer and seller flows against the same published catalog and stock.
- [ ] Test seller panel deep link from Telegram after login and direct navigation to an order.
- [ ] Test Telegram unavailable: order remains in panel and delivery status becomes retryable.
- [ ] Test duplicate checkout submission and duplicate notification event.
- [ ] Test product stock changes and published/unpublished visibility in both clients.
- [ ] Test PWA install, refresh, cache update and offline app-shell behavior.
- [ ] Test real owner Telegram message delivery only after secrets are configured outside Git.
- [ ] Mark Telegram iOS/Android device QA and production deployment separately from local/browser verification.

### Task 10: Controlled launch and rollback

**Files:**
- Modify: deployment configuration and documentation only after staging verification.

- [ ] Publish PWA under a stable HTTPS domain while leaving the existing Telegram URL unchanged.
- [ ] Release PWA to a small test group or private link first.
- [ ] Monitor order creation, notification delivery, failed retries and seller access.
- [ ] Do not redirect Telegram users automatically until PWA and owner notifications are verified.
- [ ] Keep the rollback path as the previous Telegram client plus the previous server contract.
- [ ] After the owner confirms the live PWA and Telegram deep link, document the public URL and remaining limitations.

## Acceptance Criteria

- PWA opens from an HTTPS browser URL without Telegram SDK, Telegram init data or VPN-dependent Telegram WebView.
- PWA visually and functionally matches the current Mini App for the implemented screens.
- Current Telegram Mini App still loads and uses the shared catalog and server rules.
- Buyer can complete the current demo checkout in PWA without a Telegram account.
- Order is stored once, remains idempotent on retry and appears in the seller panel.
- Owner receives one Telegram notification for a new order, with a working `Открыть заказ` deep link.
- Telegram delivery failure does not delete, duplicate or block the order.
- Seller authorization is enforced server-side in both PWA and Telegram modes.
- Prices, totals, statuses, stock and publication state are never trusted from the public client.
- No secret, bot token, owner chat ID or service-role credential is shipped to the browser.
- Local tests, browser responsive checks, staging API checks and real Telegram/device checks are reported separately.

## Open Decisions to Confirm Before Implementation

The architecture does not require changing the main direction, but implementation should confirm these three operational choices before Task 4:

1. PWA hosting domain and deployment target, including whether the existing GitHub Pages workflow remains the public host or a custom HTTPS host is added.
2. Web seller login method: email magic link/OTP is the recommended first choice; password login is not required for the first migration.
3. New PWA order status: keep the current `demo` status until real payment is implemented, and notify the owner on `order_created` with explicit demo wording.

## Handoff

This file is the implementation roadmap. It is a plan, not evidence that PWA, web auth, schema changes, Telegram deep links, deployment or device QA already work. After the owner reviews and approves the plan, implementation should proceed task-by-task with tests and documentation updates at every boundary.
