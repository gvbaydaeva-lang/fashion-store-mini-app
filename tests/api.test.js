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

test('normalizeProduct принимает публичные и camelCase URL изображений', () => {
  const product = API.normalizeProduct({
    id: 7,
    product_images: [
      { public_url: 'https://cdn.example/public.webp', sort_order: 0 },
      { publicUrl: 'https://cdn.example/public-2.webp', sort_order: 1 },
    ],
  });
  assert.deepEqual(product.images, ['https://cdn.example/public.webp', 'https://cdn.example/public-2.webp']);
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
    baseUrl: 'https://example.supabase.co/functions/v1',
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
    colors: [{ id: 'black', name: 'Чёрный, графитовый' }],
    variants: [{ colorId: 'black', size: 'S', stock: 2, enabled: true }],
  });

  assert.equal(body.product.old_price, 6000);
  assert.equal(body.product.seller_sku, 'DR-1');
  assert.deepEqual(body.product.variants, [{ color_id: 'black', color_name: 'Чёрный, графитовый', color_hex: null, size: 'S', stock: 2, is_enabled: true }]);
  assert.deepEqual(body.product.images, []);
});

test('фотография загружается по разовой ссылке и возвращает путь Storage', async () => {
  const calls = [];
  const client = API.createApiClient({
    baseUrl: 'https://example.supabase.co/functions/v1',
    initData: 'signed-telegram-data',
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === 'https://example.supabase.co/functions/v1/admin-api') {
        return {
          ok: true,
          async json() {
            return {
              ok: true,
              data: {
                objectPath: '12/photo.png',
                upload: { signedUrl: 'https://storage.example/upload/photo' },
              },
            };
          },
        };
      }
      return { ok: true, async json() { return {}; } };
    },
  });

  const objectPath = await client.uploadAdminImage(12, 'data:image/png;base64,AA==');

  assert.equal(objectPath, '12/photo.png');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    action: 'upload-url', initData: 'signed-telegram-data', productId: 12, fileExtension: 'png',
  });
  assert.equal(calls[1].url, 'https://storage.example/upload/photo');
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.headers['Content-Type'], 'image/png');
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
    name: '', category: '', price: '', oldPrice: '', wholesalePrice: '',
    adminStatus: 'draft', variants: [], images: [],
  });

  assert.equal(body.product.price, 0);
  assert.equal(body.product.old_price, null);
  assert.equal(body.product.wholesale_price, null);
  assert.equal(body.product.seller_sku, null);
  assert.equal(body.product.category, 'all');
  assert.equal(body.product.name, 'Без названия');
});

test('удаление варианта передаёт отдельное серверное действие', async () => {
  let body;
  const client = API.createApiClient({
    initData: 'signed-telegram-data',
    fetch: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, async json() { return { ok: true, data: { deletedProductId: 12 } }; } };
    },
  });

  const result = await client.deleteAdminProduct(12);
  assert.deepEqual(result, { deletedProductId: 12 });
  assert.deepEqual(body, { action: 'delete', initData: 'signed-telegram-data', productId: 12 });
});

test('клиент отклоняет успешный ответ без подтверждения удалённого товара', async () => {
  const client = API.createApiClient({
    initData: 'signed-telegram-data',
    fetch: async () => ({ ok: true, async json() { return { ok: true, data: {} }; } }),
  });

  await assert.rejects(
    () => client.deleteAdminProduct(12),
    (error) => error.name === 'FashionStoreApiError'
      && error.message === 'Сервер не подтвердил удаление варианта.',
  );
});

test('обновление товара передаёт снимок вариантов и путей изображений одной операцией', async () => {
  let body;
  const client = API.createApiClient({
    initData: 'signed-telegram-data',
    fetch: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, async json() {
        return { ok: true, data: { product: {
          id: 12, updated_at: '2026-09-02T10:00:00.000Z', status: 'draft',
          product_variants: [], product_images: [],
        } } };
      } };
    },
  });

  await client.updateAdminProduct({
    id: 12,
    updatedAt: '2026-09-02T09:00:00.000Z',
    name: 'Платье',
    imagePaths: ['12/photo.png'],
    variants: [{ id: 34, colorId: 'black', colorName: 'Чёрный', size: 'S', stock: 2, enabled: true }],
  });

  assert.equal(body.action, 'update');
  assert.equal(body.updatedAt, '2026-09-02T09:00:00.000Z');
  assert.deepEqual(body.product.images, ['12/photo.png']);
  assert.deepEqual(body.product.variants, [{
    id: 34, color_id: 'black', color_name: 'Чёрный', color_hex: null,
    size: 'S', stock: 2, is_enabled: true,
  }]);
});

test('клиент скрывает внутренний текст неожиданной ошибки 500', async () => {
  const client = API.createApiClient({
    fetch: async () => ({
      ok: false,
      status: 500,
      async json() {
        return { ok: false, error: {
          code: 'INTERNAL_ERROR', message: 'Postgres constraint products_group_id_fkey failed at stack.ts:44',
        } };
      },
    }),
  });

  await assert.rejects(
    () => client.getCatalog(),
    (error) => error.status === 500
      && error.code === 'INTERNAL_ERROR'
      && error.message === 'Сервер временно недоступен.'
      && !error.message.includes('Postgres')
      && !error.message.includes('stack.ts'),
  );
});

test('админский запрос завершается понятной ошибкой, если сервер не отвечает', async () => {
  let aborted = false;
  const client = API.createApiClient({
    timeoutMs: 10,
    fetch: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true;
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });

  await assert.rejects(
    () => client.getAdminProducts(),
    (error) => error.name === 'FashionStoreApiError'
      && error.status === 408
      && error.message === 'Сервер не ответил вовремя. Проверь интернет и повтори.',
  );
  assert.equal(aborted, true);
});
