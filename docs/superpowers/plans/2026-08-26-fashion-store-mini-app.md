# Telegram Mini App «Фэшн стор» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать интерактивный локальный Telegram Mini App-прототип магазина «Фэшн стор» с каталогом, корзиной, демо-оформлением, заказом и режимом продавца.

**Architecture:** Одностраничное приложение без фреймворков загружает демонстрационные данные из `data.js`, использует чистые функции `core.js` для бизнес-логики и рендерит экраны через `app.js`. Telegram Web App SDK отвечает за тему, пользователя, safe areas и BackButton; корзина и заказ сохраняются локально.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, Telegram Web App SDK, Web Storage API, Node.js `node:test`.

**Spec:** `tg-app/docs/superpowers/specs/2026-08-26-fashion-store-mini-app-design.md`

## Global Constraints

- Все файлы приложения и его документация находятся внутри `tg-app/`.
- Точка входа — `tg-app/index.html`.
- Никаких JavaScript- и CSS-фреймворков, сборщика и обязательных npm-зависимостей.
- Интерфейс только на русском языке; бренд — «Фэшн стор», подпись — «Стильная женская одежда на каждый день».
- Нижняя навигация: «Главная», «Каталог», «Корзина», «Заказы», «Магазин».
- Целевая ширина — 320–430 px; интерактивные элементы — минимум 44 × 44 px; основной шрифт — минимум 14 px; горизонтальная прокрутка запрещена.
- Акцент — `#2AABEE`; обязательны светлая и тёмная темы, safe areas и анимации 200–300 ms.
- Официальный SDK подключается с `https://telegram.org/js/telegram-web-app.js`.
- `initDataUnsafe.user` используется только для приветствия, но не для авторизации.
- Оплата, доставка, остатки и доступ продавца явно обозначаются как демонстрационные.
- В начале каждого HTML, CSS и JavaScript-файла должен быть короткий комментарий на русском о назначении файла.
- Бизнес-логика и данные реализуются через TDD: тест создаётся и запускается до производственного кода.
- Для декларативных HTML/CSS и тонкого DOM-слоя пользователь подтвердил исключение TDD: они проверяются в реально запущенном браузере, а не тестами, которые ищут строки в исходниках.

---

## File Map

- `tg-app/index.html` — доступная оболочка приложения, Telegram SDK и порядок подключения скриптов.
- `tg-app/styles.css` — токены темы, мобильная компоновка, компоненты, анимации и состояния.
- `tg-app/data.js` — `FashionStoreData`: магазин, категории, товары, варианты и получение.
- `tg-app/core.js` — `FashionStoreCore`: чистые функции каталога, корзины, итогов и заказа.
- `tg-app/app.js` — `FashionStoreApp`: состояние экранов, DOM, события, Telegram SDK и `localStorage`.
- `tg-app/tests/data.test.js` — целостность демонстрационных данных.
- `tg-app/tests/core.test.js` — бизнес-логика фильтров, корзины и заказа.
- `tg-app/assets/*.jpg` — локальные оптимизированные изображения товаров и магазина.
- `tg-app/assets/SOURCES.md` — происхождение или способ генерации изображений.
- `tg-app/CLAUDE.md` — карта проекта, навигация, данные, запуск и ограничения.

---

### Task 1: Демонстрационные данные магазина

**Files:**
- Create: `tg-app/tests/data.test.js`
- Create: `tg-app/data.js`
- Create: `tg-app/assets/SOURCES.md`

**Interfaces:**
- Produces: `FashionStoreData = { STORE, CATEGORIES, PRODUCTS, DELIVERY_METHODS }` в браузере и через `module.exports` в Node.js.
- Product shape: `{ id, name, category, price, oldPrice, badge, images, colors, description, composition, care, fit, model, measurements, variants }`.
- Variant shape: `{ colorId, size, stock }`.
- Delivery shape: `{ id, title, description, price, demo }`.

- [ ] **Step 1: Написать падающий тест целостности данных**

```js
/* Тест проверяет целостность демонстрационного каталога. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { STORE, CATEGORIES, PRODUCTS, DELIVERY_METHODS } = require('../data.js');

test('каталог содержит бренд, пять категорий и полноценные варианты', () => {
  assert.equal(STORE.name, 'Фэшн стор');
  assert.equal(STORE.tagline, 'Стильная женская одежда на каждый день');
  assert.deepEqual(CATEGORIES.map(({ id }) => id), ['all', 'dresses', 'jackets', 'trousers', 'knitwear', 'shirts']);
  assert.ok(PRODUCTS.length >= 8);
  for (const product of PRODUCTS) {
    assert.ok(product.images.length >= 1);
    assert.ok(product.variants.some(({ stock }) => stock > 0));
    assert.ok(product.variants.every(({ stock }) => Number.isInteger(stock) && stock >= 0));
  }
  assert.deepEqual(DELIVERY_METHODS.map(({ id }) => id), ['pickup', 'courier']);
  assert.ok(DELIVERY_METHODS.every(({ demo }) => demo === true));
});
```

- [ ] **Step 2: Запустить тест и подтвердить RED**

Run: `node --test tg-app/tests/data.test.js`

Expected: FAIL с `Cannot find module '../data.js'`.

- [ ] **Step 3: Создать данные в Node/browser-совместимой оболочке**

