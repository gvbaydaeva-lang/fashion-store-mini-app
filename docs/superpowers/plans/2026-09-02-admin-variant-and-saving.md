# Варианты цвета и сохранение товара — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Продавец создаёт отдельные цвета с собственными размерами и остатками, свободно сохраняет черновики и публикует только полностью заполненные товары без потери уже опубликованной карточки.

**Architecture:** `core.js` получает чистые функции для нормализации цветовых блоков и построения вариантов только внутри цвета. `app.js` отображает и синхронизирует отдельные блоки, а `api.js` сериализует каждую пару цвет-размер с ручным названием цвета. Edge Function повторяет правила публикации и всегда отвечает полной карточкой, поэтому клиент не заменяет товар неполным объектом.

**Tech Stack:** Vanilla JavaScript, Node.js built-in test runner, Deno Supabase Edge Functions, PostgreSQL RPC.

**Spec:** `tg-app/docs/superpowers/specs/2026-09-02-admin-variant-and-saving-design.md`

## Global Constraints

- Не добавлять npm-зависимости, фреймворки, новые таблицы или изменения авторизации.
- Технический `colorId` никогда не показывается и не становится `color_name`.
- В одном поле «Цвет / синонимы» запятые — часть одного ручного названия; отдельный блок — отдельный цвет.
- Черновик не валидируется по обязательным полям; публикация требует фото, название, цену, описание, оптовую цену, цвет, размер и корректный включённый остаток.
- Категория, поставщик, артикул и старая цена необязательны.
- Не commit/push без отдельного разрешения пользователя после локального preview.

---

### Task 1: Чистая модель цветовых блоков и правила публикации

**Files:**

- Modify: `tg-app/core.js:171-244`
- Modify: `tg-app/tests/core.test.js:272-357`

**Interfaces:**

- Consumes: `colors: Array<{id: string, name: string}>`, `variants: Array<{colorId: string, size: string, stock: number, enabled?: boolean}>`.
- Produces: `buildColorVariants(color, sizes, previousVariants)`, `validateAdminProduct(product, 4)`.

- [ ] **Step 1: Write failing tests for separate color sizes and publication fields**

```js
test('размеры одного цвета не создают варианты другого цвета', () => {
  const result = buildColorVariants(
    { id: 'brown', name: 'Коричневый, шоколадный' },
    ['42', '44'],
    [{ colorId: 'brown', size: '42', stock: 3 }],
  );
  assert.deepEqual(result, [
    { colorId: 'brown', size: '42', stock: 3, enabled: true },
    { colorId: 'brown', size: '44', stock: 0, enabled: true },
  ]);
});

test('публикация требует описание и оптовую цену, но черновик не требует полей', () => {
  const product = { images: [], name: '', price: '', wholesalePrice: null, description: '', colors: [], variants: [] };
  assert.deepEqual(validateAdminProduct(product, 'draft'), {});
  assert.equal(validateAdminProduct(product, 'publish').description, 'Добавь описание товара');
  assert.equal(validateAdminProduct(product, 'publish').wholesalePrice, 'Добавь оптовую цену');
});
```

- [ ] **Step 2: Verify the tests fail for the missing API**

Run: `node --test tg-app/tests/core.test.js`

Expected: failure because `buildColorVariants` is not exported and the current validation does not recognise `draft`/`publish` nor require description and wholesale price.

- [ ] **Step 3: Implement minimal core functions**

```js
function buildColorVariants(color, sizes, previousVariants = []) {
  const oldBySize = new Map(previousVariants
    .filter((variant) => variant.colorId === color.id)
    .map((variant) => [variant.size, variant]));
  return normalizeAdminOptionList(sizes).map((size) => {
    const previous = oldBySize.get(size);
    return { colorId: color.id, size, stock: Number.isInteger(previous?.stock) && previous.stock >= 0 ? previous.stock : 0, enabled: previous?.enabled !== false };
  });
}
```

Update `validateAdminProduct(product, mode)` so `mode === 'draft'` returns no required-field errors; `mode === 'publish'` checks the exact agreed fields and validates variants grouped by their listed colors. Preserve its old numeric step behaviour only if another caller still uses it.

- [ ] **Step 4: Verify the core tests pass**

Run: `node --test tg-app/tests/core.test.js`

Expected: zero failing tests.

### Task 2: API contract preserves manual color names and incomplete drafts

**Files:**

- Modify: `tg-app/api.js:20-35, 58-104`
- Modify: `tg-app/tests/api.test.js:126-164`

**Interfaces:**

