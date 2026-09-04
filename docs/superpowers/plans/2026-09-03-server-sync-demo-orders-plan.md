# Связанный Telegram-магазин: синхронизация пользователей, каталога и демо-заказов — план реализации

> **Для agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Цель:** сделать Supabase единым источником данных: пользователь, опубликованный товар, серверный демо-заказ и изменение статуса должны одинаково отображаться в Mini App и админ-панели с разных аккаунтов и устройств.

**Архитектура:** покупательская витрина и админ-панель остаются статическим JavaScript-интерфейсом, но взаимодействуют с общими сущностями только через Supabase Edge Functions. Сервер проверяет raw Telegram `initData`, сам вычисляет заказ и возвращает итоговое состояние; браузер не создаёт «общие» заказы в `localStorage`.

**Стек:** Vanilla JavaScript, Node `node:test`, Supabase Postgres, SQL migrations, Supabase Edge Functions (Deno), Telegram Web Apps HMAC, GitHub Actions/GitHub Pages.

**Спецификация:** [`tg-app/docs/superpowers/specs/2026-09-03-connected-store-requirements-research.md`](../specs/2026-09-03-connected-store-requirements-research.md)

## Глобальные ограничения

- Не добавлять фреймворк, сборщик, npm-зависимость, отдельный сервер или отдельную БД.
- Не изменять старые миграции. Создать `supabase/migrations/20260903110000_connected_store_sync.sql`.
- `localStorage` допустим только для корзины, idempotency key, локального кэша и черновика. Он не хранит общие заказы, пользователей, остатки, оплату или статусы.
- Клиент передаёт только позиции, контакты, получение и idempotency key. Цена, сумма, остаток, `paid` и итоговый статус из браузера недостоверны.
- Демо-режим создаёт серверный заказ `status = 'demo'`, `payment_mode = 'demo'`; не уменьшает остаток, не отправляет платёжное уведомление и не называется реальной оплатой.
- Реальный платёж, его webhook и Supabase Realtime не входят в эту итерацию. В будущем `paid` устанавливает только подписанный webhook провайдера.
- `user-api`, `order-api`, `admin-api` проверяют raw `Telegram.WebApp.initData` на сервере. Нельзя добавлять в браузер, Git, документацию или отчёт `BOT_TOKEN`, service-role, webhook secret, raw `initData` или персональные данные.
- У приложения один production URL, который действительно открывает бот. Проверять нужно его, а не альтернативный хостинг.
- После каждого изменения кода синхронно обновлять `README.md`, `ARCHITECTURE.md`, существующий `CHANGELOG.md` и `.env.example` по фактическому поведению.

---

## Подтверждённая исходная причина

В `tg-app/app.js` демо-заказ создаётся `createLocalDemoOrder()` и сохраняется по ключу `fashion-store-demo-orders-v1`. Это хранилище доступно только в браузере покупателя, поэтому владелец с другого Telegram-аккаунта или устройства не увидит такой заказ. В репозитории есть `supabase/functions/order-api/index.ts`, но безопасная проверка live endpoint ранее дала `404`: функция не была доступна в подключённом Supabase-проекте. Сбой `trackOpen()` также скрывается пустым `.catch(() => {})`.

## Граница первой серверной итерации

Делаем общий серверный каталог, пользователей, демо-заказы, админскую очередь и ограниченное обновление данных между устройствами. Не делаем: платёжного провайдера, webhook реальной оплаты, списания остатка по оплате, возвраты, рассылки и подписки Supabase Realtime.

## Карта файлов

| Файл | Роль после работы |
| --- | --- |
| `tg-app/app.js` | Экраны, события и server-first checkout; локально остаётся только корзина/кэш. |
| `tg-app/api.js` | Тонкий API-клиент и безопасная нормализация server response. |
| `tg-app/tests/api.test.js`, `tg-app/tests/app-smoke.test.js` | Регрессии запросов, checkout и refresh. |
| `supabase/migrations/20260903110000_connected_store_sync.sql` | `payment_mode`, customer upsert при заказе, activity и корректные переходы статусов. |
| `supabase/functions/order-api/index.ts` | Заказы покупателя, очередь владельца, серверные переходы. |
| `supabase/functions/user-api/index.ts` | Учёт проверенного открытия без потери ошибки. |
| `supabase/functions/admin-api/index.ts` | Серверный список пользователей и признак оформленного заказа. |
| `supabase/config.toml` | Явное описание всех защищённых Edge Functions. |
| `supabase/functions/tests/*.test.js` | Контракты SQL, функций и разрешённых статусов. |
| `README.md`, `ARCHITECTURE.md`, `.env.example`, `tg-app/index.html` | Реальные границы, URL и версии опубликованных assets. |

