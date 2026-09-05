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
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
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
    replaceChildren() { this.children = []; this.innerHTML = ''; },
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
  const eventHandlers = new Map();
  const document = {
    documentElement: createElement(),
    querySelector(selector) { return elements.get(selector) || null; },
    querySelectorAll() { return []; },
    addEventListener(type, handler) { eventHandlers.set(type, handler); },
    dispatch(type, event) { eventHandlers.get(type)?.(event); },
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
  return {
    app: window.FashionStoreApp,
    screen: elements.get('#screen'),
    modal: elements.get('#modal-root'),
    storage,
    document,
  };
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

test('страница запрашивает свежие версии buyer-данных, каталога и редактора', () => {
  assert.match(indexSource, /data\.js\?v=20260905-buyer-catalog-info-1/);
  assert.match(indexSource, /styles\.css\?v=20260905-buyer-catalog-controls-1/);
  assert.match(indexSource, /admin-draft-store\.js\?v=20260904-admin-save-1/);
  assert.match(indexSource, /api\.js\?v=20260904-admin-save-2/);
  assert.match(indexSource, /core\.js\?v=20260905-seller-photo-save-2/);
  assert.match(indexSource, /app\.js\?v=20260905-seller-photo-save-2/);
});

test('кнопка добавления товара всегда начинает пустую карточку, не восстанавливая прошлый черновик', () => {
  const draftStart = appSource.match(/function startAdminDraft\(product = null, \{ restoreLocalDraft = false \} = \{\}\) \{([\s\S]*?)\n  \}/);
  assert.ok(draftStart, 'не найден старт редактора товара');
  assert.match(draftStart[1], /const restored = restoreLocalDraft && !product \? readAdminDraft\(\) : null;/);
  assert.match(appSource, /'add-admin-product': \(\) => startAdminDraft\(null, \{ restoreLocalDraft: false \}\)/);
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

test('выход из редактора не показывает предупреждение и не очищает draft', () => {
  assert.doesNotMatch(appSource, /Изменения этого товара будут потеряны/);
  const back = appSource.match(/function adminEditorBack\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(back);
  assert.doesNotMatch(back[1], /openSheet|clearAdminDraft/);
});

test('новый цветовой вариант не требует предварительного server ID', () => {
  assert.doesNotMatch(appSource, /Сначала сохрани первый вариант как черновик/);
  assert.doesNotMatch(appSource, /if \(!\/\^\\d\+\$\/.test\(String\(source\.id\)\)\)/);
});

test('сохранение draft не запускает обязательную проверку публикации', () => {
  assert.match(appSource, /if \(status === 'published'\) \{[\s\S]*?validateAdminProduct/);
  assert.match(appSource, /adminStatus: 'draft'/);
  assert.match(appSource, /Черновик сохранён\. Исправь ошибки перед публикацией/);
  assert.match(appSource, /for \(let index = 0; index < state\.adminDraft\.images\.length; index \+= 1\)/);
});

test('фокус полей админки принудительно сбрасывает горизонтальный scroll offset', () => {
  assert.match(appSource, /addEventListener\('focusin'/);
  assert.match(appSource, /scrollLeft\s*=\s*0/);
});

test('список заказов показывает превью первого товара', () => {
  assert.match(appSource, /seller-order-card[\s\S]*order-item-image/);
});

test('созданный заказ не называется оплаченным до подтверждения', () => {
  assert.match(appSource, /order\.orderType === 'server' && order\.status === 'demo'/);
  assert.match(appSource, /Заказ создан/);
  assert.match(appSource, /order\.status === 'paid'/);
});

test('checkout создаёт локальную демо-оплату из полного снимка корзины', () => {
  assert.match(appSource, /items: state\.cart\.map/);
  assert.match(appSource, /const demoOrder = createLocalDemoOrder\(\)/);
  assert.match(appSource, /const demoOrder = createLocalDemoOrder\(\)[\s\S]*state\.demoOrders = \[demoOrder/);
  assert.match(appSource, /state\.demoOrders = \[demoOrder[\s\S]*state\.cart = \[\];/);
  assert.match(appSource, /state\.lastCheckoutOrder = demoOrder[\s\S]*navigate\('payment-success'\)/);
  assert.match(appSource, /review-items">\$\{orderItems\(order\)\}/);
});

test('позиция корзины сохраняет variantId для серверного заказа', () => {
  assert.match(appSource, /variantId: variant\.id/);
});

test('старый локальный черновик заказа удаляется и не блокирует новый checkout', () => {
  const { storage } = loadApp({
    'fashion-store-preorder-reset-v1': '1',
    'fashion-store-order-v1': JSON.stringify({
      id: 'FS-323345',
      status: 'draft',
      items: [{ name: 'Старый товар' }],
    }),
  });

  assert.equal(storage.get('fashion-store-order-v1'), undefined);
});

test('экран заказов хранит несколько подтверждённых заказов, а не один текущий', () => {
  const orders = [
    {
      id: 'order-new', orderType: 'server', status: 'demo', total: 7800,
      delivery: { id: 'pickup', title: 'Самовывоз в Элисте' },
      items: [{ name: 'Костюм чёрный', colorName: 'Чёрный', size: '42-46', quantity: 1, price: 2600 }],
    },
    {
      id: 'order-old', orderType: 'server', status: 'demo', total: 5200,
      delivery: { id: 'pickup', title: 'Самовывоз в Элисте' },
      items: [{ name: 'Костюм коричневый', colorName: 'Коричневый', size: '42-46', quantity: 2, price: 2600 }],
    },
  ];
  const { app, screen } = loadApp({
    'fashion-store-preorder-reset-v1': '1',
    'fashion-store-orders-v2': JSON.stringify(orders),
  });

  app.navigate('orders');

  assert.match(screen.innerHTML, /Заказ order-new/);
  assert.match(screen.innerHTML, /Заказ order-old/);
  assert.doesNotMatch(screen.innerHTML, /Текущий заказ/);
});

test('оформление не блокируется старым заказом и не показывает текст про один заказ', () => {
  assert.doesNotMatch(appSource, /В прототипе доступен один текущий заказ/);
  assert.match(appSource, /orders: \[\],/);
  assert.match(appSource, /state\.demoOrders = \[demoOrder, \.\.\.state\.demoOrders/);
});

test('каталог ждёт предзагрузку фото и не откладывает запрос на 300 мс', () => {
  assert.match(appSource, /function preloadCatalogImages\(products\)/);
  assert.match(appSource, /await preloadCatalogImages\(state\.catalogProducts\)/);
  assert.doesNotMatch(appSource, /window\.setTimeout\(\(\) => \{[\s\S]*void loadRemoteCatalog\(\);[\s\S]*\}, 300\)/);
});

test('фотографии карточек каталога загружаются сразу', () => {
  assert.doesNotMatch(appSource, /<img src="\$\{escapeHtml\(image\)\}" alt="\$\{escapeHtml\(product\.name\)\}" loading="lazy">/);
  assert.match(appSource, /fetchpriority="high"/);
});

test('в корзине нет лишнего текста о закреплении товара и резерве', () => {
  assert.doesNotMatch(appSource, /Товары закрепятся за вами/);
  assert.doesNotMatch(appSource, /Корзина не является резервом/);
});

test('ошибка checkout сохраняет корзину и не создаёт ложный локальный заказ', () => {
  assert.match(appSource, /catch \(_error\) \{[\s\S]*state\.cart/);
  assert.doesNotMatch(appSource, /catch \(_error\) \{[\s\S]*Core\.createDemoOrder/);
  assert.doesNotMatch(appSource, /Сервер недоступен: сохранён только черновик/);
  assert.match(appSource, /Не удалось создать заказ\. Проверь интернет и попробуй ещё раз/);
});

test('checkout объясняет, если серверная функция оформления ещё не подключена', () => {
  assert.match(appSource, /status === 404 \|\| error\?\.code === 'NOT_FOUND'/);
  assert.match(appSource, /Сервис оформления заказа пока не подключён/);
});

test('checkout delivery использует короткий адрес самовывоза и не показывает предварительную информацию', () => {
  assert.equal(Data.DELIVERY_METHODS[0].description, 'Адрес самовывоза сообщим позже.');
  assert.doesNotMatch(appSource, /Адрес, стоимость и сроки указаны предварительно/);
});

test('проверка заказа не позволяет редактировать контакты и получение на этом шаге', () => {
  const reviewSource = appSource.match(/function renderCheckoutReview\(\) \{[\s\S]*?\n  \}\n\n  function renderPaymentSuccess/);
  assert.ok(reviewSource, 'не найден экран проверки заказа');
  assert.doesNotMatch(reviewSource[0], /data-action="edit-contact"/);
  assert.doesNotMatch(reviewSource[0], /data-action="edit-delivery"/);
  assert.doesNotMatch(appSource, /Мы получим состав заказа и свяжемся с вами для подтверждения/);
});

test('buyer UI использует понятный текст без лишних демо и технических слов', () => {
  assert.match(appSource, /Оформить заказ \$\{money\(payableTotal\)\}/);
  assert.match(appSource, /Оформить заказ\?/);
  const buyerSource = appSource.match(/function renderPaymentSuccess\(\) \{[\s\S]*?\n  \}\n\n  function orderItems/);
  assert.ok(buyerSource, 'не найден экран успешного оформления');
  assert.doesNotMatch(buyerSource[0], /Демо-оплата|Подтвердить демо-оплату|Демонстрационные условия|Итог с сервера/);
});

test('тестовый заказ не отображается в оплаченной очереди продавца', () => {
  assert.match(appSource, /demoPayment: true/);
  assert.match(appSource, /demoOrders/);
  assert.doesNotMatch(appSource, /state\.orders = \[demoOrder/);
});

test('демо-оплата не обращается к order-api и сохраняет заказ отдельно', () => {
  const paymentSource = appSource.match(/async function submitDemoPayment\(\) \{[\s\S]*?\n  \}\n\n  function enterSellerMode/);
  assert.ok(paymentSource, 'не найден обработчик демо-оплаты');
  assert.doesNotMatch(paymentSource[0], /apiClient\.createOrder/);
  assert.match(paymentSource[0], /createLocalDemoOrder/);
  assert.match(paymentSource[0], /saveDemoOrders/);
  assert.match(appSource, /const DEMO_ORDERS_KEY = 'fashion-store-demo-orders-v1'/);
});

test('локальный демо-заказ отображается в админской очереди и содержит пометку', () => {
  const demoOrder = {
    id: 'DEMO-1', orderType: 'demo', demoPayment: true, status: 'paid', total: 2600,
    createdAt: '2026-09-03T10:00:00.000Z', customer: { name: 'Гиляна', phone: '+79999999999' },
    delivery: { id: 'pickup', title: 'Самовывоз в Элисте', description: 'Адрес самовывоза сообщим позже.', price: 0 },
    items: [{ name: 'Костюм двойка', colorName: 'Чёрный', size: '42-46', quantity: 1, price: 2600 }],
  };
  const { app, screen } = loadApp({
    'fashion-store-preorder-reset-v1': '1',
    'fashion-store-demo-orders-v1': JSON.stringify([demoOrder]),
  });

  app.navigate('seller-orders');

  assert.match(screen.innerHTML, /DEMO-1/);
  assert.match(screen.innerHTML, /Демо-оплата/);
  assert.match(screen.innerHTML, /Костюм двойка/);
});

test('демо-заказ не попадает в покупательский список заказов', () => {
  const demoOrder = { id: 'DEMO-2', orderType: 'demo', demoPayment: true, status: 'paid', total: 100, items: [] };
  const { app, screen } = loadApp({
    'fashion-store-preorder-reset-v1': '1',
    'fashion-store-demo-orders-v1': JSON.stringify([demoOrder]),
  });

  app.navigate('orders');

  assert.doesNotMatch(screen.innerHTML, /DEMO-2/);
  assert.match(screen.innerHTML, /Заказов пока нет/);
});

test('для демо-заказа сборка меняет статус локально без API', () => {
  assert.match(appSource, /if \(state\.sellerOrder\.demoPayment\)/);
  assert.match(appSource, /saveDemoOrders\(\)/);
  assert.doesNotMatch(appSource, /demoPayment[\s\S]{0,300}apiClient\.markOrderReady/);
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

  assert.match(screen.innerHTML, /🛍 Выгодные покупки/);
  assert.match(screen.innerHTML, /Трендовая одежда для стильных образов без лишних наценок/);
  assert.match(screen.innerHTML, /Выгодные покупки и закупки женской одежды по приятным ценам с доставкой до Элисты/);
  assert.match(screen.innerHTML, /Полная оплата при оформлении заказа/);
  assert.match(screen.innerHTML, /Заказ можно оформить только в период действующего закупа/);
  assert.match(screen.innerHTML, /Срок поступления: 7–10 дней/);
  assert.match(screen.innerHTML, /Самовывоз в Элисте/);
  assert.match(screen.innerHTML, /Цены указаны с учётом доставки до Элисты/);
  assert.doesNotMatch(screen.innerHTML, /Fashion Style|Фэшн стор/);
  assert.doesNotMatch(screen.innerHTML, /<p class="eyebrow">Fashion Store<\/p>/);
  assert.match(screen.innerHTML, /preorder-terms--compact/);
  assert.doesNotMatch(screen.innerHTML, /preorder-terms card/);
});

test('пустой каталог объясняет, что ассортимент скоро появится', () => {
  const { app, screen } = loadApp();

  app.navigate('catalog');
  assert.match(screen.innerHTML, /Ассортимент скоро появится/);
});

test('вкладка информации показывает условия покупок вместо старой страницы магазина', () => {
  const { app, screen } = loadApp();

  app.navigate('store');

  assert.match(indexSource, /data-screen="store"[\s\S]*?aria-label="Информация"[\s\S]*?<span>Информация<\/span>/);
  assert.match(screen.innerHTML, /Условия покупок/);
  assert.match(screen.innerHTML, /раз в 7–10 дней/);
  assert.match(screen.innerHTML, /минимальной наценкой/);
  assert.match(screen.innerHTML, /подарки, розыгрыши/);
  assert.doesNotMatch(screen.innerHTML, /Трендовая одежда для стильных образов/);
  assert.doesNotMatch(screen.innerHTML, /Адрес|Часы работы|Поддержка|Связаться|Оплата и возврат|Режим продавца/);
  assert.match(screen.innerHTML, /data-action="open-seller-demo"[^>]*>Войти в админ<\/button>/);
});

test('каталог показывает все, сортировку и фильтр в одной строке, а фильтр выбирает категорию', async () => {
  const { app, screen, modal, document } = loadApp({}, {
    createApiClient() {
      return {
        getCatalog: async () => [
          {
            id: 'catalog-dress',
            name: 'Платье',
            price: 4990,
            category: 'Платья',
            images: ['https://cdn.example/dress.webp'],
            colors: [{ id: 'black', name: 'Чёрный', hex: '#242424' }],
            variants: [{ colorId: 'black', size: 'S', stock: 2, enabled: true }],
            adminStatus: 'published',
          },
          {
            id: 'catalog-bag',
            name: 'Сумка',
            price: 5990,
            category: 'Сумки',
            images: ['https://cdn.example/bag.webp'],
            colors: [{ id: 'brown', name: 'Коричневый', hex: '#714d35' }],
            variants: [{ colorId: 'brown', size: 'One size', stock: 2, enabled: true }],
            adminStatus: 'published',
          },
        ],
      };
    },
  });

  await app.loadRemoteCatalog();

  app.navigate('catalog');

  assert.match(screen.innerHTML, /catalog-controls[\s\S]*data-action="reset-category"[\s\S]*>Все<[\s\S]*data-action="sort"[\s\S]*>Сортировка\s*<[\s\S]*data-action="filter-categories"[\s\S]*>Фильтр\s*</);

  const filterControl = {
    dataset: { action: 'filter-categories' },
    closest() { return this; },
    matches() { return false; },
  };
  document.dispatch('click', { target: filterControl });

  assert.match(modal.innerHTML, /Выберите категорию/);
  assert.match(modal.innerHTML, /Платья/);
  assert.match(modal.innerHTML, /Сумки/);

  const categoryControl = {
    dataset: { action: 'set-category', category: 'Сумки' },
    closest() { return this; },
    matches() { return false; },
  };
  document.dispatch('click', { target: categoryControl });

  assert.equal(modal.innerHTML, '');
  assert.match(screen.innerHTML, /Сумка/);
  assert.doesNotMatch(screen.innerHTML, /Платье/);
});

test('информация бережно предупреждает, что возврат и обмен не предусмотрены', () => {
  const { app, screen } = loadApp();

  app.navigate('store');

  assert.match(screen.innerHTML, /Возврат и обмен/);
  assert.match(screen.innerHTML, /товары выкупаются специально для вас/i);
  assert.match(screen.innerHTML, /возврат и обмен[^<]*не предусмотрены/i);
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

test('редактор показывает состав склейки горизонтальной лентой и открывает её карточки', async () => {
  const products = [
    { id: '101', groupId: '101', name: 'Платье миди', colors: [{ id: 'milk', name: 'Молочный' }], images: ['milk.jpg'], variants: [] },
    { id: '102', groupId: '101', name: 'Платье миди', colors: [{ id: 'black', name: 'Чёрный' }], images: ['black.jpg'], variants: [] },
    { id: '103', groupId: '101', name: 'Платье миди', colors: [{ id: 'coffee', name: 'Кофейный' }], images: ['coffee.jpg'], variants: [] },
    { id: '104', groupId: '104', name: 'Юбка миди', colors: [{ id: 'blue', name: 'Синяя' }], images: ['blue.jpg'], variants: [] },
  ];
  const api = { createApiClient: () => ({ getCatalog: async () => [], getAdminProducts: async () => products }) };
  const { screen, document } = loadApp({}, api);
  const click = (action, productId) => document.dispatch('click', {
    target: {
      closest() {
        return { dataset: { action, productId }, disabled: false, matches() { return false; } };
      },
    },
  });

  click('open-seller-demo');
  await new Promise((resolve) => setImmediate(resolve));
  click('edit-admin-product', '102');

  assert.match(screen.innerHTML, /Склейка · 3 карточки/);
  assert.match(screen.innerHTML, /admin-group-strip/);
  assert.match(screen.innerHTML, /Молочный/);
  assert.match(screen.innerHTML, /Чёрный/);
  assert.match(screen.innerHTML, /Кофейный/);

  click('open-admin-group-product', '103');
  assert.match(screen.innerHTML, /Платье миди.*Кофейный/s);

  click('edit-admin-product', '104');
  assert.match(screen.innerHTML, /Карточка не объединена/);
});

test('лента склеек остаётся в одну строку и прокручивается по горизонтали', () => {
  assert.match(stylesSource, /\.admin-group-strip\s*\{[^}]*display:\s*flex[^}]*overflow-x:\s*auto[^}]*flex-wrap:\s*nowrap/);
});

test('админка содержит защищённую вкладку пользователей и карточку без бонусной статистики', () => {
  assert.match(appSource, /data-section="users"[^>]*>Пользователи/);
  assert.match(appSource, /seller-users/);
  assert.match(appSource, /Всего пользователей/);
  assert.match(appSource, /Сегодня присоединились/);
  assert.match(appSource, /Найти пользователя/);
  assert.match(appSource, /Оформлял заказ/);
  assert.match(appSource, /Пользователей пока нет/);
  assert.match(appSource, /Карточка пользователя/);
  assert.doesNotMatch(appSource, /Получили 500 ₽/);
});

test('track-open вызывается только при наличии Telegram initData', () => {
  assert.match(appSource, /if \(tg\?\.initData && apiClient\?\.trackOpen\)/);
  assert.match(appSource, /apiClient\.trackOpen\(\)/);
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

test('доступный размер активен сразу при первом открытии карточки', async () => {
  const product = {
    id: 'available-on-open', name: 'Костюм', category: 'all', price: 2600, oldPrice: null,
    images: ['assets/preorder-hero.png'], colors: [{ id: 'black', name: 'Чёрный', hex: '#242424' }],
    variants: [
      { colorId: 'black', size: '42–46', stock: 2, enabled: true },
      { colorId: 'black', size: '48–50', stock: 0, enabled: true },
    ],
    adminStatus: 'published', description: '', composition: '', care: '', fit: '', model: '', measurements: {},
  };
  const { app, screen } = loadApp({}, {
    createApiClient() {
      return { getCatalog: async () => [product] };
    },
  });

  await app.loadRemoteCatalog();
  app.navigate('product', { productId: 'available-on-open' });

  assert.match(screen.innerHTML, /data-action="select-size" data-size="42–46"(?![^>]*disabled)[^>]*>[\s\S]*?<small>В наличии<\/small>/);
  assert.doesNotMatch(screen.innerHTML, /Выберите цвет/);
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

test('опубликованные цвета без остатка остаются видимыми', async () => {
  const products = [
    {
      id: 'black-coat', groupId: 'coat-group', name: 'Пальто чёрное', category: 'all', price: 7990,
      images: ['black-coat.webp'], colors: [{ id: 'black', name: 'Чёрный' }],
      variants: [{ id: 'black-s', colorId: 'black', size: 'S', stock: 2 }], adminStatus: 'published', description: 'Чёрное',
    },
    {
      id: 'cream-coat', groupId: 'coat-group', name: 'Пальто кремовое', category: 'all', price: 7990,
      images: ['cream-coat.webp'], colors: [{ id: 'cream', name: 'Кремовый' }],
      variants: [{ id: 'cream-s', colorId: 'cream', size: 'S', stock: 0 }], adminStatus: 'published', description: 'Кремовое',
    },
  ];
  const { app, screen } = loadApp({}, { createApiClient() { return { getCatalog: async () => products }; } });

  await app.loadRemoteCatalog();
  app.navigate('product', { productId: 'black-coat' });

  assert.match(screen.innerHTML, /Пальто чёрное/);
  assert.match(screen.innerHTML, /Кремовый/);
  assert.match(screen.innerHTML, /data-product-id="cream-coat"[^>]*aria-disabled="true"/);
  assert.doesNotMatch(screen.innerHTML, /data-product-id="cream-coat"[^>]*\sdisabled(?:=|>)/);
});

test('переключение цвета сохраняет его productId, изображение и варианты', async () => {
  const products = [
    {
      id: 'navy-set', groupId: 'set-group', name: 'Комплект синий', category: 'all', price: 5000,
      images: ['navy.webp'], colors: [{ id: 'navy', name: 'Синий' }],
      variants: [{ colorId: 'navy', size: 'S', stock: 1 }], adminStatus: 'published', description: 'Синий',
    },
    {
      id: 'rose-set', groupId: 'set-group', name: 'Комплект розовый', category: 'all', price: 5000,
      images: ['rose.webp'], colors: [{ id: 'rose', name: 'Розовый' }],
      variants: [{ colorId: 'rose', size: 'L', stock: 2 }], adminStatus: 'published', description: 'Розовый',
    },
  ];
  const { app, screen } = loadApp({}, { createApiClient() { return { getCatalog: async () => products }; } });

  await app.loadRemoteCatalog();
  app.navigate('product', { productId: 'navy-set' });
  app.selectProductOption('rose-set');

  assert.match(screen.innerHTML, /rose\.webp/);
  assert.match(screen.innerHTML, /data-size="L"/);
  assert.doesNotMatch(screen.innerHTML, /data-size="S"/);
});

test('опубликованный товар без положительных остатков остаётся видимым', () => {
  const products = [
    { id: 'sold-out', adminStatus: 'published', variants: [{ size: 'S', stock: 0 }] },
    { id: 'draft', adminStatus: 'draft', variants: [{ size: 'S', stock: 5 }] },
  ];

  assert.deepEqual(Core.getPublishedProducts(products).map(({ id }) => id), ['sold-out']);
});

test('один размер получает широкую ячейку, а несколько размеров и цвета используют три колонки', async () => {
  const product = {
    id: 'grid-product', name: 'Сетка', category: 'all', price: 1000,
    images: ['grid.webp'], colors: [{ id: 'black', name: 'Чёрный' }],
    variants: [
      { colorId: 'black', size: 'S', stock: 2 },
      { colorId: 'black', size: 'M', stock: 1 },
    ], adminStatus: 'published', description: '',
  };
  const { app, screen } = loadApp({}, { createApiClient() { return { getCatalog: async () => [product] }; } });
  await app.loadRemoteCatalog();
  app.navigate('product', { productId: 'grid-product' });
  assert.match(screen.innerHTML, /choice-grid choice-grid--sizes choice-grid--compact/);
  assert.match(appSource, /sizes\.length === 1 \? 'choice-grid--single'/);
  assert.match(stylesSource, /\.choice-grid--single \.size-button\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(stylesSource, /\.choice-grid--compact\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(stylesSource, /\.choice-grid--colors\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(stylesSource, /\.screen--product\s*\{[^}]*padding-bottom/);
});

test('карточка товара использует компактные заголовок и блок выбора', () => {
  assert.match(stylesSource, /\.product-card__body strong\s*\{[^}]*font-size:\s*13px/);
  assert.match(stylesSource, /\.product-info h1\s*\{[^}]*font-size:\s*clamp\(28px, 7\.5vw, 36px\)/);
  assert.match(stylesSource, /\.product-info\s*\{[^}]*padding-top:\s*12px/);
  assert.match(stylesSource, /\.choice-section\s*\{[^}]*padding:\s*12px 0/);
});

test('checkout показывает компактный состав заказа с раскрытием и удалением позиции', () => {
  assert.match(appSource, /<details class="checkout-items-disclosure"/);
  assert.match(appSource, /<summary[^>]*data-checkout-items-toggle/);
  assert.match(appSource, /data-action="cart-remove" data-key="\$\{item\.key\}"/);
  assert.match(appSource, /checkout-items-disclosure__arrow/);
  assert.match(stylesSource, /\.checkout-items-disclosure\s*\{[^}]*overflow:\s*hidden/);
  assert.match(stylesSource, /\.checkout-items-disclosure__arrow/);
});

test('checkout показывает правильное количество товаров в сворачиваемой строке', () => {
  const cart = [
    { key: 'dress:black:S', productId: 'dress', name: 'Платье', image: 'dress.webp', colorName: 'Чёрный', size: 'S', price: 2600, quantity: 1 },
    { key: 'coat:milk:M', productId: 'coat', name: 'Пальто', image: 'coat.webp', colorName: 'Молочный', size: 'M', price: 4000, quantity: 2 },
  ];
  const { app, screen } = loadApp({
    'fashion-store-preorder-reset-v1': '1',
    'fashion-store-cart-v1': JSON.stringify(cart),
  });

  app.navigate('checkout-contact');

  assert.match(screen.innerHTML, /<details class="checkout-items-disclosure">/);
  assert.match(screen.innerHTML, />3 товара</);
  assert.match(screen.innerHTML, /Платье/);
  assert.match(screen.innerHTML, /Пальто/);
  assert.match(screen.innerHTML, /data-action="cart-remove" data-key="dress:black:S"/);
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

test('меню товара не содержит архив и предпросмотр, а список поддерживает безопасные склейки', () => {
  const menuSource = appSource.match(/function openAdminProductMenu\(productId\) \{[\s\S]*?\n  \}\n\n  function confirmDeleteAdminProduct/);
  const groupSource = appSource.match(/async function updateAdminProductGroups\(action\) \{[\s\S]*?\n  \}\n\n  function jumpToFirstAdminError/);

  assert.ok(menuSource, 'не найдено меню товара');
  assert.doesNotMatch(menuSource[0], /Как увидит покупатель|Убрать в архив/);
  assert.match(menuSource[0], /Удалить товар/);
  assert.ok(groupSource, 'не найден обработчик склеек');
  assert.match(groupSource[0], /apiClient\.combineAdminProducts/);
  assert.match(groupSource[0], /apiClient\.ungroupAdminProducts/);
  assert.match(groupSource[0], /await loadRemoteAdminProducts\(\{ preserveScroll: true \}\)/);
  assert.match(groupSource[0], /await loadRemoteCatalog\(\{ preserveScroll: true \}\)/);
  assert.match(appSource, /data-action="toggle-admin-product-selection"/);
  assert.match(appSource, /Для разъединения отметь все карточки одной склейки/);
});

test('выбор и изменение склейки сохраняют позицию списка продавца', () => {
  const selectionSource = appSource.match(/function toggleAdminProductSelection\(productId\) \{[\s\S]*?\n  \}/);
  const groupSource = appSource.match(/async function updateAdminProductGroups\(action\) \{[\s\S]*?\n  \}\n\n  function jumpToFirstAdminError/);

  assert.ok(selectionSource, 'не найден обработчик выбора карточки');
  assert.match(selectionSource[0], /render\(\{ preserveScroll: true \}\)/);
  assert.ok(groupSource, 'не найден обработчик изменения склеек');
  assert.match(groupSource[0], /loadRemoteAdminProducts\(\{ preserveScroll: true \}\)/);
  assert.match(groupSource[0], /loadRemoteCatalog\(\{ preserveScroll: true \}\)/);
  assert.match(groupSource[0], /render\(\{ preserveScroll: true \}\)/);
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

test('повторное сохранение не загружает повторно фотографию с подтверждённым Storage path', () => {
  const saveSource = appSource.match(/async function saveAdminProduct\(status\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(saveSource, /String\(image\)\.startsWith\('data:'\) && !state\.adminDraft\.imagePaths\?\.\[index\]/);
  assert.match(saveSource, /String\(image\)\.startsWith\('data:'\) && !imagePaths\[index\]/);
});

test('сохранение не теряет позицию нового фото между черновым сохранением и загрузкой', () => {
  const saveSource = appSource.match(/async function saveAdminProduct\(status\) \{[\s\S]*?\n  \}\n\n  const actions/);
  assert.ok(saveSource, 'не найден полный обработчик сохранения товара');
  assert.match(saveSource[0], /Core\.mergeAdminDraftSave\(state\.adminDraft, saved\)/);
});

test('сохранение возвращает к прежней позиции списка карточек продавца', () => {
  const draftStart = appSource.match(/function startAdminDraft\(product = null, \{ restoreLocalDraft = false \} = \{\}\) \{[\s\S]*?\n  \}/);
  const saveSource = appSource.match(/async function saveAdminProduct\(status\) \{[\s\S]*?\n  \}\n\n  const actions/);
  assert.ok(draftStart, 'не найдено открытие редактора');
  assert.ok(saveSource, 'не найден полный обработчик сохранения товара');
  assert.match(draftStart[0], /captureAdminListReturnContext\(\)/);
  assert.match(saveSource[0], /returnToAdminProductList\(\)/);
});

test('ошибка сохранения честно различает серверный черновик и локальный резерв', () => {
  const saveSource = appSource.match(/async function saveAdminProduct\(status\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(saveSource, /state\.adminSaveError = '';/);
  assert.match(saveSource, /let serverDraftSaved = false;/);
  assert.match(saveSource, /serverDraftSaved = true;/);
  assert.match(saveSource, /Сервер не сохранил черновик\. Введённые данные оставлены только на этом устройстве\./);
  assert.match(saveSource, /Черновик сохранён на сервере\. Не удалось завершить загрузку фотографии\. Повтори сохранение\./);
  assert.doesNotMatch(saveSource, /Данные сохранены в черновик\. Исправь ошибку и повтори\./);
});

test('повторный артикул подсвечивается в форме, а не маскируется серверной ошибкой', () => {
  const saveSource = appSource.match(/async function saveAdminProduct\(status\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(saveSource, /error\?\.code === 'SELLER_SKU_CONFLICT'/);
  assert.match(saveSource, /sellerSku: 'Артикул уже используется в другой карточке/);
  assert.match(saveSource, /Черновик не сохранён: исправь артикул продавца\./);
  assert.match(appSource, /adminFieldError\('sellerSku'\)/);
});

test('тайм-аут сохранения сначала восстанавливает результат, а публикация передаёт подтверждённую версию', () => {
  const saveSource = appSource.match(/async function saveAdminProduct\(status\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(saveSource, /getAdminSaveResult/);
  assert.match(saveSource, /Черновик сохранён на сервере\. Ответ задержался/);
  assert.match(saveSource, /publishAdminProduct\(saved\)/);
  assert.match(saveSource, /каталог покупателя пока не подтвердил обновление/);
});

test('черновик сохраняет фото в IndexedDB и использует localStorage как резерв', () => {
  assert.match(appSource, /FashionStoreAdminDraftStore/);
  assert.match(appSource, /AdminDraftStore\?\.save\(ADMIN_DRAFT_KEY, state\.adminDraft\.images\)/);
  assert.match(appSource, /function restoreAdminDraftImages/);
});

test('редактор показывает удаление только сохранённого варианта с подтверждением', () => {
  assert.match(appSource, /data-action="delete-admin-product"/);
  assert.match(appSource, /Удалить этот вариант/);
  assert.match(appSource, /Удалить товар/);
  assert.match(appSource, /data-action="confirm-delete-admin-product"/);
  assert.match(appSource, /apiClient\.deleteAdminProduct/);
  assert.match(appSource, /deletedProductId/);
  assert.match(appSource, /await loadRemoteCatalog\(\)/);
});

test('seller-очередь не читает локальный order и меняет ready только ответом API', () => {
  assert.match(appSource, /sellerOrders: \[\],/);
  assert.match(appSource, /apiClient\.listSellerOrders/);
  assert.match(appSource, /apiClient\.getSellerOrder/);
  assert.match(appSource, /apiClient\.markOrderReady/);
  assert.match(appSource, /state\.sellerOrder\.id/);
  assert.doesNotMatch(appSource, /function confirmOrderReady\(\)[\s\S]*Core\.markOrderReady/);
  assert.match(appSource, /replaceOrder\(updatedOrder\)/);
});

test('buyer обновляет серверный статус заказа при открытии и сохраняет старый при ошибке', () => {
  assert.match(appSource, /async function openBuyerOrder\(orderId = state\.activeOrderId\)/);
  assert.match(appSource, /apiClient\.getBuyerOrder/);
  assert.match(appSource, /Последний корректный серверный заказ остаётся/);
  assert.match(appSource, /'open-order': \(control\) => void openBuyerOrder\(control\.dataset\.orderId\)/);
});
