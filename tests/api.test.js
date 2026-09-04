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

test('normalizeProduct восстанавливает ключ серверного черновика для повторного сохранения', () => {
  const product = API.normalizeProduct({
    id: 12, admin_draft_key: '123e4567-e89b-42d3-a456-426614174000',
  });
  assert.equal(product.clientDraftKey, '123e4567-e89b-42d3-a456-426614174000');
});

test('клиент передаёт версию для публикации и восстанавливает сохранение по ключу черновика', async () => {
  const calls = [];
  const client = API.createApiClient({
    initData: 'signed-telegram-data',
    fetch: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return { ok: true, async json() { return { ok: true, data: { product: { id: 12, updated_at: '2026-09-04T10:00:00.000Z' } } }; } };
    },
  });
  await client.publishAdminProduct({ id: 12, updatedAt: '2026-09-04T10:00:00.000Z' });
  await client.getAdminSaveResult({ draftKey: '123e4567-e89b-42d3-a456-426614174000' });
  assert.deepEqual(calls, [
    { action: 'publish', initData: 'signed-telegram-data', productId: 12, updatedAt: '2026-09-04T10:00:00.000Z' },
    { action: 'get-save-result', initData: 'signed-telegram-data', draftKey: '123e4567-e89b-42d3-a456-426614174000' },
  ]);
});

test('клиент сохраняет requestId и поля серверной проверки публикации', async () => {
  const client = API.createApiClient({
    fetch: async () => ({
      ok: false, status: 422,
      headers: { get: (name) => name === 'X-Request-Id' ? 'req-42' : null },
      async json() { return { requestId: 'req-42', error: { code: 'PUBLICATION_VALIDATION_FAILED', message: 'Загрузи хотя бы одно фото', fields: { images: 'Загрузи хотя бы одно фото' } } }; },
    }),
  });
  await assert.rejects(
    () => client.publishAdminProduct({ id: 12, updatedAt: '2026-09-04T10:00:00.000Z' }),
    (error) => error.code === 'PUBLICATION_VALIDATION_FAILED' && error.requestId === 'req-42' && error.fieldErrors.images === 'Загрузи хотя бы одно фото',
  );
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

test('учёт открытия передаёт только raw initData в user-api', async () => {
  const calls = [];
  const client = API.createApiClient({
    baseUrl: 'https://example.supabase.co/functions/v1',
    initData: 'signed-telegram-data',
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() { return { ok: true, data: { tracked: true } }; } };
    },
  });

  assert.deepEqual(await client.trackOpen(), { tracked: true });
  assert.equal(calls[0].url, 'https://example.supabase.co/functions/v1/user-api');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    action: 'track-open', initData: 'signed-telegram-data',
  });
});

test('клиент запрашивает список пользователей и карточку владельца через admin-api', async () => {
  const bodies = [];
  const client = API.createApiClient({
    initData: 'signed-telegram-data',
    fetch: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, async json() { return { ok: true, data: { users: [] } }; } };
    },
  });

  await client.listAdminUsers({ query: 'Анна', filter: 'orders' });
  await client.getAdminUser(17);
  assert.deepEqual(bodies, [
    { action: 'list-users', initData: 'signed-telegram-data', query: 'Анна', filter: 'orders' },
    { action: 'get-user', initData: 'signed-telegram-data', userId: 17 },
  ]);
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
    clientDraftKey: '123e4567-e89b-42d3-a456-426614174000',
    adminStatus: 'draft', images: ['data:image/png;base64,local'],
    colors: [{ id: 'black', name: 'Чёрный, графитовый' }],
    variants: [{ colorId: 'black', size: 'S', stock: 2, enabled: true }],
  });

  assert.equal(body.product.old_price, 6000);
  assert.equal(body.product.seller_sku, 'DR-1');
  assert.deepEqual(body.product.variants, [{ color_id: 'black', color_name: 'Чёрный, графитовый', color_hex: null, size: 'S', stock: 2, is_enabled: true }]);
  assert.deepEqual(body.product.images, []);
  assert.equal(body.product.admin_draft_key, '123e4567-e89b-42d3-a456-426614174000');
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

