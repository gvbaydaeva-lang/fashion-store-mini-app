/* Тесты проверяют фильтры, корзину и жизненный цикл демонстрационного заказа. */
const test = require('node:test');
const assert = require('node:assert/strict');

const { PRODUCTS } = require('../data.js');
const {
  filterProducts,
  sortProducts,
  getAvailableOptions,
  addCartItem,
  setCartItemQuantity,
  removeCartItem,
  getCartSummary,
  createDemoOrder,
  markOrderReady,
  shouldShowFirstOpenOffer,
  buildMainMiniAppUrl,
  buildTelegramShareUrl,
} = require('../core.js');

test('оффер показывается без маркера и не повторяется после просмотра', () => {
  assert.equal(shouldShowFirstOpenOffer(null), true);
  assert.equal(shouldShowFirstOpenOffer('seen'), false);
});

test('ссылка для шаринга передаёт Telegram адрес бота и текст', () => {
  assert.equal(
    buildTelegramShareUrl(
      'https://t.me/fashion_katalog_bot',
      'Посмотри каталог «Фэшн стор» в Telegram',
    ),
    'https://t.me/share/url?url=https%3A%2F%2Ft.me%2Ffashion_katalog_bot&text=%D0%9F%D0%BE%D1%81%D0%BC%D0%BE%D1%82%D1%80%D0%B8%20%D0%BA%D0%B0%D1%82%D0%B0%D0%BB%D0%BE%D0%B3%20%C2%AB%D0%A4%D1%8D%D1%88%D0%BD%20%D1%81%D1%82%D0%BE%D1%80%C2%BB%20%D0%B2%20Telegram',
  );
});

test('ссылка Main Mini App открывает приложение, а не профиль бота', () => {
  assert.equal(
    buildMainMiniAppUrl('fashion_katalog_bot'),
    'https://t.me/fashion_katalog_bot?startapp',
  );
});

test('фильтр оставляет товары нужной категории и доступного размера', () => {
  const result = filterProducts(PRODUCTS, {
    category: 'dresses',
    sizes: ['M'],
    colors: [],
    maxPrice: null,
    onlyNew: false,
  });

  assert.ok(result.length > 0);
  assert.ok(result.every((product) => product.category === 'dresses'));
  assert.ok(result.every((product) => (
    product.variants.some((variant) => variant.size === 'M' && variant.stock > 0)
  )));
});

test('сортировка по цене не изменяет исходный массив', () => {
  const original = PRODUCTS.map(({ id }) => id);
  const sorted = sortProducts(PRODUCTS, 'price-asc');

  assert.deepEqual(PRODUCTS.map(({ id }) => id), original);
  assert.ok(sorted.every((product, index) => (
    index === 0 || sorted[index - 1].price <= product.price
  )));
});

test('варианты возвращают размеры и остатки выбранного цвета', () => {
  const product = PRODUCTS[0];
  const colorId = product.colors[0].id;
  const options = getAvailableOptions(product, colorId);

  assert.ok(options.length > 0);
  assert.ok(options.every((variant) => variant.colorId === colorId));
});

test('одинаковый вариант объединяется и ограничивается остатком', () => {
  const item = {
    key: 'dress-air:blue:M',
    productId: 'dress-air',
    name: 'Платье Воздух',
    image: 'assets/dress-air.jpg',
    colorId: 'blue',
    colorName: 'Голубой',
    size: 'M',
    price: 5990,
    quantity: 1,
  };
  const first = addCartItem([], item, 2);
  const second = addCartItem(first, item, 2);
  const third = addCartItem(second, item, 2);

  assert.equal(second[0].quantity, 2);
  assert.equal(third[0].quantity, 2);
  assert.equal(first[0].quantity, 1);
});

test('вариант с нулевым остатком не попадает в корзину', () => {
  const item = { key: 'dress-air:blue:L', productId: 'dress-air', price: 5990, quantity: 1 };
  assert.deepEqual(addCartItem([], item, 0), []);
});

test('изменение количества ограничивается остатком, а ноль удаляет позицию', () => {
  const cart = [{ key: 'dress-air:blue:M', price: 5990, quantity: 1 }];
  const increased = setCartItemQuantity(cart, cart[0].key, 5, 2);
  const removed = setCartItemQuantity(increased, cart[0].key, 0, 2);

  assert.equal(increased[0].quantity, 2);
  assert.deepEqual(removed, []);
  assert.equal(cart[0].quantity, 1);
});

test('удаление позиции не изменяет исходную корзину', () => {
  const cart = [
    { key: 'dress-air:blue:M', price: 5990, quantity: 1 },
    { key: 'shirt-relaxed:white:S', price: 4990, quantity: 1 },
  ];
  const result = removeCartItem(cart, 'dress-air:blue:M');

  assert.deepEqual(result.map(({ key }) => key), ['shirt-relaxed:white:S']);
  assert.equal(cart.length, 2);
});

test('итог учитывает количество и доставку', () => {
  const summary = getCartSummary([
    { price: 5990, quantity: 2 },
    { price: 3490, quantity: 1 },
  ], 490);

  assert.deepEqual(summary, {
    itemCount: 3,
    subtotal: 15470,
    deliveryPrice: 490,
    total: 15960,
  });
});

test('повторное подтверждение не создаёт второй заказ', () => {
  const cart = [{ key: 'dress-air:blue:M', price: 5990, quantity: 1 }];
  const customer = { name: 'Анна', phone: '+79990000000' };
  const delivery = { id: 'pickup', title: 'Самовывоз', price: 0 };
  const first = createDemoOrder(cart, customer, delivery, null, 'FS-1001', '2026-08-26T10:00:00.000Z');
  const second = createDemoOrder(cart, customer, delivery, first, 'FS-1002', '2026-08-26T10:01:00.000Z');

  assert.equal(second.id, 'FS-1001');
  assert.equal(second, first);
});

test('готовность меняет только оплаченный заказ и не мутирует исходный', () => {
  const order = { id: 'FS-1001', status: 'paid' };
  const ready = markOrderReady(order);

  assert.equal(order.status, 'paid');
  assert.equal(ready.status, 'ready');
});