## Согласованные интерфейсы

```ts
// tg-app/api.js
createOrder(input: {
  idempotencyKey: string;
  customer: { name: string; phone: string };
  deliveryId: 'pickup';
  items: Array<{ productId: string | number; variantId: string | number; quantity: number; imagePath?: string }>;
}): Promise<StoreOrder>

listBuyerOrders(): Promise<StoreOrder[]>
getBuyerOrder(orderId: string): Promise<StoreOrder>
listSellerOrders(): Promise<StoreOrder[]>
getSellerOrder(orderId: string): Promise<StoreOrder>
markOrderReady(orderId: string): Promise<StoreOrder>
```

```ts
// order-api action
'create' | 'list-buyer-orders' | 'get-order' | 'list-orders' | 'get-seller-order' | 'mark-ready'

type StoreOrder = {
  id: string;
  orderType: 'server';
  status: 'demo' | 'pending_payment' | 'paid' | 'ready' | 'cancelled';
  paymentMode: 'demo' | 'provider';
  total: number;
  customer: { name?: string; phone?: string };
  delivery: { id: 'pickup'; title: string; description: string; price: number };
  createdAt: string;
  items: Array<{ productId: string; variantId: number; name: string; colorName: string; size: string; quantity: number; price: number; image: string }>;
};
```

### Task 1: Зафиксировать production-границу и baseline

**Файлы:** Modify `README.md`, `ARCHITECTURE.md`; inspect `tg-app/api.js`, `tg-app/index.html`, `.github/workflows/deploy-tg-app.yml`.

**Результат:** один канонический URL и доказанное состояние до исправления.

- [ ] **Шаг 1: Зафиксировать состояние без изменений.**

  ```bash
  git status --short --branch
  git log -1 --oneline
  node --test tg-app/tests/*.test.js
  node --test supabase/functions/tests/*.test.js
  ```

  Сохранить фактические PASS/FAIL и не перезаписывать чужие изменения.

- [ ] **Шаг 2: Определить URL из кнопки бота.**

  Рекомендация — `https://gvbaydaeva-lang.github.io/fashion-store-mini-app/`, если этот же URL выбран владельцем и открывается ботом. Если бот ведёт на Vercel, владелец вручную меняет адрес в BotFather либо отдельно разрешает обновление Vercel. Не менять URL наугад.

- [ ] **Шаг 3: Проверить live HTML и исходный defect API.**

  ```bash
  curl -fsSL 'https://gvbaydaeva-lang.github.io/fashion-store-mini-app/?check=20260903-connected-store' | rg 'app\.js\?v=|styles\.css\?v='
  curl -i -X POST 'https://sskwmffdgzytombtrhut.supabase.co/functions/v1/order-api' -H 'Content-Type: application/json' -d '{}'
  ```

  Ожидание после реализации: runtime содержит актуальные assets, `order-api` без `initData` отвечает `401`, не `404`. В запрос не включать настоящий `initData`.

- [ ] **Шаг 4: Документировать только выбранную границу.**

  Внести в README канонический URL и правило live-проверки по URL бота. В ARCHITECTURE убрать допущение двух равноправных production runtime.

- [ ] **Шаг 5: Сделать изолированный commit документации.**

  ```bash
  git add README.md ARCHITECTURE.md
  git commit -m "docs: define canonical mini app url"
  ```

**Критерий готовности:** покупатель и разработчик больше не проверяют разные версии Mini App.

### Task 2: Написать падающие тесты на серверную синхронизацию

**Файлы:** Modify `tg-app/tests/api.test.js`, `tg-app/tests/app-smoke.test.js`, `supabase/functions/tests/order-contract.test.js`, `supabase/functions/tests/order-api-contract.test.js`, `supabase/functions/tests/user-api-contract.test.js`.

