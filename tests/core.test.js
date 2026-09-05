/* Тесты проверяют фильтры, корзину и жизненный цикл демонстрационного заказа. */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  filterProducts,
  sortProducts,
  getAvailableOptions,
  flattenCatalogProductGroups,
  getSelectedProductOption,
  addCartItem,
  setCartItemQuantity,
  removeCartItem,
  getCartSummary,
  createDemoOrder,
  markOrderReady,
  shouldShowFirstOpenOffer,
  buildMainMiniAppUrl,
  buildTelegramShareUrl,
  createAdminCatalog,
  getPublishedProducts,
  filterAdminProducts,
  buildProductVariants,
  buildColorVariants,
  normalizeAdminOptionList,
  createAdminCategory,
  validateAdminProduct,
  duplicateAdminProduct,
  createAdminProductVariant,
  getAdminProductStatus,
  popScreenHistory,
  serializeAdminDraft,
  parseAdminDraft,
} = require('../core.js');

const TEST_PRODUCTS = [
  {
    id: 'dress-test', category: 'dresses', price: 5990, badge: 'Новинка',
    colors: [{ id: 'blue', name: 'Голубой', hex: '#9ec9e6' }],
    variants: [{ colorId: 'blue', size: 'M', stock: 2 }, { colorId: 'blue', size: 'L', stock: 0 }],
  },
  {
    id: 'jacket-test', category: 'jackets', price: 9990, badge: null,
    colors: [{ id: 'black', name: 'Чёрный', hex: '#242424' }],
    variants: [{ colorId: 'black', size: 'S', stock: 1 }],
  },
];

test('оффер показывается без маркера и не повторяется после просмотра', () => {
  assert.equal(shouldShowFirstOpenOffer(null), true);
  assert.equal(shouldShowFirstOpenOffer('seen'), false);
});

test('ссылка для шаринга передаёт Telegram адрес бота и текст', () => {
  assert.equal(
    buildTelegramShareUrl(
      'https://t.me/fashion_katalog_bot',
      'Посмотри «Выгодные покупки» в Telegram 🛍',
    ),
    'https://t.me/share/url?url=https%3A%2F%2Ft.me%2Ffashion_katalog_bot&text=%D0%9F%D0%BE%D1%81%D0%BC%D0%BE%D1%82%D1%80%D0%B8%20%C2%AB%D0%92%D1%8B%D0%B3%D0%BE%D0%B4%D0%BD%D1%8B%D0%B5%20%D0%BF%D0%BE%D0%BA%D1%83%D0%BF%D0%BA%D0%B8%C2%BB%20%D0%B2%20Telegram%20%F0%9F%9B%8D',
  );
});

test('ссылка Main Mini App открывает приложение, а не профиль бота', () => {
  assert.equal(
    buildMainMiniAppUrl('fashion_katalog_bot'),
    'https://t.me/fashion_katalog_bot?startapp',
  );
});

test('каталог оставляет товары выбранной категории', () => {
  const result = filterProducts(TEST_PRODUCTS, { category: 'dresses' });

  assert.ok(result.length > 0);
  assert.ok(result.every((product) => product.category === 'dresses'));
});

test('сортировка применяется после отбора товаров выбранной категории', () => {
  const products = [
    { id: 'dress-expensive', category: 'dresses', price: 8900 },
    { id: 'jacket', category: 'jackets', price: 1200 },
    { id: 'dress-cheap', category: 'dresses', price: 4900 },
  ];
  const filtered = filterProducts(products, { category: 'dresses' });

  assert.deepEqual(
    sortProducts(filtered, 'price-asc').map(({ id }) => id),
    ['dress-cheap', 'dress-expensive'],
  );
  assert.deepEqual(
    sortProducts(filtered, 'price-desc').map(({ id }) => id),
    ['dress-expensive', 'dress-cheap'],
  );
  assert.deepEqual(
    sortProducts(filtered, 'default').map(({ id }) => id),
    ['dress-expensive', 'dress-cheap'],
  );
});

test('варианты возвращают размеры и остатки выбранного цвета', () => {
  const product = TEST_PRODUCTS[0];
  const colorId = product.colors[0].id;
  const options = getAvailableOptions(product, colorId);

  assert.ok(options.length > 0);
  assert.ok(options.every((variant) => variant.colorId === colorId));
});

