/* Тонкий клиент серверного каталога. Секреты и бизнес-логика здесь не хранятся. */
(function createApi(window) {
  'use strict';

  const DEFAULT_BASE_URL = 'https://sskwmffdgzytombtrhut.supabase.co/functions/v1';

  class FashionStoreApiError extends Error {
    constructor(message, status = 0, code = '') {
      super(message);
      this.name = 'FashionStoreApiError';
      this.status = status;
      this.code = code;
    }
  }

  function normalizeBaseUrl(value) {
    return String(value || DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  function optionalNumber(value) {
    if (value == null || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }

  function optionalText(value) {
    const text = String(value ?? '').trim();
    return text ? text : null;
  }

  function requiredNumber(value) {
    const number = optionalNumber(value);
    return number == null || number === '' ? 0 : number;
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

  function normalizeProduct(product) {
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
      ? imageRecords.map((image) => image.signed_url || image.url || image.object_path).filter(Boolean)
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
      oldPrice: product.old_price ?? product.oldPrice ?? null,
      sellerSku: product.seller_sku ?? product.sellerSku ?? '',
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
      seller_sku: optionalText(product?.sellerSku),
      wholesale_price: optionalNumber(product?.wholesalePrice),
      supplier: product?.supplier ?? '',
      description: product?.description ?? '',
      composition: product?.composition ?? '',
      fit: product?.fit ?? '',
      care: product?.care ?? '',
      measurements: product?.measurements ?? {},
      is_new: product?.badge === 'Новинка',
      status: product?.adminStatus === 'published' ? 'published' : product?.adminStatus === 'archived' ? 'archived' : 'draft',
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
      throw new FashionStoreApiError(message || 'Сервер временно недоступен.', response.status, error?.code || '');
    }
    if (body.ok === false) {
      const error = body.error || {};
      throw new FashionStoreApiError(error.message || 'Сервер не смог выполнить запрос.', response.status, error.code || '');
    }
    return body.data ?? body;
  }

  function createApiClient(options = {}) {
    const requestFetch = options.fetch || window.fetch?.bind(window);
    const baseUrl = normalizeBaseUrl(options.baseUrl || window.FashionStoreConfig?.apiBaseUrl);
    const getInitData = options.getInitData || (() => window.Telegram?.WebApp?.initData || '');
    const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 15000;

    if (typeof requestFetch !== 'function') {
      throw new FashionStoreApiError('В браузере недоступен сетевой клиент.');
    }

    function requestWithTimeout(url, requestOptions) {
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
        }, timeoutMs);

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

    async function getCatalog(filters = {}) {
      const query = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value == null || value === '' || (Array.isArray(value) && !value.length)) return;
        query.set(key, Array.isArray(value) ? value.join(',') : String(value));
      });
      const suffix = query.toString() ? `?${query.toString()}` : '';
      const response = await requestWithTimeout(`${baseUrl}/catalog-api${suffix}`, { method: 'GET' });
      const data = await readResponse(response);
      return (Array.isArray(data.products) ? data.products : []).map(normalizeProduct);
    }

    async function adminRequest(action, payload = {}) {
      const response = await requestWithTimeout(`${baseUrl}/admin-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, initData: options.initData ?? getInitData(), ...payload }),
      });
      return readResponse(response);
    }

    async function uploadAdminImage(productId, image) {
      const { mimeType, extension } = parseDataImage(image);
      const data = await adminRequest('upload-url', { productId, fileExtension: extension });
      const objectPath = data?.objectPath;
      const signedUrl = data?.upload?.signedUrl;
      if (!objectPath || !signedUrl) throw new FashionStoreApiError('Сервер не подготовил загрузку фотографии.');
      const response = await requestWithTimeout(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: dataImageToBlob(image),
      });
      if (!response.ok) throw new FashionStoreApiError('Не удалось загрузить фотографию.', response.status || 0);
      return objectPath;
    }

    return {
      getCatalog,
      async getAdminProducts(filters) {
        const data = await adminRequest('list', { filters });
        return (Array.isArray(data.products) ? data.products : []).map(normalizeProduct);
      },
      async createAdminProduct(product) {
        const data = await adminRequest('create', { product: serializeProduct(product) });
        return normalizeProduct(data.product);
      },
      async updateAdminProduct(product) {
        const data = await adminRequest('update', { productId: product?.id, updatedAt: product?.updatedAt, product: serializeProduct(product) });
        return normalizeProduct(data.product);
      },
      async publishAdminProduct(productId) {
        const data = await adminRequest('publish', { productId });
        return normalizeProduct(data.product);
      },
      async archiveAdminProduct(productId) {
        return adminRequest('archive', { productId });
      },
      async updateAdminStock(productId, variantId, stock, isEnabled) {
        const data = await adminRequest('update-stock', { productId, variantId, stock, isEnabled });
        return data.variant || data;
      },
      async getAdminUploadUrl(productId, file) {
        const extension = String(file?.name || '').split('.').pop().toLowerCase();
        return adminRequest('upload-url', { productId, fileExtension: extension });
      },
      uploadAdminImage,
    };
  }

  const API = { FashionStoreApiError, createApiClient, normalizeProduct };
  window.FashionStoreApi = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
}(typeof window !== 'undefined' ? window : globalThis));