**Результат:** red-тесты, которые не позволяют вернуться к локальному «общему» заказу.

- [ ] **Шаг 1: Зафиксировать payload заказа.**

  В `api.test.js` проверить:

  ```js
  assert.deepEqual(body, {
    action: 'create', initData: 'signed-init-data', idempotencyKey: 'checkout-key-1',
    customer: { name: 'Тест', phone: '+79990000000' }, deliveryId: 'pickup',
    items: [{ productId: '7', variantId: 9, quantity: 1, imagePath: 'products/7.jpg' }],
  });
  assert.doesNotMatch(JSON.stringify(body), /"(?:price|total|status|paid|demoPayment)"/);
  ```

- [ ] **Шаг 2: Зафиксировать server-first checkout.**

  В `app-smoke.test.js` проверить, что `submitDemoPayment()` содержит `await apiClient.createOrder(...)`, очищает `state.cart` только после server response и не содержит `createLocalDemoOrder`, `saveDemoOrders`, `DEMO_ORDERS_KEY` или `fashion-store-demo-orders-v1`.

- [ ] **Шаг 3: Зафиксировать серверные гарантии.**

  Контракты должны требовать:

  ```js
  assert.match(syncMigration, /payment_mode text not null default 'demo'/);
  assert.match(syncMigration, /payment_mode in \('demo', 'provider'\)/);
  assert.match(syncMigration, /insert into public\.customers/);
  assert.match(syncMigration, /'order_created'/);
  assert.doesNotMatch(syncMigration, /stock\s*=\s*stock\s*-\s*item_quantity/);
  ```

  Отдельно проверить `list-buyer-orders`, включение `demo` в очередь владельца и переход только `demo/paid → ready`.

- [ ] **Шаг 4: Убедиться, что тесты действительно красные.**

  ```bash
  node --test tg-app/tests/api.test.js tg-app/tests/app-smoke.test.js
  node --test supabase/functions/tests/order-contract.test.js supabase/functions/tests/order-api-contract.test.js supabase/functions/tests/user-api-contract.test.js
  ```

  Ожидание: новые проверки FAIL на старом коде из-за localStorage и отсутствующей миграции. Записать причину каждого FAIL.

- [ ] **Шаг 5: Закоммитить test red state.**

  ```bash
  git add tg-app/tests/api.test.js tg-app/tests/app-smoke.test.js supabase/functions/tests/order-contract.test.js supabase/functions/tests/order-api-contract.test.js supabase/functions/tests/user-api-contract.test.js
  git commit -m "test: specify connected store sync"
  ```

**Критерий готовности:** тесты доказывают, почему прежний локальный demo-flow не может синхронизироваться.

### Task 3: Ввести атомарную серверную модель заказа и пользователя

**Файлы:** Create `supabase/migrations/20260903110000_connected_store_sync.sql`; modify три серверных contract-теста из Task 2.

**Результат:** один идемпотентный server-side заказ с покупателем, составом и серверной суммой.

- [ ] **Шаг 1: Создать новую миграцию.**

  Добавить `payment_mode text not null default 'demo' check (payment_mode in ('demo', 'provider'))`. Не изменять старые файлы `orders.sql` и `demo_order_mode.sql`.

- [ ] **Шаг 2: Расширить `create_order` в одной транзакции.**

  После валидации Telegram buyer ID и только для нового `orders.id` выполнить:

  ```sql
  insert into public.customers (
    telegram_user_id, first_name, last_name, username,
    first_app_opened_at, last_app_opened_at
  ) values (...)
  on conflict (telegram_user_id) do update
    set last_app_opened_at = excluded.last_app_opened_at;

  insert into public.customer_activity (telegram_user_id, event_type, occurred_at)
  values (p_buyer_telegram_id, 'order_created', now());
  ```

  При том же `(buyer_telegram_id, idempotency_key)` вернуть существующий ID до вставки `order_items` и `customer_activity`.

- [ ] **Шаг 3: Сохранить серверную истину заказа.**

  Цена, сумма, название, цвет, размер, доступность и остаток читаются из `products`/`product_variants`. Сохранить текущие проверки опубликованности, `is_enabled`, пары товар-вариант и наличия. `image_path` остаётся лишь отображаемым полем.