```js
/* Здесь хранятся демонстрационные данные магазина и каталога. */
(function exposeData(root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  root.FashionStoreData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createData() {
  const STORE = {
    name: 'Фэшн стор',
    tagline: 'Стильная женская одежда на каждый день',
    address: 'Демонстрационный адрес: ул. Стильная, 12',
    hours: 'Ежедневно, 10:00–20:00',
    support: '@fashion_store_demo'
  };
  const CATEGORIES = [
    { id: 'all', title: 'Все' }, { id: 'dresses', title: 'Платья' },
    { id: 'jackets', title: 'Жакеты' }, { id: 'trousers', title: 'Брюки' },
    { id: 'knitwear', title: 'Трикотаж' }, { id: 'shirts', title: 'Рубашки' }
  ];
  const makeProduct = (product) => ({
    description: 'Универсальная модель для повседневных образов.',
    composition: 'Вискоза 60%, полиэстер 35%, эластан 5%',
    care: 'Деликатная стирка при 30 °C',
    fit: 'Комфортная посадка',
    model: 'Рост модели 174 см, размер S',
    measurements: { XS: '84–64–90', S: '88–68–94', M: '92–72–98', L: '96–76–102', XL: '100–80–106' },
    ...product
  });
  const PRODUCTS = [
    makeProduct({ id: 'dress-air', name: 'Платье Воздух', category: 'dresses', price: 5990, oldPrice: null, badge: 'Новинка', images: ['assets/dress-air.jpg'], colors: [{ id: 'blue', name: 'Голубой', hex: '#9ec9e6' }, { id: 'milk', name: 'Молочный', hex: '#eee9df' }], variants: [{ colorId: 'blue', size: 'S', stock: 3 }, { colorId: 'blue', size: 'M', stock: 1 }, { colorId: 'blue', size: 'L', stock: 0 }, { colorId: 'milk', size: 'S', stock: 2 }, { colorId: 'milk', size: 'M', stock: 2 }] }),
    makeProduct({ id: 'dress-midi', name: 'Платье Миди', category: 'dresses', price: 7490, oldPrice: 8990, badge: null, images: ['assets/dress-midi.jpg'], colors: [{ id: 'black', name: 'Чёрный', hex: '#242424' }, { id: 'berry', name: 'Ягодный', hex: '#8a3d55' }], variants: [{ colorId: 'black', size: 'XS', stock: 1 }, { colorId: 'black', size: 'S', stock: 4 }, { colorId: 'black', size: 'M', stock: 2 }, { colorId: 'berry', size: 'S', stock: 1 }, { colorId: 'berry', size: 'M', stock: 0 }] }),
    makeProduct({ id: 'jacket-soft', name: 'Жакет Софт', category: 'jackets', price: 9990, oldPrice: null, badge: 'Последний', images: ['assets/jacket-soft.jpg'], colors: [{ id: 'sand', name: 'Песочный', hex: '#c9ad8a' }], variants: [{ colorId: 'sand', size: 'S', stock: 0 }, { colorId: 'sand', size: 'M', stock: 1 }, { colorId: 'sand', size: 'L', stock: 0 }] }),
    makeProduct({ id: 'jacket-city', name: 'Жакет Сити', category: 'jackets', price: 11990, oldPrice: null, badge: 'Новинка', images: ['assets/jacket-city.jpg'], colors: [{ id: 'graphite', name: 'Графит', hex: '#555861' }, { id: 'milk', name: 'Молочный', hex: '#eee9df' }], variants: [{ colorId: 'graphite', size: 'S', stock: 2 }, { colorId: 'graphite', size: 'M', stock: 2 }, { colorId: 'milk', size: 'S', stock: 1 }, { colorId: 'milk', size: 'M', stock: 0 }] }),
    makeProduct({ id: 'trousers-wide', name: 'Брюки Палаццо', category: 'trousers', price: 6490, oldPrice: null, badge: null, images: ['assets/trousers-wide.jpg'], colors: [{ id: 'black', name: 'Чёрный', hex: '#242424' }, { id: 'beige', name: 'Бежевый', hex: '#d2bea3' }], variants: [{ colorId: 'black', size: 'S', stock: 3 }, { colorId: 'black', size: 'M', stock: 3 }, { colorId: 'black', size: 'L', stock: 1 }, { colorId: 'beige', size: 'S', stock: 2 }, { colorId: 'beige', size: 'M', stock: 0 }] }),
    makeProduct({ id: 'knit-cardigan', name: 'Кардиган Облако', category: 'knitwear', price: 5490, oldPrice: 6490, badge: null, images: ['assets/knit-cardigan.jpg'], colors: [{ id: 'milk', name: 'Молочный', hex: '#eee9df' }, { id: 'sky', name: 'Небесный', hex: '#b5d8eb' }], variants: [{ colorId: 'milk', size: 'S', stock: 5 }, { colorId: 'milk', size: 'M', stock: 3 }, { colorId: 'sky', size: 'S', stock: 1 }, { colorId: 'sky', size: 'M', stock: 2 }] }),
    makeProduct({ id: 'knit-top', name: 'Топ Риб', category: 'knitwear', price: 3490, oldPrice: null, badge: 'Новинка', images: ['assets/knit-top.jpg'], colors: [{ id: 'white', name: 'Белый', hex: '#f7f7f5' }, { id: 'cocoa', name: 'Какао', hex: '#8d6e60' }], variants: [{ colorId: 'white', size: 'XS', stock: 4 }, { colorId: 'white', size: 'S', stock: 4 }, { colorId: 'cocoa', size: 'S', stock: 2 }, { colorId: 'cocoa', size: 'M', stock: 2 }] }),
    makeProduct({ id: 'shirt-relaxed', name: 'Рубашка Релакс', category: 'shirts', price: 4990, oldPrice: null, badge: null, images: ['assets/shirt-relaxed.jpg'], colors: [{ id: 'white', name: 'Белый', hex: '#f7f7f5' }, { id: 'blue', name: 'Голубой', hex: '#9ec9e6' }], variants: [{ colorId: 'white', size: 'S', stock: 3 }, { colorId: 'white', size: 'M', stock: 1 }, { colorId: 'blue', size: 'S', stock: 0 }, { colorId: 'blue', size: 'M', stock: 2 }, { colorId: 'blue', size: 'L', stock: 2 }] })
  ];
  const DELIVERY_METHODS = [
    { id: 'pickup', title: 'Самовывоз', description: 'Демонстрационная точка магазина', price: 0, demo: true },
    { id: 'courier', title: 'Курьер по городу', description: 'Демонстрационная доставка в пределах города', price: 490, demo: true }
  ];
  return { STORE, CATEGORIES, PRODUCTS, DELIVERY_METHODS };
});
```

