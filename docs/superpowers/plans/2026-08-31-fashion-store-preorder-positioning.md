# Fashion Store Preorder Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible demo storefront with a clean pre-order landing and empty catalog, while preserving the existing visual system and making the local demo data reset explicit.

**Architecture:** Keep the vanilla JavaScript client-only prototype intact. `data.js` supplies an empty seed catalog and the public pre-order copy; `app.js` performs a versioned one-time local reset and renders the copy, empty states, and low-stock text; `styles.css` supplies the hero image and the single-unit text treatment. This plan deliberately does not claim cross-device publishing, real payment, or a server-backed admin catalog.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js built-in test runner, local assets, Telegram Web App SDK.

**Spec:** `tg-app/docs/superpowers/specs/2026-08-31-fashion-store-preorder-positioning-design.md`

## Global Constraints

- Keep the visible name `Fashion Store`, the current palette, Cormorant, Manrope, and mobile-first layout.
- Use the approved Russian copy verbatim.
- Do not show supplier or wholesale price in buyer screens.
- Do not describe the prototype payment or local admin state as real payment, inventory, or synchronization.
- Delete only known local demo keys on the approved one-time reset; never access `.env` values.
- Do not add a framework, build step, server, database, or npm dependency.

---

### Task 1: Establish an empty seed catalog and public pre-order data

**Files:**
- Modify: `tg-app/data.js`
- Modify: `tg-app/tests/data.test.js`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Consumes: `FashionStoreData.STORE`, `CATEGORIES`, `PRODUCTS`, and `DELIVERY_METHODS`.
- Produces: an empty `PRODUCTS` array and store metadata suitable for the new public text; buyer renderers must accept an empty catalog.

- [ ] **Step 1: Write the failing data contract test**

```js
test('стартовый каталог пуст, а условия предзаказа зафиксированы', () => {
  assert.deepEqual(PRODUCTS, []);
  assert.deepEqual(CATEGORIES.map(({ id }) => id), ['all']);
  assert.equal(STORE.preorderTerms.delivery, 'Цена указана с учётом доставки до Элисты');
  assert.deepEqual(DELIVERY_METHODS.map(({ id }) => id), ['pickup']);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tg-app/tests/data.test.js`

Expected: FAIL because the seeded product list, category list, delivery methods, and store metadata still represent the demo.

- [ ] **Step 3: Replace seed data without deleting admin-only field definitions**

```js
const STORE = {
  name: 'Fashion Store',
  tagline: 'Трендовые модели без лишних наценок.',
  description: 'Стиль, который не требует переплаты.',
  preorderTerms: {
    payment: 'Полная оплата при оформлении предзаказа',
    leadTime: 'Срок поступления: 7–10 дней',
    pickup: 'Самовывоз в Элисте',
    delivery: 'Цена указана с учётом доставки до Элисты',
  },
};
const CATEGORIES = [{ id: 'all', title: 'Все' }];
const PRODUCTS = [];
const DELIVERY_METHODS = [{ id: 'pickup', title: 'Самовывоз в Элисте', price: 0, demo: true }];
```

Remove only obsolete demo fields and data that no longer have consumers. Preserve the internal `wholesalePrice` and `supplier` fields in the admin product shape; do not render them on buyer screens.

- [ ] **Step 4: Update factual documentation**

Change `README.md` and `ARCHITECTURE.md` so they say the public seed catalog is empty, the app is still local/demo-only, and the sole configured prototype delivery method is pickup in Elista. Do not say that categories created by the local admin propagate to other buyers.

- [ ] **Step 5: Run focused checks**

Run: `node --check tg-app/data.js && node --test tg-app/tests/data.test.js && git diff --check`

Expected: all commands exit 0.

### Task 2: Make local demo reset and empty buyer states explicit

**Files:**
- Modify: `tg-app/app.js`
- Modify: `tg-app/tests/app-smoke.test.js`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Consumes: the keys `fashion-store-cart-v1`, `fashion-store-order-v1`, `fashion-store-admin-products-v1`, and new reset marker `fashion-store-preorder-reset-v1`.
- Produces: `applyApprovedDemoReset()` which runs before `loadPersistedState()` and a buyer-safe empty catalog state.

- [ ] **Step 1: Write failing behavior tests**

```js
test('новая версия один раз очищает только утверждённые локальные демо-ключи', () => {
  const storage = createStorage({
    'fashion-store-cart-v1': '[{"key":"demo"}]',
    'fashion-store-order-v1': '{"id":"FS-1"}',
    'fashion-store-admin-products-v1': '[{"id":"dress-air"}]',
  });
  const app = loadApp({ localStorage: storage });
  assert.equal(storage.getItem('fashion-store-cart-v1'), null);
  assert.equal(storage.getItem('fashion-store-order-v1'), null);
  assert.equal(storage.getItem('fashion-store-admin-products-v1'), null);
  assert.equal(storage.getItem('fashion-store-preorder-reset-v1'), '1');
});

test('пустой каталог объясняет, что ассортимент скоро появится', () => {
  const app = loadApp();
  app.navigate('catalog');
  assert.match(app.getScreenHtml(), /Ассортимент скоро появится/);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tg-app/tests/app-smoke.test.js`