- [ ] **Шаг 4: Определить безопасные переходы.**

  `seller_mark_order_ready` разрешает только `demo → ready` и `paid → ready`; `pending_payment`, `cancelled` и несуществующий заказ возвращают предсказуемый статус. Для demo не выполнять списание stock.

- [ ] **Шаг 5: Оставить данные закрытыми.**

  RLS на `orders`, `order_items`, `customers`, `customer_activity` включён. `anon`/`authenticated` не получают прямое чтение/запись; grants нужны только server-side client в Edge Function.

- [ ] **Шаг 6: Запустить контракты и создать commit.**

  ```bash
  node --test supabase/functions/tests/order-contract.test.js supabase/functions/tests/order-api-contract.test.js supabase/functions/tests/user-api-contract.test.js
  git add supabase/migrations/20260903110000_connected_store_sync.sql supabase/functions/tests
  git commit -m "feat: persist demo orders on server"
  ```

**Критерий готовности:** сервер возвращает один `demo`-заказ с серверными данными и клиентом, без списания остатка.

### Task 4: Доработать и развернуть Edge Functions

**Файлы:** Modify `supabase/functions/order-api/index.ts`, `supabase/functions/user-api/index.ts`, `supabase/functions/admin-api/index.ts`, `supabase/config.toml`, соответствующие `supabase/functions/tests/`.

**Результат:** покупатель и администратор используют один реальный API в одном Supabase project ref.

- [ ] **Шаг 1: Расширить `order-api`.**

  Добавить `list-buyer-orders` в `RequestBody.action`. Buyer actions: `create`, `list-buyer-orders`, `get-order`; остальные действия после Telegram HMAC требуют owner allowlist.

- [ ] **Шаг 2: Реализовать выборку покупателя.**

  ```ts
  client
    .from('orders')
    .select(ORDER_SELECT)
    .eq('buyer_telegram_id', buyerTelegramId)
    .order('created_at', { ascending: false });
  ```

  Buyer ID не принимается от браузера. `get-order` и список возвращают собственные `demo`, `ready` и допустимые будущие статусы.

- [ ] **Шаг 3: Исправить очередь владельца.**

  В `ORDER_SELECT` включить `payment_mode`; в queue заменить `['paid', 'ready']` на `['demo', 'paid', 'ready']`. Нельзя подменять demo на paid.

- [ ] **Шаг 4: Сделать ошибки наблюдаемыми.**

  `user-api` сохраняет HMAC и upsert, возвращает только безопасные коды `UNAUTHORIZED`, `BAD_ACTION`, `INTERNAL_ERROR`. В `app.js` не должно остаться пустого catch на `trackOpen`; сохраняется лишь безопасный код/время без raw `initData`, контактов и SQL-текста.

- [ ] **Шаг 5: Привязать админских пользователей к заказам в БД.**

  В `admin-api` вычислять `ordered` через server query по `orders.buyer_telegram_id`, а не `state.orders`. Показывать только имя Telegram, username при наличии, даты активности и факт заказа.

- [ ] **Шаг 6: Декларировать функции.**

  В `supabase/config.toml` добавить:

  ```toml
  [functions.user-api]
  verify_jwt = false

  [functions.order-api]
  verify_jwt = false
  ```

  Это допустимо только вместе с проверкой raw Telegram `initData` внутри функций.

- [ ] **Шаг 7: Проверить и закоммитить API.**

  ```bash
  node --test supabase/functions/tests/*.test.js
  rg -n "catch\s*\(\s*\)\s*=>\s*\{\s*\}" tg-app supabase/functions
  git add supabase/functions supabase/config.toml
  git commit -m "feat: expose connected store APIs"
  ```

**Критерий готовности:** buyer видит только свои серверные заказы, владелец — общую очередь, а ошибки важной записи не исчезают молча.

### Task 5: Перевести checkout и интерфейсы на server response

**Файлы:** Modify `tg-app/api.js`, `tg-app/app.js`, `tg-app/index.html`, `tg-app/tests/api.test.js`, `tg-app/tests/app-smoke.test.js`.

**Результат:** клик «Подтвердить» создаёт заказ только на сервере; очередь владельца не смешивается с localStorage.