test('ошибка Storage возвращается понятным русским сообщением и не маскируется успехом', async () => {
  const client = API.createApiClient({
    initData: 'signed-telegram-data',
    fetch: async (url) => {
      if (url.endsWith('/admin-api')) return {
        ok: true,
        async json() {
          return { ok: true, data: { objectPath: '12/photo.png', upload: { signedUrl: 'https://storage.example/upload' } } };
        },
      };
      return { ok: false, status: 500, async json() { return {}; } };
    },
  });

  await assert.rejects(
    () => client.uploadAdminImage(12, 'data:image/png;base64,AA=='),
    (error) => error.code === 'PHOTO_UPLOAD_FAILED'
      && error.message === 'Фотография не загрузилась. Повтори загрузку — остальные данные сохранены.',
  );
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
    clientDraftKey: '123e4567-e89b-42d3-a456-426614174000', adminStatus: 'draft', variants: [], images: [],
  });

  assert.equal(body.product.price, 0);
  assert.equal(body.product.old_price, null);
  assert.equal(body.product.wholesale_price, null);
  assert.equal(body.product.seller_sku, null);
  assert.equal(body.product.category, 'all');
  assert.equal(body.product.name, 'Без названия');
  assert.equal(body.product.admin_draft_key, '123e4567-e89b-42d3-a456-426614174000');
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
    clientDraftKey: '123e4567-e89b-42d3-a456-426614174000',
    updatedAt: '2026-09-02T09:00:00.000Z',
    name: 'Платье',
    imagePaths: ['12/photo.png'],
    variants: [{ id: 34, colorId: 'black', colorName: 'Чёрный', size: 'S', stock: 2, enabled: true }],
  });

  assert.equal(body.action, 'update');
  assert.equal(body.updatedAt, '2026-09-02T09:00:00.000Z');
  assert.equal(body.product.admin_draft_key, '123e4567-e89b-42d3-a456-426614174000');
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
      && error.message === 'Не удалось выполнить запрос.'
      && !error.message.includes('Postgres')
      && !error.message.includes('stack.ts'),
  );
});

test('клиент сохраняет понятный конфликт повторного артикула', async () => {
  const client = API.createApiClient({
    fetch: async () => ({
      ok: false,
      status: 409,
      async json() {
        return { ok: false, error: {
          code: 'SELLER_SKU_CONFLICT',
          message: 'Артикул уже используется в другой карточке. Укажи другой или очисти поле.',
        } };
      },
    }),
  });

  await assert.rejects(
    () => client.createAdminProduct({ clientDraftKey: '123e4567-e89b-42d3-a456-426614174000' }),
    (error) => error.status === 409
      && error.code === 'SELLER_SKU_CONFLICT'
      && error.message === 'Артикул уже используется в другой карточке. Укажи другой или очисти поле.',
  );
});