Использовать приведённые восемь объектов без переименования идентификаторов: тесты и пути изображений опираются на эти значения.

- [ ] **Step 4: Создать реестр изображений**

```md
<!-- Здесь зафиксировано происхождение визуальных материалов прототипа. -->
# Изображения

Изображения в этой папке созданы для демонстрационного прототипа «Фэшн стор» с помощью OpenAI ImageGen. Они не являются фотографиями реального ассортимента магазина.
```

- [ ] **Step 5: Запустить тест и подтвердить GREEN**

Run: `node --test tg-app/tests/data.test.js`

Expected: 1 test passed, 0 failed.

- [ ] **Step 6: Создать коммит задачи**

```bash
git add tg-app/data.js tg-app/tests/data.test.js tg-app/assets/SOURCES.md
git commit -m "feat: add Fashion Store catalog data"
```

---

### Task 2: Фильтрация и сортировка каталога

**Files:**
- Modify: `tg-app/tests/core.test.js`
- Create: `tg-app/core.js`

**Interfaces:**
- Consumes: `FashionStoreData.PRODUCTS`.
- Produces: `filterProducts(products, filters)`, `sortProducts(products, sortId)`, `getAvailableOptions(product, colorId)`.
- Filters shape: `{ category: string, sizes: string[], colors: string[], maxPrice: number | null, onlyNew: boolean }`.

- [ ] **Step 1: Написать падающие тесты каталога**

```js
/* Тест проверяет фильтры, сортировку и доступные варианты. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { PRODUCTS } = require('../data.js');
const { filterProducts, sortProducts, getAvailableOptions } = require('../core.js');

test('фильтр оставляет товары нужной категории и доступного размера', () => {
  const result = filterProducts(PRODUCTS, {
    category: 'dresses', sizes: ['M'], colors: [], maxPrice: null, onlyNew: false
  });
  assert.ok(result.length > 0);
  assert.ok(result.every((product) => product.category === 'dresses'));
  assert.ok(result.every((product) => product.variants.some((variant) => variant.size === 'M' && variant.stock > 0)));
});

test('сортировка по цене не изменяет исходный массив', () => {
  const original = PRODUCTS.map(({ id }) => id);
  const sorted = sortProducts(PRODUCTS, 'price-asc');
  assert.deepEqual(PRODUCTS.map(({ id }) => id), original);
  assert.ok(sorted.every((product, index) => index === 0 || sorted[index - 1].price <= product.price));
});

test('варианты возвращают размеры и остатки выбранного цвета', () => {
  const product = PRODUCTS[0];
  const colorId = product.colors[0].id;
  const options = getAvailableOptions(product, colorId);
  assert.ok(options.length > 0);
  assert.ok(options.every((variant) => variant.colorId === colorId));
});
```

- [ ] **Step 2: Запустить тест и подтвердить RED**

Run: `node --test tg-app/tests/core.test.js`

Expected: FAIL с `Cannot find module '../core.js'`.

- [ ] **Step 3: Реализовать чистые функции каталога**

```js
/* Здесь находится чистая бизнес-логика каталога, корзины и заказа. */
function filterProducts(products, filters) {
  return products.filter((product) => {
    const available = product.variants.filter(({ stock }) => stock > 0);
    return (filters.category === 'all' || product.category === filters.category)
      && (!filters.sizes.length || filters.sizes.some((size) => available.some((variant) => variant.size === size)))
      && (!filters.colors.length || filters.colors.some((color) => available.some((variant) => variant.colorId === color)))
      && (filters.maxPrice == null || product.price <= filters.maxPrice)
      && (!filters.onlyNew || product.badge === 'Новинка');
  });
}

function sortProducts(products, sortId) {
  const result = [...products];
  if (sortId === 'price-asc') result.sort((a, b) => a.price - b.price);
  if (sortId === 'price-desc') result.sort((a, b) => b.price - a.price);
  return result;
}

function getAvailableOptions(product, colorId) {
  return product.variants.filter((variant) => variant.colorId === colorId);
}
```

Экспортировать функции через `module.exports` и `globalThis.FashionStoreCore` тем же способом, что и `data.js`.

- [ ] **Step 4: Запустить все тесты и подтвердить GREEN**

Run: `node --test tg-app/tests/*.test.js`

Expected: 4 tests passed, 0 failed.

- [ ] **Step 5: Создать коммит задачи**

```bash
git add tg-app/core.js tg-app/tests/core.test.js
git commit -m "feat: add catalog filtering logic"
```

---

### Task 3: Корзина, итоги и заказ