- [ ] **Шаг 1: Нормализовать demo-метку.**

  В `normalizeOrder()` добавить:

  ```js
  paymentMode: order.payment_mode ?? order.paymentMode ?? 'demo',
  ```

  В админке показывать «Демо-оплата» при `paymentMode === 'demo'`. Для покупателя: `demo` — «Заказ принят», `ready` — «Заказ собран»; не писать «Оплачено» для demo.

- [ ] **Шаг 2: Добавить получение заказов покупателя.**

  ```js
  async listBuyerOrders() {
    const data = await orderRequest('list-buyer-orders');
    return (Array.isArray(data.orders) ? data.orders : []).map(normalizeOrder);
  },
  ```

- [ ] **Шаг 3: Удалить только ошибочную локальную очередь.**

  Удалить `DEMO_ORDERS_KEY`, `state.demoOrders`, их загрузку/сохранение, `createLocalDemoOrder()` и ветки `demoPayment`. Не удалять корзину, idempotency key и серверные `state.orders`/`state.sellerOrders`.

- [ ] **Шаг 4: Реализовать server-first `submitDemoPayment()`.**

  ```js
  const serverOrder = await apiClient.createOrder({
    idempotencyKey: state.checkoutIdempotencyKey,
    customer: state.checkoutCustomer,
    deliveryId: state.delivery.id,
    items: state.cart.map(toOrderItemRequest),
  });
  replaceOrder(serverOrder);
  state.lastCheckoutOrder = serverOrder;
  state.cart = [];
  state.checkoutIdempotencyKey = null;
  saveState();
  navigate('payment-success');
  ```

  При любой ошибке оставить корзину и key. `404`: «Оформление заказа временно недоступно. Заказ не создан.»; сеть: «Не удалось создать заказ. Проверь интернет и попробуй ещё раз.»; технический текст не показывать.

- [ ] **Шаг 5: Перевести очередь и сборку заказа.**

  `renderSellerOrders`, `openSellerOrder`, `requestOrderReady`, `confirmOrderReady` используют только `state.sellerOrders` и API. Кнопка «Заказ собран» допустима для серверных `demo`/`paid`; после `markOrderReady()` заменить элемент очереди ответом API.

- [ ] **Шаг 6: Загружать серверные данные при входе на экран.**

  После доступного Telegram-сеанса безопасно вызвать `trackOpen` и `listBuyerOrders`. При открытии «Заказы», seller queue и user detail получать свежий серверный объект. Не блокировать каталог при временной ошибке учёта пользователя.

- [ ] **Шаг 7: Обновить опубликованные assets и проверить.**

  В `index.html` задать единый новый суффикс, например `20260903-connected-store-1`, для изменённых JS и обновить smoke-тесты.

  ```bash
  node --check tg-app/data.js
  node --check tg-app/core.js
  node --check tg-app/ui.js
  node --check tg-app/api.js
  node --check tg-app/app.js
  node --test tg-app/tests/*.test.js
  rg -n "fashion-store-demo-orders-v1|createLocalDemoOrder|demoPayment" tg-app
  ```

- [ ] **Шаг 8: Закоммитить клиентскую синхронизацию.**

  ```bash
  git add tg-app/api.js tg-app/app.js tg-app/index.html tg-app/tests/api.test.js tg-app/tests/app-smoke.test.js
  git commit -m "feat: create demo checkout orders on server"
  ```

**Критерий готовности:** заказ появляется у пользователя и владельца только после положительного server response.

### Task 6: Добавить контролируемую свежесть данных между устройствами

**Файлы:** Modify `tg-app/app.js`, `tg-app/tests/app-smoke.test.js`.

**Результат:** данные обновляются при возврате в Mini App и через ограниченный refresh, без бесконечного polling и прямого доступа к БД.

- [ ] **Шаг 1: Ввести одну функцию обновления.**

  ```js
  async function refreshVisibleServerData({ force = false } = {}) {
    // Не допускает параллельный запрос и не повторяет запрос чаще 30 секунд,
    // когда force === false. Загружает только данные текущего экрана.
  }
  ```

  `catalog`/`product` обновляют каталог; `orders`/`order-detail` — buyer orders; seller queue/detail — очередь; `seller-users` — пользователей.