Expected: FAIL because no reset marker or empty-catalog copy exists.

- [ ] **Step 3: Add a narrow, idempotent migration**

```js
const PREORDER_RESET_KEY = 'fashion-store-preorder-reset-v1';

function applyApprovedDemoReset() {
  if (window.localStorage.getItem(PREORDER_RESET_KEY) === '1') return;
  [CART_KEY, ORDER_KEY, ADMIN_PRODUCTS_KEY].forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.setItem(PREORDER_RESET_KEY, '1');
}
```

Call it immediately before `loadPersistedState()`. Do not clear unrelated localStorage keys. Replace buyer-facing no-result copy with `Ассортимент скоро появится` and a short explanation; retain a working button to the existing store/contact section.

- [ ] **Step 4: Document the reset**

State in `README.md` and `ARCHITECTURE.md` exactly which three local keys are cleared once and that this does not synchronize or delete data from another device.

- [ ] **Step 5: Run focused checks**

Run: `node --check tg-app/app.js && node --test tg-app/tests/app-smoke.test.js && git diff --check`

Expected: all commands exit 0.

### Task 3: Render the approved hero, conditions, and low-stock text

**Files:**
- Create: `tg-app/assets/preorder-hero.jpg`
- Modify: `tg-app/app.js`
- Modify: `tg-app/styles.css`
- Modify: `tg-app/tests/app-smoke.test.js`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Consumes: `STORE.tagline`, `STORE.description`, `STORE.preorderTerms`, and a selected product variant.
- Produces: `renderPreorderTerms()` and `getLowStockText(variant)` where only `{ stock: 1 }` returns `Осталась 1 шт.`.

- [ ] **Step 1: Write failing pure/render tests**

```js
test('текст последней единицы появляется только при остатке один', () => {
  assert.equal(getLowStockText({ stock: 1 }), 'Осталась 1 шт.');
  assert.equal(getLowStockText({ stock: 2 }), '');
  assert.equal(getLowStockText({ stock: 0 }), '');
});

test('главная использует утверждённый текст и четыре условия', () => {
  const app = loadApp();
  assert.match(app.getScreenHtml(), /Трендовые модели без лишних наценок/);
  assert.match(app.getScreenHtml(), /Цена указана с учётом доставки до Элисты/);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tg-app/tests/app-smoke.test.js`

Expected: FAIL because the existing hero and stock text do not follow the new contract.

- [ ] **Step 3: Implement the smallest rendering change**

Render the two approved hero lines verbatim, a four-row `Условия предзаказа` section, and text `Осталась 1 шт.` near the selected size only when its stock equals `1`. Do not use a rounded badge for this text. Point the existing `.hero` background at `assets/preorder-hero.jpg` and preserve its contrast gradient and current typography.

- [ ] **Step 4: Add scoped CSS**

```css
.preorder-terms { display: grid; gap: 10px; }
.preorder-terms__item { display: flex; gap: 10px; align-items: flex-start; }
.low-stock-text { margin: -8px 0 14px; color: #8a3d55; font-size: 14px; font-weight: 700; }
```

Use existing theme variables where they provide sufficient contrast. The final display must remain a simple line of text, never a `badge`/`status-pill` component.

- [ ] **Step 5: Verify the image and regression suite**

Run: `test -s tg-app/assets/preorder-hero.jpg && node --check tg-app/app.js && node --check tg-app/data.js && node --check tg-app/core.js && node --check tg-app/ui.js && node --test tg-app/tests/*.test.js && git diff --check`

Expected: all commands exit 0.

### Task 4: Visual regression and handoff

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Consumes: completed visual/UI implementation from Tasks 1–3.
- Produces: truthful local verification instructions and documented production boundary.

- [ ] **Step 1: Launch the local Mini App**

Run: `python3 -m http.server 4173 --directory tg-app`

Expected: a local server serving the Mini App at `http://localhost:4173`.

- [ ] **Step 2: Manually check the required visual paths**

At 320, 375, and 430 px verify: no horizontal scrolling; hero text stays readable over the image; all four conditions are readable; empty catalog is understandable; the product screen shows simple burgundy `Осталась 1 шт.` text only for stock `1`; light and dark themes remain legible.

- [ ] **Step 3: Record actual limits in documentation**

Keep the server-backed catalog, verified Telegram authorization, payment confirmation, bot messages, mailing, and analytics in the unimplemented section. Do not call browser-only checks a Telegram iOS/Android check.

- [ ] **Step 4: Run the full documented gate**

Run: `node --check tg-app/data.js && node --check tg-app/core.js && node --check tg-app/ui.js && node --check tg-app/app.js && node --test tg-app/tests/*.test.js && git diff --check`

Expected: all commands exit 0.