test('клиент не показывает технические сообщения Supabase и PostgreSQL', async () => {
  const client = API.createApiClient({
    fetch: async () => ({
      ok: false,
      status: 500,
      async json() {
        return { error: 'PostgreSQL relation missing in Supabase Edge Function' };
      },
    }),
  });

  await assert.rejects(
    () => client.getCatalog(),
    (error) => error.message === 'Не удалось выполнить запрос.'
      && !/supabase|postgresql|edge function/i.test(error.message),
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

test('создание заказа отправляет позиции и idempotency key, но не клиентские total/status', async () => {
  let body;
  const client = API.createApiClient({
    initData: 'raw-telegram-init-data',
    fetch: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, async json() { return { ok: true, data: { order: { id: 'order-1', status: 'pending_payment', total: 4990 } } }; } };
    },
  });

  const order = await client.createOrder({
    idempotencyKey: 'checkout-key-1',
    customer: { name: 'Анна', phone: '+79990000000' },
    deliveryId: 'pickup',
    items: [{ productId: 7, variantId: 9, quantity: 1, price: 1 }],
    total: 1,
    status: 'paid',
  });

  assert.equal(order.id, 'order-1');
  assert.equal(body.action, 'create');
  assert.equal(body.initData, 'raw-telegram-init-data');
  assert.equal(body.idempotencyKey, 'checkout-key-1');
  assert.deepEqual(body.items, [{ productId: 7, variantId: 9, quantity: 1 }]);
  assert.equal(body.total, undefined);
  assert.equal(body.status, undefined);
});

test('создание заказа отправляет две позиции разных цветов с productId, variantId и quantity', async () => {
  let body;
  const client = API.createApiClient({
    initData: 'raw-telegram-init-data',
    fetch: async (_url, options) => {
      body = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            data: {
              order: {
                id: 'order-two-colors',
                status: 'demo',
                order_items: [
                  { product_id: 7, variant_id: 9, product_name: 'Платье', color_name: 'Чёрный', size: 'M', quantity: 1, unit_price: 4990 },
                  { product_id: 8, variant_id: 10, product_name: 'Жакет', color_name: 'Молочный', size: 'S', quantity: 2, unit_price: 6990 },
                ],
              },
            },
          };
        },
      };
    },
  });

  const order = await client.createOrder({
    idempotencyKey: 'checkout-two-colors',
    customer: { name: 'Анна', phone: '+79990000000' },
    deliveryId: 'pickup',
    items: [
      { productId: 7, variantId: 9, colorName: 'Чёрный', quantity: 1 },
      { productId: 8, variantId: 10, colorName: 'Молочный', quantity: 2 },
    ],
  });

  assert.deepEqual(body.items, [
    { productId: 7, variantId: 9, quantity: 1 },
    { productId: 8, variantId: 10, quantity: 2 },
  ]);
  assert.deepEqual(order.items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })), [
    { productId: '7', variantId: 9, quantity: 1 },
    { productId: '8', variantId: 10, quantity: 2 },
  ]);
});

test('повторная отправка использует тот же idempotency key', async () => {
  const bodies = [];
  const client = API.createApiClient({
    initData: 'raw-telegram-init-data',
    fetch: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, async json() { return { ok: true, data: { order: { id: 'order-1', status: 'demo' } } }; } };
    },
  });

  await client.createOrder({ idempotencyKey: 'same-checkout-key', deliveryId: 'pickup', items: [{ productId: 7, variantId: 9, quantity: 1 }] });
  await client.createOrder({ idempotencyKey: 'same-checkout-key', deliveryId: 'pickup', items: [{ productId: 7, variantId: 9, quantity: 1 }] });

  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].idempotencyKey, bodies[1].idempotencyKey);
});

test('seller order API передаёт raw initData и разделяет list/get/mark-ready', async () => {
  const calls = [];
  const responses = [
    { orders: [{ id: 'order-1', status: 'paid', total: 100 }] },
    { order: { id: 'order-1', status: 'paid', total: 100 } },
    { order: { id: 'order-1', status: 'ready', total: 100 } },
  ];
  const client = API.createApiClient({
    baseUrl: 'https://example.supabase.co/functions/v1',
    initData: 'signed-owner-init-data',
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true, async json() { return { ok: true, data: responses.shift() }; } };
    },
  });

  const orders = await client.listSellerOrders();
  const order = await client.getSellerOrder('order-1');
  const ready = await client.markOrderReady('order-1');

  assert.equal(orders[0].status, 'paid');
  assert.equal(order.id, 'order-1');
  assert.equal(ready.status, 'ready');
  assert.deepEqual(calls.map(({ body }) => body), [
    { action: 'list-orders', initData: 'signed-owner-init-data' },
    { action: 'get-seller-order', initData: 'signed-owner-init-data', orderId: 'order-1' },
    { action: 'mark-ready', initData: 'signed-owner-init-data', orderId: 'order-1' },
  ]);
});