- [ ] **Шаг 2: Подключить возврат и остановку refresh.**

  `visibilitychange` и `focus` вызывают принудительный refresh после возврата к видимому окну. На server-backed экране один `setInterval` не чаще 30000 ms; при смене экрана, скрытии документа и `beforeunload` его очищать.

- [ ] **Шаг 3: Защитить черновик и временные ошибки.**

  Не перезаписывать черновик товара фоновым ответом. При сети оставлять последний корректный снимок и действие «Обновить», а не бесконечные toast.

- [ ] **Шаг 4: Добавить регрессии и commit.**

  Проверить блокировку параллельных refresh, минимум `30000` и отсутствие `supabase.from(...)` в клиенте.

  ```bash
  node --test tg-app/tests/app-smoke.test.js tg-app/tests/api.test.js
  git add tg-app/app.js tg-app/tests/app-smoke.test.js
  git commit -m "feat: refresh connected store data safely"
  ```

**Критерий готовности:** другой аккаунт получает новый каталог, заказ и статус после возврата в приложение или максимум через 30 секунд на нужном экране.

### Task 7: Применить миграции, развернуть контур и проверить endpoints

**Файлы:** Modify `README.md`, `ARCHITECTURE.md`, `.env.example`, `tg-app/index.html` только по факту; inspect `supabase/functions/README.md` и workflow.

**Результат:** функции развёрнуты ровно в том Supabase-проекте, который вызывает production Mini App.

- [ ] **Шаг 1: Проверить project ref и имена Secrets.**

  Сверить base URL из `api.js` с выбранным Supabase project ref. Проверять только наличие имён необходимых Secrets; не выводить значения.

- [ ] **Шаг 2: Применить миграцию и развернуть функции.**

  Только в подтверждённом CLI-контексте одного project ref:

  ```bash
  supabase db push
  supabase functions deploy user-api
  supabase functions deploy order-api
  supabase functions deploy admin-api
  supabase functions deploy catalog-api
  ```

  Если CLI привязан к неизвестному ref, остановиться до выполнения команд.

- [ ] **Шаг 3: Безопасно проверить функции.**

  ```bash
  curl -i -X POST 'https://sskwmffdgzytombtrhut.supabase.co/functions/v1/user-api' -H 'Content-Type: application/json' -d '{}'
  curl -i -X POST 'https://sskwmffdgzytombtrhut.supabase.co/functions/v1/order-api' -H 'Content-Type: application/json' -d '{}'
  curl -i -X POST 'https://sskwmffdgzytombtrhut.supabase.co/functions/v1/admin-api' -H 'Content-Type: application/json' -d '{}'
  curl -i 'https://sskwmffdgzytombtrhut.supabase.co/functions/v1/catalog-api'
  ```

  Ожидание: закрытые функции дают `401`, не `404`; каталог — `200` и только published товары.

- [ ] **Шаг 4: Выпустить Mini App и привести документацию к коду.**

  Выполнить project release workflow, дождаться GitHub Actions и проверить live HTML/JS с cache buster по URL бота. Из README/ARCHITECTURE убрать утверждения о local demo-orders, только если они уже удалены. В `.env.example` перечислять только имена новых Secrets.

- [ ] **Шаг 5: Создать documentation/release commit.**

  ```bash
  git add README.md ARCHITECTURE.md .env.example tg-app/index.html
  git commit -m "docs: describe connected store runtime"
  ```

**Критерий готовности:** `order-api` больше не `404` в нужном project ref, а бот загружает актуальный runtime.

### Task 8: Провести полную приёмку и push

**Файлы:** Inspect весь список; modify документацию только если выявлено фактическое несоответствие.

**Результат:** доказанная синхронизация в реальном Telegram, а не только локальный PASS.

- [ ] **Шаг 1: Выполнить автоматическую финальную проверку.**

  ```bash
  node --check tg-app/data.js
  node --check tg-app/core.js
  node --check tg-app/ui.js
  node --check tg-app/api.js
  node --check tg-app/app.js
  node --test tg-app/tests/*.test.js
  node --test supabase/functions/tests/*.test.js
  git diff --check
  ```

  Каждая команда должна завершиться PASS/без ошибок. При FAIL вернуться к соответствующей задаче.