**Files:**
- Modify: `tg-app/tests/core.test.js`
- Modify: `tg-app/core.js`

**Interfaces:**
- Produces: `addCartItem(cart, item, stock)`, `setCartItemQuantity(cart, key, quantity, stock)`, `removeCartItem(cart, key)`, `getCartSummary(cart, deliveryPrice)`, `createDemoOrder(cart, customer, delivery, existingOrder)`, `markOrderReady(order)`.
- Cart item shape: `{ key, productId, name, image, colorId, colorName, size, price, quantity }`.
- Order shape: `{ id, createdAt, status, items, customer, delivery, subtotal, deliveryPrice, total }`.

- [ ] **Step 1: Добавить падающие тесты корзины и заказа**

```js
test('одинаковый вариант объединяется и ограничивается остатком', () => {
  const item = { key: 'dress-air:blue:M', productId: 'dress-air', price: 5990, quantity: 1 };
  const first = addCartItem([], item, 2);
  const second = addCartItem(first, item, 2);
  const third = addCartItem(second, item, 2);
  assert.equal(second[0].quantity, 2);
  assert.equal(third[0].quantity, 2);
});

test('итог учитывает количество и доставку', () => {
  const summary = getCartSummary([
    { price: 5990, quantity: 2 }, { price: 3490, quantity: 1 }
  ], 490);
  assert.deepEqual(summary, { itemCount: 3, subtotal: 15470, deliveryPrice: 490, total: 15960 });
});

test('повторное подтверждение не создаёт второй заказ', () => {
  const cart = [{ key: 'dress-air:blue:M', price: 5990, quantity: 1 }];
  const first = createDemoOrder(cart, { name: 'Анна', phone: '+79990000000' }, { id: 'pickup', price: 0 }, null);
  const second = createDemoOrder(cart, { name: 'Анна', phone: '+79990000000' }, { id: 'pickup', price: 0 }, first);
  assert.equal(second.id, first.id);
});

test('готовность меняет только оплаченный заказ и не мутирует исходный', () => {
  const order = { id: 'FS-1001', status: 'paid' };
  const ready = markOrderReady(order);
  assert.equal(order.status, 'paid');
  assert.equal(ready.status, 'ready');
});
```

- [ ] **Step 2: Запустить новые тесты и подтвердить RED**

Run: `node --test tg-app/tests/core.test.js`

Expected: FAIL с `addCartItem is not a function`.

- [ ] **Step 3: Реализовать операции без мутаций**

```js
function addCartItem(cart, item, stock) {
  const current = cart.find((entry) => entry.key === item.key);
  if (!current) return [...cart, { ...item, quantity: Math.min(item.quantity || 1, stock) }];
  return cart.map((entry) => entry.key === item.key
    ? { ...entry, quantity: Math.min(entry.quantity + 1, stock) }
    : entry);
}

function getCartSummary(cart, deliveryPrice = 0) {
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { itemCount, subtotal, deliveryPrice, total: subtotal + deliveryPrice };
}

function setCartItemQuantity(cart, key, quantity, stock) {
  if (quantity <= 0) return cart.filter((item) => item.key !== key);
  return cart.map((item) => item.key === key ? { ...item, quantity: Math.min(quantity, stock) } : item);
}

function removeCartItem(cart, key) {
  return cart.filter((item) => item.key !== key);
}

function createDemoOrder(cart, customer, delivery, existingOrder) {
  if (existingOrder) return existingOrder;
  const summary = getCartSummary(cart, delivery.price);
  return {
    id: `FS-${String(Date.now()).slice(-6)}`, createdAt: new Date().toISOString(), status: 'paid',
    items: cart.map((item) => ({ ...item })), customer: { ...customer },
    delivery: { ...delivery }, ...summary
  };
}

function markOrderReady(order) {
  return order.status === 'paid' ? { ...order, status: 'ready' } : { ...order };
}
```

Экспортировать `addCartItem`, `setCartItemQuantity`, `removeCartItem`, `getCartSummary`, `createDemoOrder` и `markOrderReady` через Node/browser-оболочку Task 2.

- [ ] **Step 4: Запустить все тесты и подтвердить GREEN**

Run: `node --test tg-app/tests/*.test.js`

Expected: 11 tests passed, 0 failed.

- [ ] **Step 5: Создать коммит задачи**

```bash
git add tg-app/core.js tg-app/tests/core.test.js
git commit -m "feat: add cart and demo order logic"
```

---

### Task 4: Оболочка, темы и мобильная навигация

**Files:**
- Create: `tg-app/index.html`
- Create: `tg-app/styles.css`
- Create: `tg-app/app.js`

**Interfaces:**
- Consumes: `window.FashionStoreData`, `window.FashionStoreCore`, `window.Telegram?.WebApp`.
- Produces: `window.FashionStoreApp` с методами `init()`, `navigate(screen, params)`, `goBack()`, `render()`.
- DOM anchors: `#app`, `#screen`, `#bottom-nav`, `#toast`, `#modal-root`.

- [ ] **Step 1: Создать семантическую HTML-оболочку**

