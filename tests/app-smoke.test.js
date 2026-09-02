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

test('страница запрашивает новую версию стилей и редактора после мобильной правки', () => {
  assert.match(indexSource, /data\.js\?v=20260902-fashion-style-1/);
  assert.match(indexSource, /styles\.css\?v=20260902-admin-stability-6/);
  assert.match(indexSource, /app\.js\?v=20260902-admin-delete-1/);
});

test('заказ не показывает битую картинку, если у позиции нет сохранённого изображения', () => {
  assert.match(appSource, /assets\/preorder-hero-bags\.png/);
  assert.match(appSource, /order-item-image/);
  assert.match(appSource, /function getOrderItemImage\(item\)/);
  assert.match(appSource, /getProduct\(item\?\.productId\)\?\.images\?\.\[0\]/);
});

test('каталог покупателя не заменяется списком товаров админки перед показом фото заказа', () => {
  assert.match(appSource, /catalogProducts: \[\],/);
  assert.match(appSource, /Core\.getPublishedProducts\(state\.catalogProducts\)/);
  assert.match(appSource, /state\.catalogProducts = Core\.createAdminCatalog\(products\);/);
});

test('корзина и заказ используют актуальное первое фото товара поверх старого localStorage', () => {
  assert.match(appSource, /function getProductImage\(item\)/);
  assert.match(appSource, /getProduct\(item\?\.productId\)\?\.images\?\.\[0\]/);
  assert.match(appSource, /src="\$\{escapeHtml\(getProductImage\(item\)\)\}"/);
});

test('карточка товара содержит горизонтальную галерею всех фотографий', () => {
  assert.match(appSource, /product-gallery__track/);
  assert.match(appSource, /product\.images\.map/);
  assert.match(appSource, /gallery-dot/);
});

test('добавление размера определяет цвет из текущей карточки, даже до blur поля', () => {
  assert.match(appSource, /data-admin-color-name/);
  assert.match(appSource, /querySelector\('\[data-admin-color-name\]'\)/);
});

