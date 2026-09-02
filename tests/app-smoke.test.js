/* Smoke-тест загружает настоящий app.js и проверяет рендер административных экранов. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Data = require('../data.js');
const Core = require('../core.js');
const UI = require('../ui.js');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function createClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    toggle(name, force) {
      if (force === true) values.add(name);
      else if (force === false) values.delete(name);
      else if (values.has(name)) values.delete(name);
      else values.add(name);
    },
    contains(name) { return values.has(name); },
  };
}

function createElement() {
  return {
    children: [],
    classList: createClassList(),
    dataset: {},
    hidden: false,
    innerHTML: '',
    style: { setProperty() {} },
    scrollTop: 0,
    textContent: '',
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    removeAttribute() {},
    setAttribute() {},
    scrollTo() {},
  };
}

function loadApp(initialStorage = {}, api = null) {
  const elements = new Map([
    ['#screen', createElement()],
    ['#app', createElement()],
    ['#bottom-nav', createElement()],
    ['#cart-badge', createElement()],
    ['#toast', createElement()],
    ['#modal-root', createElement()],
  ]);
  const storage = new Map([
    ['fashion-store-offer-seen-v1', 'seen'],
    ...Object.entries(initialStorage),
  ]);
  const document = {
    documentElement: createElement(),
    querySelector(selector) { return elements.get(selector) || null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const window = {
    FashionStoreData: Data,
    FashionStoreCore: Core,
    FashionStoreUI: UI,
    FashionStoreApi: api,
    HTMLImageElement: class HTMLImageElement {},
    document,
    innerHeight: 800,
    innerWidth: 375,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    addEventListener() {},
    clearTimeout() {},
    setTimeout(callback) { callback(); return 1; },
  };
  vm.runInNewContext(appSource, {
    window,
    document,
    FormData: class FormData {},
    FileReader: class FileReader {},
    HTMLImageElement: window.HTMLImageElement,
    Intl,
    Map,
    Set,
  }, { filename: 'app.js' });
  window.FashionStoreApp.init();
  return { app: window.FashionStoreApp, screen: elements.get('#screen'), storage };
}

test('админ-панель не меняет ширину при изменении visualViewport от фокуса', () => {
  assert.doesNotMatch(appSource, /window\.visualViewport\?\.width/);
  assert.doesNotMatch(appSource, /window\.visualViewport\?\.addEventListener\('resize', applyViewportLayout\)/);
  assert.doesNotMatch(appSource, /tg\?\.onEvent\?\.\('viewportChanged', applyViewportLayout\)/);
  assert.doesNotMatch(appSource, /window\.addEventListener\('resize', applyViewportLayout\)/);
  assert.match(appSource, /tg\?\.onEvent\?\.\('viewportChanged', applyViewportHeight\)/);
});

test('Mini App запрещает автоматическое увеличение страницы в мобильном WebView', () => {
  assert.match(indexSource, /maximum-scale=1/);
  assert.match(indexSource, /user-scalable=no/);
});

test('новая версия один раз очищает только утверждённые локальные демо-ключи', () => {
  const { storage } = loadApp({
    'fashion-store-cart-v1': '[{"key":"demo"}]',
    'fashion-store-order-v1': '{"id":"FS-1"}',
    'fashion-store-admin-products-v1': '[{"id":"dress-air"}]',
  });

  assert.equal(storage.get('fashion-store-cart-v1'), undefined);
  assert.equal(storage.get('fashion-store-order-v1'), undefined);
  assert.equal(storage.get('fashion-store-admin-products-v1'), undefined);
  assert.equal(storage.get('fashion-store-preorder-reset-v1'), '1');
});

test('главная использует утверждённый текст и четыре условия предзаказа', () => {
  const { screen } = loadApp();

  assert.match(screen.innerHTML, /Трендовые модели без лишних наценок/);
  assert.match(screen.innerHTML, /Стиль, который не требует переплаты/);
  assert.match(screen.innerHTML, /Полная оплата при оформлении предзаказа/);
  assert.match(screen.innerHTML, /Цена указана с учётом доставки до Элисты/);
  assert.match(screen.innerHTML, /preorder-terms--compact/);
  assert.doesNotMatch(screen.innerHTML, /preorder-terms card/);
});

test('пустой каталог объясняет, что ассортимент скоро появится', () => {
  const { app, screen } = loadApp();

  app.navigate('catalog');
  assert.match(screen.innerHTML, /Ассортимент скоро появится/);
});

test('приложение загружает покупательский каталог через API-клиент', async () => {
  const remoteProduct = {
    id: 'remote-dress',
    name: 'Удалённое платье',
    price: 4990,
    category: 'all',
    images: ['https://cdn.example/dress.webp'],
    colors: [{ id: 'black', name: 'Чёрный', hex: '#242424' }],
    sizes: ['S'],
    variants: [{ colorId: 'black', size: 'S', stock: 2, enabled: true }],
    adminStatus: 'published',
  };
  const { app, screen } = loadApp({}, {
    createApiClient() {
      return { getCatalog: async () => [remoteProduct] };
    },
  });

  await app.loadRemoteCatalog();
  app.navigate('catalog');

  assert.match(screen.innerHTML, /Удалённое платье/);
});

test('административные экраны рендерятся из реального app.js без runtime-ошибки', () => {
  const { app, screen } = loadApp();

  app.navigate('seller-access');
  assert.match(screen.innerHTML, /Войти через Telegram/);
  assert.doesNotMatch(screen.innerHTML, /Открыть демо-панель/);

  app.navigate('seller-products');
  assert.match(screen.innerHTML, /Добавить товар/);
  assert.doesNotMatch(screen.innerHTML, /Платье Воздух/);

  app.navigate('seller-product-edit');
  assert.doesNotMatch(screen.innerHTML, /Шаг 1 из 4/);
  assert.match(screen.innerHTML, /Основная информация/);
  assert.match(screen.innerHTML, /Описание товара/);
  assert.match(screen.innerHTML, /Остатки по вариантам/);
  assert.match(screen.innerHTML, /name="description"/);
  assert.match(screen.innerHTML, /data-admin-color-index="0"/);
  assert.match(screen.innerHTML, /Цвет \/ синонимы/);
  assert.match(screen.innerHTML, /Размеры этого цвета/);
  assert.doesNotMatch(screen.innerHTML, /name="adminColors"/);
  assert.doesNotMatch(screen.innerHTML, /name="adminSizes"/);
  assert.match(screen.innerHTML, /data-action="add-admin-variant"/);
  assert.match(screen.innerHTML, /name="categoryNew"/);
  assert.match(screen.innerHTML, /name="supplier"/);
  assert.doesNotMatch(screen.innerHTML, /Применить цвета и размеры/);
  assert.match(screen.innerHTML, />Сохранить</);
  assert.doesNotMatch(screen.innerHTML, /data-action="toggle-admin-color"/);
  assert.doesNotMatch(screen.innerHTML, /data-action="toggle-admin-size"/);
  assert.doesNotMatch(screen.innerHTML, /name="composition"/);
  assert.doesNotMatch(screen.innerHTML, /name="fit"/);
  assert.doesNotMatch(screen.innerHTML, /name="care"/);
});

test('остаток одной единицы показывается покупателю простым текстом', async () => {
  const product = {
    id: 'single-item', name: 'Платье', category: 'all', price: 4990, oldPrice: null,
    images: ['assets/preorder-hero.png'], colors: [{ id: 'black', name: 'Чёрный', hex: '#242424' }],
    variants: [{ colorId: 'black', size: 'S', stock: 1 }], adminStatus: 'published',
    description: '', composition: '', care: '', fit: '', model: '', measurements: {},
  };
  const { app, screen } = loadApp({}, {
    createApiClient() {
      return { getCatalog: async () => [product] };
    },
  });

  await app.loadRemoteCatalog();
  app.navigate('product', { productId: 'single-item' });
  assert.match(screen.innerHTML, /data-action="select-color"/);
  assert.match(screen.innerHTML, /data-action="select-size"/);
  assert.doesNotMatch(screen.innerHTML, /Осталась 1 шт\./);

  app.selectColor('black');
  app.selectSize('S');
  assert.match(screen.innerHTML, /Осталась 1 шт\./);
  assert.doesNotMatch(screen.innerHTML, /<span class="badge">Осталась 1 шт/);
});