- Consumes: `Product.colors[]`, `Product.variants[]`, including empty `price` and `wholesalePrice` in drafts.
- Produces: `serializeProduct(product)` where every variant has `color_name` equal to its matching color `name`.

- [ ] **Step 1: Write failing API serialization tests**

```js
test('сериализация передаёт ручное имя цвета вместо technical id', async () => {
  const product = {
    adminStatus: 'draft', images: [], price: '', wholesalePrice: null,
    colors: [{ id: 'brown', name: 'Коричневый, шоколадный' }],
    variants: [{ colorId: 'brown', size: '42', stock: 2, enabled: true }],
  };
  // capture request body from createAdminProduct(product)
  assert.deepEqual(body.product.variants, [{
    color_id: 'brown', color_name: 'Коричневый, шоколадный', color_hex: null,
    size: '42', stock: 2, is_enabled: true,
  }]);
  assert.equal(body.product.price, null);
  assert.equal(body.product.wholesale_price, null);
});
```

- [ ] **Step 2: Verify the test fails**

Run: `node --test tg-app/tests/api.test.js`

Expected: current result uses the technical ID as `color_name` and turns missing price into `0`.

- [ ] **Step 3: Implement minimal serialization changes**

```js
const colorNames = new Map((product?.colors || []).map((color) => [color.id, color.name]));
// in variants map:
color_name: colorNames.get(variant.colorId) || variant.colorName || variant.colorId,
// price:
price: optionalNumber(product?.price),
```

Keep the existing normalizer compatible with server variants and retain a manual `color_name` after a server round trip.

- [ ] **Step 4: Verify API tests pass**

Run: `node --test tg-app/tests/api.test.js`

Expected: zero failing tests.

### Task 3: Отдельные карточки цветов в редакторе

**Files:**

- Modify: `tg-app/app.js:1031-1450, 1490-1510, 1741-1806`
- Modify: `tg-app/styles.css:1074-1135, 1271-1301`
- Modify: `tg-app/tests/app-smoke.test.js:185-191`
- Modify: `tg-app/tests/mobile-admin-css.test.js`

**Interfaces:**

- Consumes: `Core.buildColorVariants`, `Core.validateAdminProduct(product, 'draft' | 'publish')`.
- Produces: one DOM block `[data-admin-color-index]` per color, with `adminColorName` and `adminColorSizes` inputs.

- [ ] **Step 1: Write failing renderer and mobile CSS tests**

```js
state.adminDraft = {
  ...product,
  colors: [
    { id: 'black', name: 'Чёрный' },
    { id: 'brown', name: 'Коричневый, шоколадный' },
  ],
  variants: [
    { colorId: 'black', size: 'S', stock: 1 },
    { colorId: 'brown', size: '42', stock: 2 },
  ],
};
render();
assert.match(screen.innerHTML, /data-admin-color-index="0"/);
assert.match(screen.innerHTML, /data-admin-color-index="1"/);
assert.doesNotMatch(screen.innerHTML, /name="adminColors"/);
```

Extend mobile CSS assertions to require a one-column color block and 44 px delete/action controls at 320–430 px.

- [ ] **Step 2: Verify the UI tests fail**

Run: `node --test tg-app/tests/app-smoke.test.js tg-app/tests/mobile-admin-css.test.js`

Expected: current editor has one `adminColors` input and no per-color blocks.

- [ ] **Step 3: Implement the editor and form synchronisation**

Render each existing color as a card with the exact stored name, its own comma-separated size input and its own stock rows. Make `add-admin-variant` append a blank visual card. Make `remove-admin-color` delete only that card. In `syncAdminForm`, ignore blank cards, retain an entered color text including commas verbatim, create a stable slug without `color-`, and rebuild only that color’s variants via `Core.buildColorVariants`.

Use Russian controls: «Цвет / синонимы», «Размеры этого цвета», «Добавить вариант цвета», «Удалить цвет». Keep actions at least 44 × 44 px and do not change unrelated form sections.

- [ ] **Step 4: Make buttons use the correct validation mode**

```js
if (status === 'published') {
  state.adminErrors = Core.validateAdminProduct(state.adminDraft, 'publish');
  // show errors and retain the form on failure
}
// draft path only persists; it does not call validateAdminProduct
```

The “Сохранить” button of a new draft always calls `saveAdminProduct('draft')`; editing a published product calls `saveAdminProduct('published')` only after the publication checks.

- [ ] **Step 5: Verify UI tests pass**

Run: `node --test tg-app/tests/app-smoke.test.js tg-app/tests/mobile-admin-css.test.js`

Expected: zero failing tests and the old shared color input is absent.