```html
<!-- Точка входа и доступная оболочка Telegram Mini App. -->
<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f6f7f9">
  <title>Фэшн стор</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app" class="app-shell">
    <main id="screen" class="screen" aria-live="polite"></main>
    <nav id="bottom-nav" class="bottom-nav" aria-label="Основная навигация">
      <button data-action="navigate" data-screen="home" aria-label="Главная"><span aria-hidden="true">⌂</span><span>Главная</span></button>
      <button data-action="navigate" data-screen="catalog" aria-label="Каталог"><span aria-hidden="true">▦</span><span>Каталог</span></button>
      <button data-action="navigate" data-screen="cart" aria-label="Корзина"><span aria-hidden="true">⌑</span><span>Корзина</span><b id="cart-badge" hidden>0</b></button>
      <button data-action="navigate" data-screen="orders" aria-label="Заказы"><span aria-hidden="true">✓</span><span>Заказы</span></button>
      <button data-action="navigate" data-screen="store" aria-label="Магазин"><span aria-hidden="true">●</span><span>Магазин</span></button>
    </nav>
  </div>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <div id="modal-root"></div>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="data.js"></script><script src="core.js"></script><script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Создать CSS-токены и мобильную оболочку**

```css
/* Стили мобильного интерфейса, тем Telegram и компонентов. */
:root {
  --accent: #2aabee; --bg: #f6f7f9; --surface: #ffffff; --text: #17212b;
  --muted: #6d7885; --border: rgba(23, 33, 43, .09); --touch-target: 44px;
  --transition: 240ms cubic-bezier(.2, .8, .2, 1);
  --safe-top: var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px));
  --safe-bottom: var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
}
* { box-sizing: border-box; }
html, body { margin: 0; min-width: 320px; overflow-x: hidden; background: var(--bg); color: var(--text); }
button, input, select { min-height: var(--touch-target); font: inherit; }
.app-shell { width: 100%; max-width: 430px; min-height: 100dvh; margin: 0 auto; }
.screen { padding: calc(12px + var(--safe-top)) 16px calc(88px + var(--safe-bottom)); animation: screen-in var(--transition); }
.bottom-nav { position: fixed; inset: auto 0 0; display: grid; grid-template-columns: repeat(5, 1fr); padding: 6px 4px calc(6px + var(--safe-bottom)); background: color-mix(in srgb, var(--surface) 94%, transparent); border-top: 1px solid var(--border); }
.bottom-nav button { min-width: 0; min-height: 52px; border: 0; background: transparent; color: var(--muted); font-size: 14px; display: grid; place-items: center; gap: 2px; }
.bottom-nav button[aria-current="page"] { color: var(--accent); }
.card { background: var(--surface); border-radius: 18px; box-shadow: 0 8px 24px rgba(23, 33, 43, .08); }
.primary-button { min-height: 48px; border: 0; border-radius: 14px; background: var(--accent); color: #fff; font-weight: 700; }
.product-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
button:active, [role="button"]:active { transform: scale(.98); }
[data-theme="dark"] { --bg: var(--tg-bg, #17212b); --surface: #202b36; --text: var(--tg-text, #f5f5f5); --muted: #a8b3bd; --border: rgba(255,255,255,.1); }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
```

В Task 5 добавить стили конкретных продуктовых компонентов рядом с этой базой, сохраняя токены и размеры из данного блока.

- [ ] **Step 3: Создать контроллер состояния и Telegram-адаптер**

```js
/* Управляет экранами, событиями и интеграцией Telegram Web App. */
(function createApp(window, document) {
  const tg = window.Telegram?.WebApp;
  const Data = window.FashionStoreData;
  const Core = window.FashionStoreCore;
  const screenElement = document.querySelector('#screen');
  const bottomNav = document.querySelector('#bottom-nav');
  const state = { screen: 'home', history: [], params: {}, cart: [], order: null, sellerMode: false };
  function navigate(screen, params = {}) { state.history.push({ screen: state.screen, params: state.params }); state.screen = screen; state.params = params; render(); }
  function goBack() { const previous = state.history.pop(); if (previous) { state.screen = previous.screen; state.params = previous.params; render(); } }
  function renderHome() {
    return `<header><p>Фэшн стор</p><h1>Стильная женская одежда на каждый день</h1></header><button class="primary-button" data-action="navigate" data-screen="catalog">Открыть каталог</button>`;
  }
  function render() { screenElement.innerHTML = renderHome(); bottomNav.hidden = false; }
  function init() { tg?.ready(); tg?.expand(); tg?.BackButton?.onClick(goBack); render(); }
  window.FashionStoreApp = { init, navigate, goBack, render };
  document.addEventListener('DOMContentLoaded', init, { once: true });
})(window, document);
```

После `DOMContentLoaded` показать skeleton на 300 ms, затем вызвать `render()`; это даёт проверяемое состояние загрузки без сетевого запроса.

- [ ] **Step 4: Проверить синтаксис и текущую бизнес-логику**

Run: `node --check tg-app/data.js && node --check tg-app/core.js && node --check tg-app/app.js && node --test tg-app/tests/*.test.js`

Expected: проверки синтаксиса завершаются без ошибок; 11 tests passed, 0 failed.

- [ ] **Step 5: Создать коммит задачи**

```bash
git add tg-app/index.html tg-app/styles.css tg-app/app.js
git commit -m "feat: add Telegram Mini App shell"
```

---

### Task 5: Покупательские экраны и корзина

**Files:**
- Modify: `tg-app/app.js`
- Modify: `tg-app/styles.css`

**Interfaces:**
- Produces renderers: `renderHome()`, `renderCatalog()`, `renderProduct(productId)`, `renderCart()`, `renderOrders()`, `renderStore()`.
- Produces UI helpers: `productCard(product)`, `money(value)`, `showToast(message)`, `openSheet(content, options)`, `closeSheet()`.
- Event contract: элементы используют `data-action` и дополнительные `data-product-id`, `data-color-id`, `data-size`, `data-screen`.

- [ ] **Step 1: Реализовать маршрутизацию и рендереры**

```js
const renderers = {
  home: () => renderHome(), catalog: () => renderCatalog(), product: () => renderProduct(state.params.productId),
  cart: () => renderCart(), orders: () => renderOrders(), store: () => renderStore()
};
function render() {
  document.documentElement.dataset.theme = tg?.colorScheme || 'light';
  screenElement.innerHTML = (renderers[state.screen] || renderers.home)();
  bottomNav.hidden = ['product', 'checkout-contact', 'checkout-delivery', 'checkout-review', 'payment-success', 'seller'].includes(state.screen);
  updateNav();
  updateBackButton();
}
```

Рендереры должны выдавать следующие точные блоки:

- `renderHome()` — имя пользователя, подпись бренда, пять карточек категорий, сезонный блок «Лёгкие слои» и четыре товара с `badge === 'Новинка'` или первые четыре доступных товара;
- `renderCatalog()` — заголовок, горизонтальные категории, кнопки «Фильтры» и «Сортировка», активные плашки и результат `Core.sortProducts(Core.filterProducts(Data.PRODUCTS, state.filters), state.sortId)`;
- `renderProduct(productId)` — локальное фото, цена, старая цена при её наличии, кнопки всех цветов, размеры выбранного цвета, приглушённые disabled-размеры с нулевым остатком, состав, уход, замеры и действия «В корзину»/«Купить сейчас»;
- `renderCart()` — пустое состояние или строки `state.cart`, кнопки −/+, удаление, результат `Core.getCartSummary(state.cart, 0)`, текст «Товары закрепятся за вами после демо-оплаты» и «Оформить заказ»;
- `renderOrders()` — пустое состояние или `state.order` с номером, суммой и русским отображением `paid`/`ready`;
- `renderStore()` — `Data.STORE.address`, часы, поддержка, пометка демонстрационных условий и кнопка «Режим продавца».

- [ ] **Step 2: Добавить один делегированный обработчик событий**

```js
document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const actions = {
    navigate: () => navigate(control.dataset.screen),
    'open-product': () => navigate('product', { productId: control.dataset.productId }),
    'select-color': () => selectColor(control.dataset.colorId),
    'select-size': () => selectSize(control.dataset.size),
    'add-to-cart': () => addSelectedProduct(false),
    'buy-now': () => addSelectedProduct(true),
    'cart-decrease': () => changeCartQuantity(control.dataset.key, -1),
    'cart-increase': () => changeCartQuantity(control.dataset.key, 1),
    'cart-remove': () => removeFromCart(control.dataset.key),
    filters: () => openFilters(), sort: () => openSort(), 'close-sheet': closeSheet
  };
  actions[control.dataset.action]?.();
});
```

Функции событий изменяют состояние по следующим правилам:

```js
function selectColor(colorId) { state.selectedColorId = colorId; state.selectedSize = null; render(); }
function selectSize(size) { state.selectedSize = size; render(); }
function changeCartQuantity(key, delta) {
  const item = state.cart.find((entry) => entry.key === key);
  if (!item) return;
  state.cart = Core.setCartItemQuantity(state.cart, key, item.quantity + delta, getVariantStock(item));
  saveState(); render();
}
function removeFromCart(key) { state.cart = Core.removeCartItem(state.cart, key); saveState(); render(); }
function saveState() {
  localStorage.setItem('fashion-store-cart-v1', JSON.stringify(state.cart));
  if (state.order) localStorage.setItem('fashion-store-order-v1', JSON.stringify(state.order));
}
```

`addSelectedProduct(goToCheckout)` находит выбранный вариант, показывает toast «Выберите цвет и размер», если выбор неполный, вызывает `Core.addCartItem` при положительном остатке, сохраняет состояние и переходит на `checkout-contact`, только когда `goToCheckout === true`. `openFilters()` показывает размеры XS–XL, цвета из `Data.PRODUCTS` и цену до 12 000 ₽; применение записывает `state.filters`. `openSort()` предлагает «По умолчанию», «Сначала дешевле» и «Сначала дороже». Неизвестные `data-action` безопасно игнорируются.

Нижняя панель реализует фокус и закрытие без сторонней библиотеки:

```js
let focusBeforeSheet = null;
function openSheet(content, { title = 'Панель' } = {}) {
  focusBeforeSheet = document.activeElement;
  modalRoot.innerHTML = `<div class="sheet__backdrop" data-action="close-sheet"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${title}"><button data-action="close-sheet" aria-label="Закрыть">×</button>${content}</section>`;
  modalRoot.querySelector('.sheet button, .sheet input, .sheet select')?.focus();
}
function closeSheet() { modalRoot.replaceChildren(); focusBeforeSheet?.focus(); }
function handleModalKeydown(event) {
  const sheet = modalRoot.querySelector('.sheet');
  if (!sheet) return;
  if (event.key === 'Escape') return closeSheet();
  if (event.key !== 'Tab') return;
  const controls = [...sheet.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')];
  if (!controls.length) return;
  const first = controls[0]; const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
document.addEventListener('keydown', handleModalKeydown);
```

- [ ] **Step 3: Дополнить CSS всеми покупательскими компонентами**

Добавить классы `.hero`, `.category-strip`, `.product-card`, `.product-gallery`, `.choice-grid`, `.size-button`, `.cart-item`, `.empty-state`, `.sheet`, `.sheet__backdrop`, `.toast`, `.badge`, `.skeleton` со следующими ограничениями: ширина `100%` или `minmax(0, 1fr)`, радиус 12–22 px, `min-height: var(--touch-target)` для элементов управления, `object-fit: cover` для фото, `position: fixed; inset: 0` для backdrop и `max-height: 88dvh; overflow-y: auto` для sheet. Недоступной `.size-button:disabled` задать `opacity: .38`, приглушённый фон и `cursor: not-allowed`.

- [ ] **Step 4: Запустить синтаксическую и автоматическую проверку**

Run: `node --check tg-app/app.js && node --test tg-app/tests/*.test.js`

Expected: синтаксис корректен; 11 tests passed, 0 failed.

- [ ] **Step 5: Создать коммит задачи**

```bash
git add tg-app/app.js tg-app/styles.css
git commit -m "feat: add catalog and cart screens"
```

---

### Task 6: Оформление, заказ и режим продавца

**Files:**
- Modify: `tg-app/app.js`
- Modify: `tg-app/styles.css`

**Interfaces:**
- Produces renderers: `renderCheckoutContact()`, `renderCheckoutDelivery()`, `renderCheckoutReview()`, `renderPaymentSuccess()`, `renderSellerOrders()`, `renderSellerOrder()`.
- Produces persistence: `loadPersistedState()`, `saveState()` with keys `fashion-store-cart-v1` and `fashion-store-order-v1`.
- Produces Telegram adapter: `applyTelegramTheme()`, `updateBackButton()`, `getTelegramFirstName()`.

- [ ] **Step 1: Реализовать три шага оформления**

`renderCheckoutContact()` показывает имя Telegram или «Гость», телефон и объяснение его назначения. `renderCheckoutDelivery()` показывает только `pickup` и `courier`, оба с бейджем «Демо». `renderCheckoutReview()` показывает состав, получение, доставку, итог и кнопку `Подтвердить демо-оплату`.

```js
function submitDemoPayment() {
  if (state.isSubmitting || state.cart.length === 0) return;
  state.isSubmitting = true;
  state.order = Core.createDemoOrder(state.cart, state.customer, state.delivery, state.order);
  state.cart = [];
  saveState();
  state.isSubmitting = false;
  navigate('payment-success');
}
```

Телефон проверять регулярным выражением `^\+?[0-9\s()\-]{10,20}$`; при ошибке оставаться на экране и показывать русскую подсказку.

Сохранённые данные восстанавливать с защитой от повреждённого JSON:

```js
function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (_error) {
    localStorage.removeItem(key);
    return fallback;
  }
}
function loadPersistedState() {
  const cart = readStored('fashion-store-cart-v1', []);
  const order = readStored('fashion-store-order-v1', null);
  state.cart = Array.isArray(cart) ? cart : [];
  state.order = order && typeof order === 'object' && typeof order.id === 'string' ? order : null;
}
```

Вызвать `loadPersistedState()` внутри `init()` до первого `render()`.

- [ ] **Step 2: Реализовать заказы и режим продавца**

`renderOrders()` показывает пустое состояние или текущий заказ. `renderSellerOrders()` отображает только существующий демо-заказ. `renderSellerOrder()` содержит состав и кнопку подтверждения. Вход продавца выполняется `enterSellerMode()` из раздела «Магазин», выход — `exitSellerMode()`.

```js
function confirmOrderReady() {
  if (!state.order || state.order.status !== 'paid') return;
  state.order = Core.markOrderReady(state.order);
  saveState();
  closeSheet();
  showToast('Статус обновлён: заказ собран');
  render();
}
```

- [ ] **Step 3: Завершить Telegram-интеграцию и fallback**

```js
function applyTelegramTheme() {
  const params = tg?.themeParams || {};
  document.documentElement.dataset.theme = tg?.colorScheme === 'dark' ? 'dark' : 'light';
  if (params.bg_color) document.documentElement.style.setProperty('--tg-bg', params.bg_color);
  if (params.text_color) document.documentElement.style.setProperty('--tg-text', params.text_color);
  if (params.button_color) document.documentElement.style.setProperty('--tg-button', params.button_color);
}
function updateBackButton() {
  if (!tg?.BackButton) return;
  state.history.length ? tg.BackButton.show() : tg.BackButton.hide();
}
tg?.onEvent?.('themeChanged', applyTelegramTheme);
```

Добавить обычную кнопку назад на внутренних экранах для запуска вне Telegram и обработку Escape для нижних панелей.

- [ ] **Step 4: Запустить синтаксическую и автоматическую проверку**

Run: `node --check tg-app/app.js && node --test tg-app/tests/*.test.js`

Expected: синтаксис корректен; 11 tests passed, 0 failed.

- [ ] **Step 5: Создать коммит задачи**

```bash
git add tg-app/app.js tg-app/styles.css
git commit -m "feat: add checkout and seller demo"
```

---

### Task 7: Локальные изображения, документация и финальная проверка

**Files:**
- Create: `tg-app/assets/dress-air.jpg`
- Create: `tg-app/assets/dress-midi.jpg`
- Create: `tg-app/assets/jacket-soft.jpg`
- Create: `tg-app/assets/jacket-city.jpg`
- Create: `tg-app/assets/trousers-wide.jpg`
- Create: `tg-app/assets/knit-cardigan.jpg`
- Create: `tg-app/assets/knit-top.jpg`
- Create: `tg-app/assets/shirt-relaxed.jpg`
- Create: `tg-app/assets/storefront.jpg`
- Modify: `tg-app/data.js`
- Modify: `tg-app/tests/data.test.js`
- Create: `tg-app/CLAUDE.md`

**Interfaces:**
- Consumes: пути `images` из `FashionStoreData.PRODUCTS`.
- Produces: восемь товарных и одно интерьерное оптимизированное JPEG-изображение, а также пользовательскую документацию.

- [ ] **Step 1: Добавить падающий тест локальных ресурсов**

```js
test('все изображения каталога локальны и существуют', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { PRODUCTS } = require('../data.js');
  const root = path.join(__dirname, '..');
  for (const product of PRODUCTS) {
    for (const image of product.images) {
      assert.match(image, /^assets\/[a-z0-9-]+\.jpg$/);
      assert.ok(fs.existsSync(path.join(root, image)), image);
    }
  }
});
```

- [ ] **Step 2: Запустить тест и подтвердить RED**

Run: `node --test tg-app/tests/data.test.js`

Expected: FAIL с отсутствующим первым JPEG-файлом.

- [ ] **Step 3: Создать единый набор fashion-изображений**

Использовать навык `imagegen` для оригинальных вертикальных editorial-фотографий без логотипов и текста: светлая студия, повседневная женская одежда, единый мягкий свет, разнообразные образы, полный товар хорошо читается. Сохранить итоговые изображения под точными именами из списка файлов как оптимизированные JPEG шириной 733–825 px и обновить `data.js`, чтобы каждый товар ссылался только на локальные пути. JPEG выбран после подтверждённого отсутствия WebP-кодека у системных конвертеров; новая зависимость не добавляется.

- [ ] **Step 4: Создать `CLAUDE.md` с конкретной картой проекта**

```md
<!-- Документ объясняет устройство и изменение прототипа. -->
# CLAUDE.md

## Что это
Локальный интерактивный прототип Telegram Mini App магазина «Фэшн стор».

## Файлы
- `index.html` — точка входа и Telegram SDK.
- `styles.css` — темы и мобильный интерфейс.
- `data.js` — бренд, товары, остатки и получение.
- `core.js` — тестируемая бизнес-логика.
- `app.js` — экраны, события и Telegram.
- `tests/` — автоматические проверки.

## Навигация
Главная → Каталог → Товар → Корзина → Контакты → Получение → Проверка → Демо-оплата → Заказ.

## Где менять данные
Все демонстрационные данные меняются в `data.js`; обязательные поля перечислены в разделе структуры товара.

## Ограничения
Сервер, реальная оплата, защищённая роль продавца, бот и синхронизация остатков не реализованы.
```

Продолжить `CLAUDE.md` следующими разделами без изменения команд и ключей:

```md
## Запуск
Из корня проекта: `python3 -m http.server 4173 --directory tg-app`, затем открыть `http://localhost:4173`.

## Тесты
Из корня проекта: `node --test tg-app/tests/*.test.js`.

## Сохранение
- `fashion-store-cart-v1` — корзина.
- `fashion-store-order-v1` — текущий демонстрационный заказ.

## Карта экранов
- Нижние разделы: `home`, `catalog`, `cart`, `orders`, `store`.
- Внутренние экраны: `product`, `checkout-contact`, `checkout-delivery`, `checkout-review`, `payment-success`, `seller-orders`, `seller-order`.

## Замена изображений
1. Положить оптимизированный JPEG-файл в `assets/`.
2. Использовать латинское имя в нижнем регистре без пробелов.
3. В `data.js` заменить путь в массиве `images` нужного товара.
4. Запустить автоматические тесты.

## Структура товара
Обязательны `id`, `name`, `category`, `price`, `oldPrice`, `badge`, `images`, `colors`, `description`, `composition`, `care`, `fit`, `model`, `measurements`, `variants`. Остаток каждого варианта задаётся полями `colorId`, `size`, `stock`.
```

- [ ] **Step 5: Запустить автоматическую проверку**

Run: `node --test tg-app/tests/*.test.js`

Expected: 12 tests passed, 0 failed.

- [ ] **Step 6: Запустить локальный сервер и проверить синтаксис**

Run: `node --check tg-app/data.js && node --check tg-app/core.js && node --check tg-app/app.js`

Expected: exit code 0 без вывода ошибок.

Run: `python3 -m http.server 4173 --directory tg-app`

Expected: сервер сообщает `Serving HTTP on ... port 4173` и остаётся запущенным для ручной проверки.

- [ ] **Step 7: Выполнить ручную проверку в браузере**

Проверить при ширине 320, 375 и 430 px:

1. Главная загружается без горизонтальной прокрутки.
2. Все пять пунктов нижней навигации видимы и нажимаются.
3. Каталог фильтруется; карточка открывается; недоступный размер отключён.
4. Товар добавляется в корзину, количество и итог меняются.
5. Оформление проходит через контакты, получение и демо-оплату.
6. Заказ появляется в разделе «Заказы».
7. Через «Магазин» открывается продавец, статус меняется на «Заказ собран».
8. После перезагрузки корзина или заказ восстанавливается.
9. Светлая и тёмная темы читаемы; focus и reduced motion не ломают интерфейс.
10. Консоль браузера не содержит ошибок.

- [ ] **Step 8: Создать финальный коммит задачи**

```bash
git add tg-app/assets tg-app/data.js tg-app/tests/data.test.js tg-app/CLAUDE.md
git commit -m "feat: complete Fashion Store Mini App prototype"
```

- [ ] **Step 9: Выполнить финальную Git-проверку**

Run: `git status --short --branch && git log -7 --oneline --decorate`

Expected: рабочая папка чистая; `main` содержит коммиты всех семи задач.
