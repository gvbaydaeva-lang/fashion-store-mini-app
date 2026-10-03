/* Тонкий клиент серверного каталога. Секреты и бизнес-логика здесь не хранятся. */
(function createApi(window) {
  'use strict';

  // Текущий Mini App-контур обслуживается только Beget.
  const DEFAULT_BASE_URL = 'https://api.womanshop08.ru/api';

  class FashionStoreApiError extends Error {
    constructor(message, status = 0, code = '', requestId = '') {
      super(message);
      this.name = 'FashionStoreApiError';
      this.status = status;
      this.code = code;
      this.requestId = requestId;
    }
  }

  function normalizeBaseUrl(value) {
    return String(value || DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  function resolveApiUrl(value, baseUrl) {
    if (!value || !baseUrl) return value;
    try { return new URL(value, baseUrl).toString(); }
    catch { return value; }
  }

  function optionalNumber(value) {
    if (value == null || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }

  function requiredNumber(value) {
    const number = optionalNumber(value);
    return number == null || number === '' ? 0 : number;
  }

  function safeErrorMessage(message, fallback = 'Не удалось выполнить запрос.') {
    const text = String(message || '').trim();
    if (!text || /supabase|postgres(?:ql)?|postgrest|stack\.ts|edge function|function failed/i.test(text)) {
      return fallback;
    }
    return text;
  }

  function parseDataImage(value) {
    const match = String(value || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new FashionStoreApiError('Поддерживаются JPG, PNG и WebP.');
    const mimeType = match[1];
    return {
      mimeType,
      extension: mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length),
      base64: match[2],
    };
  }

  function dataImageToBlob(value) {
    const { mimeType, base64 } = parseDataImage(value);
    const decode = window.atob || globalThis.atob;
    if (typeof decode !== 'function' || typeof Blob !== 'function') {
      throw new FashionStoreApiError('В браузере не удалось подготовить фотографию.');
    }
    const binary = decode(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: mimeType });
  }

  function normalizeProduct(product, baseUrl = '') {
    const variants = Array.isArray(product?.product_variants)
      ? product.product_variants.map((variant) => ({
        ...(variant.id == null ? {} : { id: variant.id }),
        colorId: variant.color_id ?? variant.colorId,
        size: variant.size_value ?? variant.size,
        stock: Number(variant.stock) || 0,
        enabled: variant.is_enabled ?? variant.enabled ?? true,
      }))
      : Array.isArray(product?.variants) ? product.variants : [];
    const imageRecords = Array.isArray(product?.product_images)
      ? [...product.product_images]
        .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0))
      : [];
    const images = imageRecords.length
      ? imageRecords.map((image) => {
        const url = image.signed_url || image.signedUrl || image.public_url || image.publicUrl || image.image_url || image.imageUrl || image.url;
        return url ? resolveApiUrl(url, baseUrl) : image.object_path;
      }).filter(Boolean)
      : Array.isArray(product?.images) ? product.images : [];
    const imagePaths = imageRecords.length
      ? imageRecords.map((image) => image.object_path).filter(Boolean)
      : Array.isArray(product?.imagePaths) ? product.imagePaths : images.filter((image) => !String(image).startsWith('data:'));
    const explicitColors = Array.isArray(product?.product_colors)
      ? product.product_colors.map((color) => ({ id: color.id, name: color.name }))
      : Array.isArray(product?.colors) ? product.colors : [];
    const colors = explicitColors.length ? explicitColors : [...new Map(
      (product?.product_variants || []).map((variant) => {
        const id = variant.color_id ?? variant.colorId;
        return [id, { id, name: variant.color_name ?? variant.colorName ?? id }];
      }).filter(([id]) => id != null),
    ).values()];
    const explicitSizes = Array.isArray(product?.product_sizes)
      ? product.product_sizes.map((size) => size.value)
      : Array.isArray(product?.sizes) ? product.sizes : [];
    const sizes = explicitSizes.length ? explicitSizes : [...new Set(
      (product?.product_variants || [])
        .map((variant) => variant.size_value ?? variant.size)
        .filter((size) => size != null),
    )];

    return {
      ...product,
      id: String(product.id),
      groupId: String(product.group_id ?? product.groupId ?? product.id),
      clientDraftKey: product.admin_draft_key ?? product.clientDraftKey ?? '',
      oldPrice: product.old_price ?? product.oldPrice ?? null,
      wholesalePrice: product.wholesale_price ?? product.wholesalePrice ?? null,
      adminStatus: product.status ?? product.adminStatus ?? 'published',
      updatedAt: product.updated_at ?? product.updatedAt ?? null,
      images,
      imagePaths,
      colors,
      sizes,
      variants,
    };
  }

  function normalizeOrder(order, baseUrl = '') {
    const items = Array.isArray(order?.order_items)
      ? order.order_items.map((item) => ({
        productId: String(item.product_id),
        variantId: item.variant_id,
        name: item.product_name,
        colorName: item.color_name,
        size: item.size,
        quantity: Number(item.quantity) || 0,
        price: Number(item.unit_price) || 0,
        image: resolveApiUrl(item.image_url || item.imageUrl || '', baseUrl) || item.image_path || '',
      }))
      : Array.isArray(order?.items) ? order.items : [];
    return {
      ...order,
      id: String(order.id),
      orderType: 'server',
      status: order.status || 'pending_payment',
      total: Number(order.total) || 0,
      delivery: {
        id: order.delivery_id,
        title: order.delivery_id === 'pickup' ? 'Самовывоз в Элисте' : 'Получение',
        description: order.delivery_id === 'pickup' ? 'Адрес самовывоза сообщим позже.' : '',
        price: Number(order.delivery_price) || 0,
      },
      customer: order.customer || {},
      createdAt: order.created_at || order.createdAt,
      items,
    };
  }

  function normalizeUser(user) {
    return {
      ...user,
      telegramUserId: Number(user?.telegramUserId ?? user?.telegram_user_id),
      firstName: user?.firstName ?? user?.first_name ?? '',
      lastName: user?.lastName ?? user?.last_name ?? '',
      username: user?.username || null,
      firstAppOpenedAt: user?.firstAppOpenedAt ?? user?.first_app_opened_at ?? null,
      lastAppOpenedAt: user?.lastAppOpenedAt ?? user?.last_app_opened_at ?? null,
      ordered: user?.ordered === true,
    };
  }

  function serializeProduct(product) {
    const category = String(product?.category ?? '').trim();
    const name = String(product?.name ?? '').trim();
    const colorNames = new Map((product?.colors || []).map((color) => [color.id, color.name]));
    return {
      category: category || 'all',
      name: name || 'Без названия',
      price: requiredNumber(product?.price),
      old_price: optionalNumber(product?.oldPrice),
      badge: product?.badge ?? null,
      wholesale_price: optionalNumber(product?.wholesalePrice),
      supplier: product?.supplier ?? '',
      description: product?.description ?? '',
      composition: product?.composition ?? '',
      fit: product?.fit ?? '',
      care: product?.care ?? '',
      measurements: product?.measurements ?? {},
      is_new: product?.badge === 'Новинка',
      status: product?.adminStatus === 'published' ? 'published' : product?.adminStatus === 'archived' ? 'archived' : 'draft',
      group_id: product?.groupId && /^\d+$/.test(String(product.groupId)) ? Number(product.groupId) : null,
      admin_draft_key: String(product?.clientDraftKey || '').trim() || null,
      source_product_id: product?.sourceProductId && /^\d+$/.test(String(product.sourceProductId))
        ? Number(product.sourceProductId) : null,
      variants: Array.isArray(product?.variants) ? product.variants.map((variant) => ({
        ...(variant.id == null ? {} : { id: variant.id }),
        color_id: variant.colorId,
        color_name: colorNames.get(variant.colorId) ?? variant.colorName ?? variant.color?.name ?? variant.colorId,
        color_hex: variant.colorHex ?? variant.color?.hex ?? null,
        size: variant.size,
        stock: variant.stock,
        is_enabled: variant.enabled !== false,
      })) : [],
      images: Array.isArray(product?.imagePaths)
        ? product.imagePaths.filter((image) => typeof image === 'string')
        : Array.isArray(product?.images) ? product.images.filter((image) => typeof image === 'string' && !image.startsWith('data:')) : [],
    };
  }

  async function readResponse(response) {
    let body = {};
    try {
      body = await response.json();
    } catch (_error) {
      body = {};
    }
    if (!response.ok) {
      const error = body.error;
      const message = typeof error === 'string' ? error : error?.message;
      const code = error?.code || '';
      const safeMessage = code === 'INTERNAL_ERROR'
        ? 'Не удалось выполнить запрос.'
        : safeErrorMessage(message);
      const requestError = new FashionStoreApiError(safeMessage, response.status, code, body.requestId || response.headers?.get?.('X-Request-Id') || '');
      requestError.fieldErrors = error?.fields && typeof error.fields === 'object' ? error.fields : {};
      throw requestError;
    }
    if (body.ok === false) {
      const error = body.error || {};
      const requestError = new FashionStoreApiError(safeErrorMessage(error.message), response.status, error.code || '', body.requestId || response.headers?.get?.('X-Request-Id') || '');
      requestError.fieldErrors = error?.fields && typeof error.fields === 'object' ? error.fields : {};
      throw requestError;
    }
    return body.data ?? body;
  }

  function createApiClient(options = {}) {
    const requestFetch = options.fetch || window.fetch?.bind(window);
    const baseUrl = normalizeBaseUrl(options.baseUrl || window.FashionStoreConfig?.apiBaseUrl);
    const getInitData = options.getInitData || (() => window.Telegram?.WebApp?.initData || '');
    const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 15000;
    const writeTimeoutMs = Number.isFinite(Number(options.writeTimeoutMs)) ? Number(options.writeTimeoutMs) : 45000;
    const retryDelayMs = Number.isFinite(Number(options.retryDelayMs)) ? Number(options.retryDelayMs) : 250;

    if (typeof requestFetch !== 'function') {
      throw new FashionStoreApiError('В браузере недоступен сетевой клиент.');
    }

    const includeWriteRequestId = options.includeWriteRequestId === true;
    // Telegram iOS/Android отправляет seller-JSON как простой запрос, чтобы
    // не выполнять отдельный CORS preflight к API на другом домене.
    const mobileSellerTransport = options.mobileSellerTransport === true;

    function createRequestId() {
      const randomUuid = window.crypto?.randomUUID?.bind(window.crypto);
      if (typeof randomUuid === 'function') return randomUuid();
      return `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }

    function requestWithTimeout(url, requestOptions, requestTimeoutMs = timeoutMs) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const optionsWithSignal = controller ? { ...requestOptions, signal: controller.signal } : requestOptions;

      return new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          callback(value);
        };
        timer = setTimeout(() => {
          controller?.abort();
          finish(reject, new FashionStoreApiError('Сервер не ответил вовремя. Проверь интернет и повтори.', 408, 'timeout'));
        }, requestTimeoutMs);

        requestFetch(url, optionsWithSignal)
          .then((response) => finish(resolve, response))
          .catch((error) => finish(
            reject,
            error?.name === 'AbortError'
              ? new FashionStoreApiError('Сервер не ответил вовремя. Проверь интернет и повтори.', 408, 'timeout')
              : error,
          ));
      });
    }

    async function requestWithRetry(url, requestOptions, retryable = false, requestTimeoutMs = timeoutMs) {
      const attempts = retryable ? 3 : 1;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          return await requestWithTimeout(url, requestOptions, requestTimeoutMs);
        } catch (error) {
          const canRetry = retryable
            && attempt < attempts
            && (error?.code === 'timeout' || !(error instanceof FashionStoreApiError));
          if (!canRetry) throw error;
          if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
      throw new FashionStoreApiError('Не удалось выполнить запрос.');
    }

    async function getCatalog(filters = {}) {
      const query = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value == null || value === '' || (Array.isArray(value) && !value.length)) return;
        query.set(key, Array.isArray(value) ? value.join(',') : String(value));
      });
      const suffix = query.toString() ? `?${query.toString()}` : '';
      const response = await requestWithRetry(`${baseUrl}/catalog-api${suffix}`, { method: 'GET', cache: 'no-store' }, true);
      const data = await readResponse(response);
      return (Array.isArray(data.products) ? data.products : []).map((product) => normalizeProduct(product, baseUrl));
    }

    async function adminRequest(action, payload = {}) {
      const readOnlyAction = ['list', 'list-users', 'get-user', 'get-save-result'].includes(action);
      const requestId = !readOnlyAction && includeWriteRequestId ? createRequestId() : '';
      try {
        const response = await requestWithRetry(`${baseUrl}/admin-api`, {
          method: 'POST',
          headers: { 'Content-Type': mobileSellerTransport ? 'text/plain;charset=UTF-8' : 'application/json' },
          body: JSON.stringify({ action, initData: options.initData ?? getInitData(), ...payload, ...(requestId ? { requestId } : {}) }),
        }, readOnlyAction, readOnlyAction ? timeoutMs : writeTimeoutMs);
        return await readResponse(response);
      } catch (error) {
        if (requestId && !error?.requestId) error.requestId = requestId;
        throw error;
      }
    }

    async function orderRequest(action, payload = {}) {
      const response = await requestWithTimeout(`${baseUrl}/order-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, initData: options.initData ?? getInitData(), ...payload }),
      });
      return readResponse(response);
    }

    async function userRequest(action, payload = {}) {
      const response = await requestWithTimeout(`${baseUrl}/user-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, initData: options.initData ?? getInitData(), ...payload }),
      });
      return readResponse(response);
    }

    async function uploadAdminImage(productId, image) {
      try {
        const { mimeType, extension } = parseDataImage(image);
        const data = await adminRequest('upload-url', { productId, fileExtension: extension });
        const objectPath = data?.objectPath;
        const signedUrl = data?.upload?.signedUrl;
        if (!objectPath || !signedUrl) throw new FashionStoreApiError('Сервер не подготовил загрузку фотографии.');
        const response = await requestWithTimeout(resolveApiUrl(signedUrl, baseUrl), {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: dataImageToBlob(image),
        }, writeTimeoutMs);
        if (!response.ok) throw new FashionStoreApiError('', response.status || 0, 'PHOTO_UPLOAD_FAILED');
        return objectPath;
      } catch (error) {
        throw new FashionStoreApiError(
          'Фотография не загрузилась. Повтори загрузку — остальные данные сохранены.',
          error?.status || 0,
          error?.code || 'PHOTO_UPLOAD_FAILED',
        );
      }
    }

    function groupRequestPayload(products) {
      if (!Array.isArray(products) || products.length < 2) {
        throw new FashionStoreApiError('Выбери минимум две карточки.');
      }
      const productIds = products.map((product) => Number(product?.id));
      const productVersions = products.map((product) => ({
        productId: Number(product?.id),
        updatedAt: product?.updatedAt ?? product?.updated_at ?? null,
      }));
      if (productIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
        || new Set(productIds).size !== productIds.length
        || productVersions.some((version) => !version.updatedAt)) {
        throw new FashionStoreApiError('Карточки изменились. Обнови список перед изменением склейки.', 409, 'PRODUCT_VERSION_CONFLICT');
      }
      return { productIds, productVersions };
    }

    return {
      getCatalog,
      async trackOpen() {
        return userRequest('track-open');
      },
      async createOrder(order) {
        const data = await orderRequest('create', {
          idempotencyKey: order.idempotencyKey,
          customer: order.customer,
          deliveryId: order.deliveryId,
          items: (order.items || []).map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            imagePath: item.imagePath,
          })),
        });
        return normalizeOrder(data.order, baseUrl);
      },
      async getBuyerOrder(orderId) {
        const data = await orderRequest('get-order', { orderId });
        return normalizeOrder(data.order, baseUrl);
      },
      async listSellerOrders() {
        const data = await orderRequest('list-orders');
        return (Array.isArray(data.orders) ? data.orders : []).map((order) => normalizeOrder(order, baseUrl));
      },
      async getSellerOrder(orderId) {
        const data = await orderRequest('get-seller-order', { orderId });
        return normalizeOrder(data.order, baseUrl);
      },
      async markOrderReady(orderId) {
        const data = await orderRequest('mark-ready', { orderId });
        return normalizeOrder(data.order, baseUrl);
      },
      async getAdminProducts(filters) {
        const data = await adminRequest('list', { filters });
        return (Array.isArray(data.products) ? data.products : []).map((product) => normalizeProduct(product, baseUrl));
      },
      async listAdminUsers(filters = {}) {
        const data = await adminRequest('list-users', filters);
        return {
          ...data,
          users: (Array.isArray(data.users) ? data.users : []).map(normalizeUser),
        };
      },
      async getAdminUser(userId) {
        const data = await adminRequest('get-user', { userId });
        return normalizeUser(data.user);
      },
      async createAdminProduct(product) {
        const data = await adminRequest('create', { product: serializeProduct(product) });
        return normalizeProduct(data.product, baseUrl);
      },
      async updateAdminProduct(product) {
        const data = await adminRequest('update', { productId: product?.id, updatedAt: product?.updatedAt, product: serializeProduct(product) });
        return normalizeProduct(data.product, baseUrl);
      },
      async publishAdminProduct(product) {
        const data = await adminRequest('publish', { productId: product?.id ?? product, updatedAt: product?.updatedAt });
        return normalizeProduct(data.product, baseUrl);
      },
      async getAdminSaveResult({ productId, draftKey } = {}) {
        const data = await adminRequest('get-save-result', { productId, draftKey });
        return normalizeProduct(data.product, baseUrl);
      },
      async archiveAdminProduct(productId, updatedAt) {
        return adminRequest('archive', { productId, updatedAt });
      },
      async deleteAdminProduct(productId) {
        const data = await adminRequest('delete', { productId });
        if (Number(data?.deletedProductId) !== Number(productId)) {
          throw new FashionStoreApiError('Сервер не подтвердил удаление варианта.', 500, 'INVALID_DELETE_RESPONSE');
        }
        return data;
      },
      async combineAdminProducts(products) {
        const payload = groupRequestPayload(products);
        const data = await adminRequest('combine-groups', payload);
        if (!Number.isSafeInteger(Number(data?.groupId))) {
          throw new FashionStoreApiError('Сервер не подтвердил объединение карточек.', 500, 'INVALID_GROUP_RESPONSE');
        }
        return data;
      },
      async ungroupAdminProducts(products) {
        const payload = groupRequestPayload(products);
        const data = await adminRequest('ungroup-products', payload);
        if (!Array.isArray(data?.productIds) || data.productIds.length !== payload.productIds.length) {
          throw new FashionStoreApiError('Сервер не подтвердил разъединение карточек.', 500, 'INVALID_GROUP_RESPONSE');
        }
        return data;
      },
      async updateAdminStock(productId, variantId, stock, isEnabled, updatedAt) {
        const data = await adminRequest('update-stock', { productId, variantId, stock, isEnabled, updatedAt });
        const variant = data.variant || data;
        return data.product?.updated_at || data.product?.updatedAt
          ? { ...variant, productUpdatedAt: data.product.updated_at ?? data.product.updatedAt }
          : variant;
      },
      async getAdminUploadUrl(productId, file) {
        const extension = String(file?.name || '').split('.').pop().toLowerCase();
        return adminRequest('upload-url', { productId, fileExtension: extension });
      },
      uploadAdminImage,
    };
  }

  const API = { FashionStoreApiError, createApiClient, normalizeProduct, normalizeOrder, normalizeUser };
  window.FashionStoreApi = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
}(typeof window !== 'undefined' ? window : globalThis));