### Task 4: Серверные правила и полный ответ опубликенного товара

**Files:**

- Modify: `supabase/functions/admin-api/index.ts:38-181`
- Modify: `supabase/functions/tests/admin-product.test.ts`

**Interfaces:**

- Consumes: serialized product payload from `api.js`.
- Produces: `publishProduct(client, productId)` that returns `readProductWithChildren(client, id)` whether the status was already `published` or was just changed.

- [ ] **Step 1: Write failing server tests for publish validation and idempotent response**

```ts
test('публикация требует описание и оптовую цену, но не категорию', () => {
  const errors = getPublicationErrors({
    name: 'Платье', price: 5000, description: '', wholesale_price: null,
    category: 'all', product_images: [{}], product_variants: [{ is_enabled: true, stock: 0 }],
  });
  assert.deepEqual(errors, ['Добавь описание товара', 'Добавь оптовую цену']);
});

test('повторная публикация возвращает полную карточку', async () => {
  const result = await publishProduct(clientWithPublishedProduct, 7);
  assert.equal(result.product.name, 'Платье');
  assert.equal(result.product.product_variants.length, 1);
  assert.equal(result.product.product_images.length, 1);
});
```

- [ ] **Step 2: Verify the server tests fail**

Run: `deno test --allow-env --allow-net supabase/functions/tests/admin-product.test.ts`

Expected: the validation helper is absent and the current idempotent branch returns only `id` and `status`.

- [ ] **Step 3: Implement shared publication validation and response**

Extract a pure `getPublicationErrors(product)` helper into `supabase/functions/_shared/admin-product.ts`; use it in `publishProduct`. It must demand photo, name, positive integer price, non-empty description, positive integer wholesale price, at least one named color, size and enabled integer-stock variant, but not category.

Replace the idempotent branch with:

```ts
if (current.status === 'published') {
  return ok({ product: await readProductWithChildren(client, id), idempotent: true });
}
```

The server’s `readVariants` keeps `color_name` supplied by the client and rejects a variant whose color name is blank.

- [ ] **Step 4: Verify server tests pass**

Run: `deno test --allow-env --allow-net supabase/functions/tests/admin-product.test.ts supabase/functions/tests/telegram-auth.test.ts`

Expected: zero failing tests.

### Task 5: Документация, полный набор проверок и локальный preview

**Files:**

- Modify: `README.md`
- Modify: `ARCHITECTURE.md:169-201`
- Modify: `tg-app/docs/superpowers/specs/2026-09-02-admin-variant-and-saving-design.md` only if implementation needs a factual correction.

**Interfaces:**

- Consumes: implemented client and server behaviour.
- Produces: documentation matching runtime behaviour and a preview URL.

- [ ] **Step 1: Update documentation**

Replace the old explanation of one shared color line with the exact per-color-card behaviour. Document the draft/publication distinction and list the mandatory publication fields. State that the item remains server-backed and publication cannot be confirmed in Telegram until deployment.

- [ ] **Step 2: Run static and automated checks**

Run:

```bash
node --check tg-app/data.js
node --check tg-app/core.js
node --check tg-app/ui.js
node --check tg-app/api.js
node --check tg-app/app.js
node --test tg-app/tests/*.test.js
deno test --allow-env --allow-net supabase/functions/tests/admin-product.test.ts supabase/functions/tests/telegram-auth.test.ts
git diff --check
```

Expected: every command exits with code 0.

- [ ] **Step 3: Start and inspect the local preview**

Run: `python3 -m http.server 4173 --directory tg-app`

Manually inspect at 320, 375 and 430 px: add black with `S`, add `Коричневый, шоколадный` with `42, 44`, enter different stock values, save a one-field draft, attempt an incomplete publication, publish a complete product, edit it, and confirm it remains under «Опубликованы».

- [ ] **Step 4: Hand off preview before publication**

Provide the local preview address and test evidence. Do not commit, push, deploy Edge Functions or claim Telegram iOS/Android verification until the user approves the local result and separately asks to publish.

## Self-review

- Coverage: Tasks 1–3 implement one color block with its own sizes/stocks, preserve comma-separated synonyms as one name, remove `color-`, and distinguish drafts from publication. Task 4 protects the same rules on the server and fixes the incomplete idempotent response. Task 5 synchronises documentation and verifies the requested product flow.
- Placeholder scan: не обнаружены незаполненные пункты или неопределённые шаги реализации и тестирования.
- Interface consistency: `Core.buildColorVariants` is created in Task 1, called in Task 3; `api.js` passes `color_name` in Task 2, and Task 4 keeps it through server validation/storage.