test('склейка разворачивается в каталоге в отдельные карточки цветов', () => {
  const group = {
    id: 'group-12',
    category: 'dresses',
    options: [
      { id: 'option-black', name: 'Платье', colorName: 'Чёрный', price: 7000, images: ['black.webp'], sizes: [] },
      { id: 'option-milk', name: 'Платье', colorName: 'Молочный', price: 7200, images: ['milk.webp'], sizes: [] },
    ],
  };
  const cards = flattenCatalogProductGroups([group]);

  assert.deepEqual(cards.map(({ id, groupId, optionId, colorName, price, images }) => ({
    id, groupId, optionId, colorName, price, images,
  })), [
    { id: 'group-12:option-black', groupId: 'group-12', optionId: 'option-black', colorName: 'Чёрный', price: 7000, images: ['black.webp'] },
    { id: 'group-12:option-milk', groupId: 'group-12', optionId: 'option-milk', colorName: 'Молочный', price: 7200, images: ['milk.webp'] },
  ]);
  assert.equal(getSelectedProductOption(group, 'option-milk').colorName, 'Молочный');
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

test('неполный товар разрешён для серверного черновика', () => {
  assert.deepEqual(validateAdminProduct({
    name: '', price: '', description: '', wholesalePrice: null,
    images: [], colors: [], sizes: [], variants: [],
  }, 'draft'), {});
});

test('новый цветовой вариант не переносит фотографии исходной карточки', () => {
  const variant = createAdminProductVariant({
    id: '12', groupId: '12', name: 'Платье', description: 'Описание',
    images: ['12/photo.webp'], imagePaths: ['12/photo.webp'],
    colors: [{ id: 'black', name: 'Чёрный' }],
    variants: [{ colorId: 'black', size: 'S', stock: 0, enabled: true }],
    adminStatus: 'published',
  }, 'local-option');

  assert.equal(variant.name, 'Платье');
  assert.equal(variant.description, 'Описание');
  assert.deepEqual(variant.images, []);
  assert.deepEqual(variant.imagePaths, []);
  assert.equal(variant.sourceProductId, '12');
  assert.equal(variant.adminStatus, 'draft');
});

test('buyer-выбор цвета и размера исключает disabled и нулевые варианты', () => {
  const product = {
    variants: [
      { colorId: 'black', size: 'S', stock: 3, enabled: false },
      { colorId: 'black', size: 'M', stock: 0, enabled: true },
      { colorId: 'blue', size: 'L', stock: 2, enabled: true },
    ],
  };

  assert.deepEqual(getAvailableOptions(product, 'black'), []);
  assert.deepEqual(getAvailableOptions(product, 'blue'), [product.variants[2]]);
});

test('disabled-вариант не добавляется в корзину даже при ненулевом остатке', () => {
  const item = { key: 'dress-air:black:S', productId: 'dress-air', quantity: 1 };
  assert.deepEqual(addCartItem([], item, 3, false), []);
});

test('позиция удаляется из корзины, если её актуальный остаток стал нулевым', () => {
  const cart = [{ key: 'dress-air:blue:M', quantity: 1 }];
  assert.deepEqual(setCartItemQuantity(cart, cart[0].key, 1, 0), []);
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

test('корзина сохраняет две позиции разных цветов и их идентификаторы', () => {
  const black = {
    key: 'dress:variant-black:M', productId: 'dress', variantId: 101,
    colorId: 'black', colorName: 'Чёрный', size: 'M', price: 5990, quantity: 1,
  };
  const milk = {
    key: 'dress:variant-milk:M', productId: 'dress', variantId: 102,
    colorId: 'milk', colorName: 'Молочный', size: 'M', price: 5990, quantity: 2,
  };

  const cart = addCartItem(addCartItem([], black, 2), milk, 2);

  assert.deepEqual(cart.map(({ productId, variantId, colorId, quantity }) => ({ productId, variantId, colorId, quantity })), [
    { productId: 'dress', variantId: 101, colorId: 'black', quantity: 1 },
    { productId: 'dress', variantId: 102, colorId: 'milk', quantity: 2 },
  ]);
});

test('тестовый заказ использует отдельный статус demo, а не paid', () => {
  const serverOrder = { id: 'ORDER-1', orderType: 'server', status: 'demo' };
  assert.equal(serverOrder.status, 'demo');
  assert.notEqual(serverOrder.status, 'paid');
});

test('готовность меняет только оплаченный заказ и не мутирует исходный', () => {
  const order = { id: 'FS-1001', status: 'paid' };
  const ready = markOrderReady(order);

  assert.equal(order.status, 'paid');
  assert.equal(ready.status, 'ready');
});

test('административный каталог глубоко копирует товары и помечает их опубликованными', () => {
  const source = [{
    id: 'dress',
    images: ['assets/dress.jpg'],
    colors: [{ id: 'black', name: 'Чёрный', hex: '#242424' }],
    variants: [{ colorId: 'black', size: 'S', stock: 2 }],
    measurements: { S: '88–68–94' },
  }];

  const result = createAdminCatalog(source);
  result[0].images.push('changed.jpg');
  result[0].colors[0].name = 'Изменён';
  result[0].variants[0].stock = 0;
  result[0].measurements.S = 'changed';

  assert.equal(result[0].adminStatus, 'published');
  assert.deepEqual(result[0].sizes, ['S']);
  assert.deepEqual(source[0].images, ['assets/dress.jpg']);
  assert.equal(source[0].colors[0].name, 'Чёрный');
  assert.equal(source[0].variants[0].stock, 2);
  assert.equal(source[0].measurements.S, '88–68–94');
});

test('покупатель получает только опубликованные товары', () => {
  const products = [
    { id: 'one', adminStatus: 'published' },
    { id: 'two', adminStatus: 'draft' },
  ];

  assert.deepEqual(getPublishedProducts(products).map(({ id }) => id), ['one']);
});

test('админский поиск не зависит от регистра и фильтрует черновики', () => {
  const products = [
    { id: 'one', name: 'Платье Миди', adminStatus: 'published', variants: [] },
    { id: 'two', name: 'Жакет Софт', adminStatus: 'draft', variants: [] },
  ];

  assert.deepEqual(
    filterAdminProducts(products, 'ЖАКЕТ', 'draft').map(({ id }) => id),
    ['two'],
  );
});

test('админский фильтр находит опубликованный товар без остатка', () => {
  const products = [
    {
      id: 'one',
      name: 'Платье',
      adminStatus: 'published',
      variants: [{ colorId: 'black', size: 'S', stock: 0 }],
    },
    {
      id: 'two',
      name: 'Жакет',
      adminStatus: 'published',
      variants: [{ colorId: 'black', size: 'M', stock: 1 }],
    },
  ];

  assert.deepEqual(filterAdminProducts(products, '', 'out').map(({ id }) => id), ['one']);
});

test('админские фильтры одновременно отбирают категорию, наличие и новинки', () => {
  const products = [
    { id: 'new-in', name: 'Платье', category: 'dresses', badge: 'Новинка', adminStatus: 'published', variants: [{ stock: 2 }] },
    { id: 'old-in', name: 'Жакет', category: 'jackets', badge: null, adminStatus: 'published', variants: [{ stock: 2 }] },
    { id: 'new-out', name: 'Рубашка', category: 'shirts', badge: 'Новинка', adminStatus: 'published', variants: [{ stock: 0 }] },
  ];

  assert.deepEqual(
    filterAdminProducts(products, '', 'all', { category: 'dresses', availability: 'in-stock', onlyNew: true }).map(({ id }) => id),
    ['new-in'],
  );
});

test('админский фильтр оставляет товары выбранного поставщика', () => {
  const products = [
    { id: 'one', name: 'Платье', supplier: 'Milan Fashion', adminStatus: 'published', variants: [{ stock: 2 }] },
    { id: 'two', name: 'Жакет', supplier: 'Local Brand', adminStatus: 'published', variants: [{ stock: 2 }] },
    { id: 'three', name: 'Рубашка', supplier: 'Milan Fashion', adminStatus: 'published', variants: [{ stock: 0 }] },
  ];

  assert.deepEqual(
    filterAdminProducts(products, '', 'all', { supplier: 'Milan Fashion', availability: 'in-stock' })
      .map(({ id }) => id),
    ['one'],
  );
});

test('матрица создаёт все сочетания и сохраняет прежний остаток', () => {
  const result = buildProductVariants(
    [{ id: 'black', name: 'Чёрный', hex: '#242424' }],
    ['S', 'M'],
    [{ colorId: 'black', size: 'S', stock: 3 }],
  );

  assert.deepEqual(result, [
    { colorId: 'black', size: 'S', stock: 3, enabled: true },
    { colorId: 'black', size: 'M', stock: 0, enabled: true },
  ]);
});

test('матрица вариантов не мутирует старые значения и сохраняет отключение', () => {
  const previous = [{ colorId: 'black', size: 'S', stock: 3, enabled: false }];
  const result = buildProductVariants([{ id: 'black' }], ['S'], previous);

  result[0].stock = 8;

  assert.equal(result[0].enabled, false);
  assert.equal(previous[0].stock, 3);
});

test('размеры одного цвета не создают варианты другого цвета', () => {
  const result = buildColorVariants(
    { id: 'brown', name: 'Коричневый, шоколадный' },
    ['42', '44'],
    [
      { colorId: 'black', size: 'S', stock: 8 },
      { colorId: 'brown', size: '42', stock: 3 },
    ],
  );

  assert.deepEqual(result, [
    { colorId: 'brown', size: '42', stock: 3, enabled: true },
    { colorId: 'brown', size: '44', stock: 0, enabled: true },
  ]);
});

test('ручные цвета и размеры принимают запятые и переносы строк, убирают дубли', () => {
  assert.deepEqual(normalizeAdminOptionList('Чёрный, молочный\nЧёрный'), ['Чёрный', 'молочный']);
  assert.deepEqual(normalizeAdminOptionList('42, 44\nXL'), ['42', '44', 'XL']);
});

test('пользовательская категория сохраняется своим названием без технического префикса', () => {
  assert.deepEqual(createAdminCategory('  Верхняя одежда  '), {
    id: 'Верхняя одежда',
    title: 'Верхняя одежда',
  });
  assert.deepEqual(createAdminCategory('custom-костюмы'), {
    id: 'костюмы',
    title: 'костюмы',
  });
});

test('публикация требует фото, название, цену, цвет и размер', () => {
  assert.deepEqual(
    validateAdminProduct({
      images: [],
      name: '',
      price: 0,
      colors: [],
      sizes: [],
      variants: [],
    }, 4),
    {
      images: 'Загрузи хотя бы одно фото',
      name: 'Добавь название товара',
      price: 'Добавь цену',
      colors: 'Укажи хотя бы один цвет',
      sizes: 'Укажи хотя бы один размер',
    },
  );
});

test('черновик сохраняется без обязательных полей, а публикация требует описание и оптовую цену', () => {
  const product = {
    images: [],
    name: '',
    price: '',
    description: '',
    wholesalePrice: null,
    colors: [],
    variants: [],
  };

  assert.deepEqual(validateAdminProduct(product, 'draft'), {});
  const errors = validateAdminProduct(product, 'publish');
  assert.equal(errors.description, 'Добавь описание товара');
  assert.equal(errors.wholesalePrice, 'Добавь оптовую цену');
});

test('публикация требует размер у каждого введённого цвета', () => {
  const errors = validateAdminProduct({
    images: ['assets/dress.jpg'],
    name: 'Платье',
    price: 5000,
    description: 'Платье по фигуре',
    wholesalePrice: 2500,
    colors: [
      { id: 'black', name: 'Чёрный' },
      { id: 'brown', name: 'Коричневый, шоколадный' },
    ],
    variants: [{ colorId: 'black', size: 'S', stock: 1, enabled: true }],
  }, 'publish');

  assert.equal(errors.sizes, 'Укажи размер для каждого цвета');
});

test('валидация отклоняет старую цену ниже текущей и некорректный остаток', () => {
  const errors = validateAdminProduct({
    images: ['assets/dress.jpg'],
    name: 'Платье',
    price: 5000,
    oldPrice: 4000,
    colors: [{ id: 'black' }],
    sizes: ['S'],
    variants: [{ colorId: 'black', size: 'S', stock: -1, enabled: true }],
  }, 4);

  assert.equal(errors.oldPrice, 'Старая цена должна быть выше текущей');
  assert.equal(errors.variants, 'Остаток должен быть целым числом от нуля');
});

test('публикация требует хотя бы один включённый вариант', () => {
  const errors = validateAdminProduct({
    images: ['assets/dress.jpg'],
    name: 'Платье',
    price: 5000,
    oldPrice: null,
    colors: [{ id: 'black' }],
    sizes: ['S'],
    variants: [{ colorId: 'black', size: 'S', stock: 0, enabled: false }],
  }, 4);

  assert.equal(errors.variants, 'Оставь хотя бы один вариант');
});

test('похожий товар становится независимым черновиком и не переносит остатки', () => {
  const source = {
    id: 'old',
    name: 'Платье',
    adminStatus: 'published',
    images: ['assets/dress.jpg'],
    colors: [{ id: 'black', name: 'Чёрный', hex: '#242424' }],
    sizes: ['S'],
    variants: [{ colorId: 'black', size: 'S', stock: 4, enabled: true }],
    measurements: { S: '88–68–94' },
  };

  const copy = duplicateAdminProduct(source, 'new');
  copy.colors[0].name = 'Изменён';

  assert.equal(copy.id, 'new');
  assert.equal(copy.adminStatus, 'draft');
  assert.equal(copy.variants[0].stock, 0);
  assert.equal(source.colors[0].name, 'Чёрный');
  assert.equal(source.variants[0].stock, 4);
});

test('новый вариант переносит только название, описание, артикул и поставщика', () => {
  const source = {
    id: '31', groupId: 'dress-group', name: 'Платье', category: 'dresses', sellerSku: 'DR-31',
    price: 5990, oldPrice: 6990, wholesalePrice: 2800, supplier: 'Milan Fashion',
    description: 'Платье миди', images: ['dress.jpg'], imagePaths: ['products/31/dress.jpg'],
    colors: [{ id: 'black', name: 'Чёрный' }], sizes: ['42'],
    variants: [{ colorId: 'black', size: '42', stock: 3, enabled: true }],
  };

  const variant = createAdminProductVariant(source, 'admin-new');

  assert.equal(variant.id, 'admin-new');
  assert.equal(variant.groupId, 'dress-group');
  assert.equal(variant.name, 'Платье');
  assert.equal(variant.description, 'Платье миди');
  assert.equal(variant.sellerSku, 'DR-31');
  assert.equal(variant.supplier, 'Milan Fashion');
  assert.equal(variant.price, '');
  assert.equal(variant.wholesalePrice, null);
  assert.equal(variant.category, 'all');
  assert.deepEqual(variant.images, []);
  assert.deepEqual(variant.imagePaths, []);
  assert.deepEqual(variant.colors, []);
  assert.deepEqual(variant.sizes, []);
  assert.deepEqual(variant.variants, []);
});

test('статус товара различает черновик, публикацию и отсутствие остатка', () => {
  assert.equal(getAdminProductStatus({ adminStatus: 'draft', variants: [] }), 'draft');
  assert.equal(getAdminProductStatus({
    adminStatus: 'published',
    variants: [{ stock: 0, enabled: true }],
  }), 'out');
  assert.equal(getAdminProductStatus({
    adminStatus: 'published',
    variants: [{ stock: 1, enabled: true }],
  }), 'published');
});

test('выход из редактора получает предыдущий экран без повторного вызова навигации', () => {
  const history = [
    { screen: 'store', params: {} },
    { screen: 'seller-products', params: { filter: 'draft' } },
  ];

  const result = popScreenHistory(history, 'seller-products');

  assert.deepEqual(result.target, { screen: 'seller-products', params: { filter: 'draft' } });
  assert.deepEqual(result.history, [{ screen: 'store', params: {} }]);
  assert.equal(history.length, 2);
});

test('черновик редактора восстанавливает введённые данные и шаг формы', () => {
  const draft = { id: 'admin-draft', name: 'Жакет', price: '', variants: [] };

  const stored = serializeAdminDraft(draft, 2);
  const restored = parseAdminDraft(stored);

  assert.deepEqual(restored, { draft, step: 2 });
  assert.equal(parseAdminDraft('{invalid'), null);
});