test('фокус полей админки принудительно сбрасывает горизонтальный scroll offset', () => {
  assert.match(appSource, /addEventListener\('focusin'/);
  assert.match(appSource, /scrollLeft\s*=\s*0/);
});

test('список заказов показывает превью первого товара', () => {
  assert.match(appSource, /seller-order-card[\s\S]*order-item-image/);
});

test('тестовый заказ имеет отдельный статус и не называется оплаченным', () => {
  assert.match(appSource, /order\.orderType === 'server' && order\.status === 'demo'/);
  assert.match(appSource, /Тестовый заказ создан/);
  assert.match(appSource, /order\.status === 'paid'/);
});

test('checkout отправляет весь снимок корзины и очищает её только после ответа сервера', () => {
  assert.match(appSource, /items: state\.cart/);
  assert.match(appSource, /const serverOrder = await apiClient\.createOrder/);
  assert.match(appSource, /const serverOrder = await apiClient\.createOrder[\s\S]*state\.order = serverOrder;[\s\S]*state\.cart = \[\];/);
  assert.match(appSource, /state\.order = serverOrder;[\s\S]*navigate\('payment-success'\)/);
  assert.match(appSource, /review-items">\$\{orderItems\(state\.order\)\}/);
});

test('ошибка checkout сохраняет корзину и не создаёт ложный локальный заказ', () => {
  assert.match(appSource, /catch \(_error\) \{[\s\S]*state\.cart/);
  assert.doesNotMatch(appSource, /catch \(_error\) \{[\s\S]*Core\.createDemoOrder/);
  assert.doesNotMatch(appSource, /Сервер недоступен: сохранён только черновик/);
  assert.match(appSource, /Не удалось создать заказ\. Проверь интернет и попробуй ещё раз/);
});

test('buyer UI использует понятный текст без лишних демо и технических слов', () => {
  assert.match(appSource, /Подтвердить тестовый заказ \$\{money\(summary\.total\)\}/);
  assert.match(appSource, /Подтвердить тестовый заказ\?/);
  assert.match(appSource, /<p>Деньги не списываются<\/p>/);
  assert.doesNotMatch(appSource, /Демо-оплата|Подтвердить демо-оплату|Демонстрационный контакт|Демонстрационные условия|Итог с сервера|загружаются с сервера/);
});

test('тестовый заказ не отображается в оплаченной очереди продавца', () => {
  assert.match(appSource, /order\.status === 'paid'/);
  assert.doesNotMatch(appSource, /order\.status === 'demo'[^\n]*seller/);
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

test('главная использует утверждённый текст и пять условий заказа', () => {
  const { screen } = loadApp();

  assert.match(screen.innerHTML, /Fashion Style/);
  assert.match(screen.innerHTML, /Трендовая одежда для стильных образов без лишних наценок/);
  assert.match(screen.innerHTML, /Выбирайте в каталоге и оформляйте заказ прямо в Telegram/);
  assert.match(screen.innerHTML, /Полная оплата при оформлении заказа/);
  assert.match(screen.innerHTML, /Заказ можно оформить только в период действующего закупа/);
  assert.match(screen.innerHTML, /Срок поступления: 7–10 дней/);
  assert.match(screen.innerHTML, /Самовывоз в Элисте/);
  assert.match(screen.innerHTML, /Цены указаны с учётом доставки до Элисты/);
  assert.doesNotMatch(screen.innerHTML, /<p class="eyebrow">Fashion Store<\/p>/);
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

test('покупатель видит полностью распроданный опубликованный товар явно недоступным', async () => {
  const remoteProduct = {
    id: 'sold-out-dress',
    name: 'Распроданное платье',
    price: 4990,
    category: 'all',
    sellerSku: 'SECRET-SKU',
    wholesalePrice: 1200,
    supplier: 'Закрытый поставщик',
    images: ['https://cdn.example/sold-out.webp'],
    colors: [{ id: 'black', name: 'Чёрный', hex: '#242424' }],
    sizes: ['S'],
    variants: [{ colorId: 'black', size: 'S', stock: 0, enabled: true }],
    adminStatus: 'published',
  };
  const { app, screen } = loadApp({}, {
    createApiClient() {
      return { getCatalog: async () => [remoteProduct] };
    },
  });

  await app.loadRemoteCatalog();
  app.navigate('catalog');
  assert.match(screen.innerHTML, /Распроданное платье/);
  assert.match(screen.innerHTML, /Нет в наличии/);
  assert.doesNotMatch(screen.innerHTML, /SECRET-SKU|Закрытый поставщик|1200/);

  app.navigate('product', { productId: 'sold-out-dress' });
  assert.doesNotMatch(screen.innerHTML, /SECRET-SKU|Закрытый поставщик|1200/);
  assert.match(screen.innerHTML, /preorder-hero-bags\.png|sold-out\.webp/);
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
  assert.match(screen.innerHTML, /Цвет и размеры/);
  assert.ok(screen.innerHTML.indexOf('Цвет и размеры') < screen.innerHTML.indexOf('Описание товара'));
  assert.match(screen.innerHTML, /name="description"/);
  assert.match(screen.innerHTML, /data-admin-color-index="0"/);
  assert.match(screen.innerHTML, /<span>Цвет<\/span>/);
  assert.doesNotMatch(screen.innerHTML, /синонимы/);
  assert.match(screen.innerHTML, /<span>Размер<\/span>/);
  assert.doesNotMatch(screen.innerHTML, /Размеры этого цвета/);
  assert.doesNotMatch(screen.innerHTML, /Разделяй размеры запятыми/);
  assert.match(screen.innerHTML, /data-admin-size-name/);
  assert.match(screen.innerHTML, /data-action="add-admin-size"/);
  assert.match(screen.innerHTML, /data-action="remove-admin-size"/);
  assert.match(screen.innerHTML, /Добавить размер/);
  assert.doesNotMatch(screen.innerHTML, /name="adminColors"/);
  assert.doesNotMatch(screen.innerHTML, /name="adminSizes"/);
  assert.match(screen.innerHTML, /data-action="add-admin-product-option"/);
  assert.match(screen.innerHTML, /Добавить новый вариант/);
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
  assert.match(screen.innerHTML, /data-action="select-product-option"/);
  assert.match(screen.innerHTML, /data-action="select-size"/);
  assert.doesNotMatch(screen.innerHTML, /Осталась 1 шт\./);

  app.selectColor('black');
  app.selectSize('S');
  assert.match(screen.innerHTML, /Осталась 1 шт\./);
  assert.doesNotMatch(screen.innerHTML, /<span class="badge">Осталась 1 шт/);
});

test('переключение цвета в склейке меняет данные без выхода из карточки', async () => {
  const products = [
    {
      id: 'black-dress', groupId: 'dress-group', name: 'Платье чёрное', category: 'all', price: 4990,
      images: ['black.webp'], colors: [{ id: 'black', name: 'Чёрный' }], variants: [{ colorId: 'black', size: 'S', stock: 1 }], adminStatus: 'published', description: 'Чёрное',
    },
    {
      id: 'milk-dress', groupId: 'dress-group', name: 'Платье молочное', category: 'all', price: 5490,
      images: ['milk.webp'], colors: [{ id: 'milk', name: 'Молочный' }], variants: [{ colorId: 'milk', size: 'M', stock: 2 }], adminStatus: 'published', description: 'Молочное',
    },
  ];
  const { app, screen } = loadApp({}, { createApiClient() { return { getCatalog: async () => products }; } });

  await app.loadRemoteCatalog();
  app.navigate('product', { productId: 'black-dress' });
  assert.match(screen.innerHTML, /Чёрный/);
  assert.match(screen.innerHTML, /Молочный/);
  app.selectProductOption('milk-dress');
  assert.match(screen.innerHTML, /Платье молочное/);
  assert.match(screen.innerHTML, /5 490 ₽/);
});

test('после публикации продавцом покупательский каталог обновляется до уведомления', () => {
  const saveSource = appSource.match(/async function saveAdminProduct\(status\) \{[\s\S]*?\n  \}\n\n  const actions/);

  assert.ok(saveSource, 'не найден полный обработчик сохранения товара');
  assert.match(saveSource[0], /status === 'published'[\s\S]*?await loadRemoteCatalog\(\)/);
  assert.match(saveSource[0], /await loadRemoteCatalog\(\)[\s\S]*?showToast\(status === 'published'/);
});

test('после изменения остатка продавцом запускается повторная загрузка buyer-каталога', () => {
  const stockSource = appSource.match(/async function persistAdminVariantStock\(control\) \{[\s\S]*?\n  \}\n\n  function readImageFile/);

  assert.ok(stockSource, 'не найден обработчик сохранения остатка');
  assert.match(stockSource[0], /await apiClient\.updateAdminStock/);
  assert.match(stockSource[0], /await loadRemoteCatalog\(\)/);
});

test('после архивации продавцом buyer-каталог загружается заново', () => {
  const archiveSource = appSource.match(/async function archiveAdminProduct\(productId\) \{[\s\S]*?\n  \}\n\n  function duplicateProduct/);

  assert.ok(archiveSource, 'не найден обработчик архивации товара');
  assert.match(archiveSource[0], /await apiClient\.archiveAdminProduct/);
  assert.match(archiveSource[0], /await loadRemoteCatalog\(\)/);
});

test('ошибка buyer-refresh сохраняет последний корректный каталог', async () => {
  let shouldFail = false;
  const product = {
    id: 'stable-product', name: 'Стабильное платье', category: 'all', price: 4990,
    images: ['stable.webp'], colors: [{ id: 'black', name: 'Чёрный' }],
    variants: [{ colorId: 'black', size: 'S', stock: 2 }], adminStatus: 'published',
  };
  const { app, screen } = loadApp({}, {
    createApiClient() {
      return { getCatalog: async () => {
        if (shouldFail) throw new Error('Сбой сети');
        return [product];
      } };
    },
  });

  await app.loadRemoteCatalog();
  shouldFail = true;
  assert.equal(await app.loadRemoteCatalog(), false);
  app.navigate('catalog');
  assert.match(screen.innerHTML, /Стабильное платье/);
});

test('buyer-рендер не показывает черновик после обновления каталога', async () => {
  const { app, screen } = loadApp({}, {
    createApiClient() {
      return { getCatalog: async () => [
        { id: 'published', name: 'Опубликовано', category: 'all', price: 1, images: [], colors: [], variants: [], adminStatus: 'published' },
        { id: 'draft', name: 'Черновик', category: 'all', price: 1, images: [], colors: [], variants: [], adminStatus: 'draft' },
      ] };
    },
  });

  await app.loadRemoteCatalog();
  app.navigate('catalog');
  assert.match(screen.innerHTML, /Опубликовано/);
  assert.doesNotMatch(screen.innerHTML, /Черновик/);
});

test('сохранение товара блокирует повторный submit до завершения запроса', () => {
  const saveSource = appSource.match(/async function saveAdminProduct\(status\) \{[\s\S]*?\n  \}/);

  assert.ok(saveSource, 'не найден обработчик сохранения товара');
  assert.match(saveSource[0], /if \(state\.isSubmitting\) return;/);
  assert.match(saveSource[0], /state\.isSubmitting = true;/);
});

test('редактор показывает удаление только сохранённого варианта с подтверждением', () => {
  assert.match(appSource, /data-action="delete-admin-product"/);
  assert.match(appSource, /Удалить этот вариант/);
  assert.match(appSource, /data-action="confirm-delete-admin-product"/);
  assert.match(appSource, /apiClient\.deleteAdminProduct/);
  assert.match(appSource, /deletedProductId/);
});

test('seller-очередь не читает локальный order и меняет ready только ответом API', () => {
  assert.match(appSource, /sellerOrders: \[\],/);
  assert.match(appSource, /apiClient\.listSellerOrders/);
  assert.match(appSource, /apiClient\.getSellerOrder/);
  assert.match(appSource, /apiClient\.markOrderReady/);
  assert.match(appSource, /state\.sellerOrder\.id/);
  assert.doesNotMatch(appSource, /function confirmOrderReady\(\)[\s\S]*Core\.markOrderReady/);
  assert.match(appSource, /state\.order = updatedOrder/);
});

test('buyer обновляет серверный статус заказа при открытии и сохраняет старый при ошибке', () => {
  assert.match(appSource, /async function openBuyerOrder\(\)/);
  assert.match(appSource, /apiClient\.getBuyerOrder/);
  assert.match(appSource, /Последний корректный серверный заказ остаётся/);
  assert.match(appSource, /'open-order': \(\) => void openBuyerOrder\(\)/);
});
