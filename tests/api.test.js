/* Проверяет тонкий клиент API без настоящих сетевых запросов. */
const test = require('node:test');
const assert = require('node:assert/strict');

const API = require('../api.js');

test('getCatalog отправляет GET и преобразует серверные поля товара', async () => {
  const calls = [];
  const client = API.createApiClient({
    baseUrl: 'https://example.supabase.co/functions/v1',
    fetch: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            products: [{
              id: 7,
              name: 'Платье',
              old_price: 6990,
              product_variants: [{ color_id: 'black', color_name: 'Чёрный', size_value: 'S', stock: 2, is_enabled: true }],
              product_images: [{ signed_url: 'https://cdn.example/image.webp', sort_order: 0 }],
            }],
          };
        },
      };
    },
  });

  const products = await client.getCatalog({ category: 'dresses' });

  assert.equal(calls[0].url, 'https://example.supabase.co/functions/v1/catalog-api?category=dresses');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(products[0].oldPrice, 6990);
  assert.deepEqual(products[0].variants, [{ colorId: 'black', size: 'S', stock: 2, enabled: true }]);
  assert.deepEqual(products[0].colors, [{ id: 'black', name: 'Чёрный' }]);
  assert.deepEqual(products[0].sizes, ['S']);
  assert.deepEqual(products[0].images, ['https://cdn.example/image.webp']);
});

test('административный запрос передаёт сырой initData и возвращает код ошибки', async () => {
  const calls = [];
  const client = API.createApiClient({
    baseUrl: 'https://example.supabase.co/functions/v1/',
    initData: 'signed-telegram-data',
    fetch: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: false,
        status: 403,
        async json() {
          return { error: 'Нет доступа к панели продавца.' };
        },
      };
    },
  });

  await assert.rejects(
    () => client.getAdminProducts(),
    (error) => error.name === 'FashionStoreApiError'
      && error.status === 403
      && error.message === 'Нет доступа к панели продавца.',
  );
  assert.equal(calls[0].url, 'https://example.supabase.co/functions/v1/admin-api');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    action: 'list',
    initData: 'signed-telegram-data',
  });
});

test('клиент не маскирует сетевую ошибку успешным ответом', async () => {
  const client = API.createApiClient({
    baseUrl: 'https://example.supabase.co/functions/v1',
    fetch: async () => ({
      ok: false,
      status: 500,
      async json() { return { error: 'Каталог временно недоступен.' }; },
    }),
  });

  await assert.rejects(
    () => client.getCatalog(),
    (error) => error.status === 500 && error.message === 'Каталог временно недоступен.',
  );
});

test('архивирование отправляет productId и возвращает серверный результат', async () => {
  const calls = [];
  const client = API.createApiClient({
    initData: 'signed-telegram-data',
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() { return { ok: true, data: { archived: true } }; } };
    },
  });

  const result = await client.archiveAdminProduct(12);

  assert.deepEqual(result, { archived: true });
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    action: 'archive', initData: 'signed-telegram-data', productId: 12,
  });
});

test('изменение остатка отправляет variantId, stock и состояние варианта', async () => {
  const calls = [];
  const client = API.createApiClient({
    initData: 'signed-telegram-data',
    fetch: async (_url, options) => {
      calls.push(options);
      return { ok: true, async json() { return { ok: true, data: { stock: 4, isEnabled: false } }; } };
    },
  });

  const result = await client.updateAdminStock(12, 34, 4, false);

  assert.deepEqual(result, { stock: 4, isEnabled: false });
  assert.deepEqual(JSON.parse(calls[0].body), {
    action: 'update-stock', initData: 'signed-telegram-data',
    productId: 12, variantId: 34, stock: 4, isEnabled: false,
  });
});

test('сохранение товара переводит поля и варианты в серверный формат', async () => {
  let body;
  const client = API.createApiClient({
    fetch: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, async json() { return { ok: true, data: { product: { id: 9, status: 'draft' } } }; } };
    },
  });

  await client.createAdminProduct({
    name: 'Платье', price: 5000, oldPrice: 6000, sellerSku: 'DR-1',
    adminStatus: 'draft', images: ['data:image/png;base64,local'],
    variants: [{ colorId: 'black', size: 'S', stock: 2, enabled: true }],
  });

  assert.equal(body.product.old_price, 6000);
  assert.equal(body.product.seller_sku, 'DR-1');
  assert.deepEqual(body.product.variants, [{ color_id: 'black', color_name: 'black', color_hex: null, size: 'S', stock: 2, is_enabled: true }]);
  assert.deepEqual(body.product.images, []);
});

test('пустые необязательные цены отправляются на сервер как null', async () => {
  let body;
  const client = API.createApiClient({
    fetch: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, async json() { return { ok: true, data: { product: { id: 10, status: 'draft' } } }; } };
    },
  });

  await client.createAdminProduct({
    name: 'Жакет', price: '', oldPrice: '', wholesalePrice: '',
    adminStatus: 'draft', variants: [], images: [],
  });

  assert.equal(body.product.price, 0);
  assert.equal(body.product.old_price, null);
  assert.equal(body.product.wholesale_price, null);
  assert.equal(body.product.seller_sku, null);
});