- [ ] **Шаг 2: Проверить локальный интерфейс.**

  ```bash
  python3 -m http.server 4173 --directory tg-app
  ```

  Проверить 320, 375, 430 px, две темы, отсутствие horizontal overflow, back navigation, buyer и seller flow. При отсутствии browser/device проверки указать `UNVERIFIED`.

- [ ] **Шаг 3: Пройти Telegram smoke-test двумя аккаунтами.**

  1. Новый покупатель открывает Mini App из бота.
  2. Владелец видит пользователя с серверной датой активности.
  3. Покупатель создаёт демо-заказ и видит «Заказ принят».
  4. Владелец видит тот же ID, состав, контакты, получение и «Демо-оплата».
  5. Повтор с тем же idempotency key не создаёт второй заказ.
  6. Владелец переводит заказ в «Заказ собран»; покупатель видит обновление после возврата или максимум через 30 секунд.
  7. Владелец публикует тестовую карточку; покупатель видит её через `catalog-api`.
  8. Владелец меняет остаток/архивирует тестовую карточку; покупатель видит ответ сервера после refresh.
  9. Демо-заказ не уменьшил остаток; временную карточку безопасно архивировать, если она не нужна в каталоге.

- [ ] **Шаг 4: Проверить staged changes и выполнить push.**

  ```bash
  git diff --cached --check
  git status --short --branch
  git add <только-файлы-этой-задачи>
  git commit -m "feat: connect mini app and admin data"
  git push origin main
  git rev-parse HEAD
  git ls-remote origin refs/heads/main
  ```

  Проверить равенство SHA, дождаться deploy и повторить проверку по URL бота.

**Критерий готовности:** пользователь и владелец на разных аккаунтах видят единые серверные данные, а результат подтверждён live Telegram-проверкой.

## Чеклист агента: «100% выполнено»

Возле каждого отмеченного пункта агент обязан добавить доказательство: команду и результат, ID теста без личных данных, screenshot без чувствительной информации или SHA commit. Нельзя отмечать пункт по предположению.

- [ ] URL бота совпадает с каноническим URL и отдаёт актуальные assets.
- [ ] `user-api`, `order-api`, `admin-api` отвечают `401`, не `404`, без `initData`; `catalog-api` отвечает `200`.
- [ ] `payment_mode` существует, demo не называется paid и не списывает остаток.
- [ ] Сервер определяет товар, вариант, цену, сумму и статус; браузер не может их подменить.
- [ ] Один idempotency key возвращает один заказ и одну activity-запись.
- [ ] Новый пользователь появляется после `track-open`, а заказ страхует его появление при сбое `track-open`.
- [ ] Buyer видит только свои заказы; owner видит общую серверную очередь после allowlist-проверки.
- [ ] Демо-заказ виден на другом аккаунте с составом, контактами, получением и меткой «Демо-оплата».
- [ ] Только сервер переводит `demo/paid → ready`; недопустимые переходы отклоняются.
- [ ] В коде нет `fashion-store-demo-orders-v1`, `createLocalDemoOrder` и локального `demoPayment`-заказа.
- [ ] Ошибки учёта открытия и checkout не подавляются пустым catch и не показывают покупателю технические детали.
- [ ] Refresh не параллелится, ограничен 30 секундами, не перезаписывает черновик и не даёт browser прямой доступ к таблицам.
- [ ] Пройдены syntax checks, клиентские тесты, серверные contract-тесты, `git diff --check`.
- [ ] Пройдены 320/375/430, темы, навигация и overflow либо честно отмечено `UNVERIFIED`.
- [ ] Пройден Telegram smoke-test покупателя и владельца на двух аккаунтах.
- [ ] README, ARCHITECTURE, `.env.example` и asset versions соответствуют реальному runtime.
- [ ] В commit нет секретов и персональных данных; SHA после push равен `origin/main`.

## Формат финального отчёта исполнителя

1. Подтверждённая первопричина и место исправления.
2. Изменённые файлы и назначение каждого.
3. Миграция и Edge Functions в одном project ref, без раскрытия секретов.
4. Команды проверки и их фактические результаты.
5. Результат Telegram smoke-test двух аккаунтов.
6. Пункты `UNVERIFIED` и причина.
7. Commit SHA, SHA `origin/main` и результат live-проверки URL бота.
