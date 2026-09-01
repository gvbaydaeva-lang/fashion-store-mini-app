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
    const images = Array.isArray(product?.product_images)
      ? [...product.product_images]
        .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0))
        .map((image) => image.signed_url || image.url || image.object_path)
        .filter(Boolean)
      : Array.isArray(product?.images) ? product.images : [];
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
      images,
      colors,
      sizes,
      variants,
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

    if (typeof requestFetch !== 'function') {
      throw new FashionStoreApiError('В браузере недоступен сетевой клиент.');
    }

    async function getCatalog(filters = {}) {
      const query = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value == null || value === '' || (Array.isArray(value) && !value.length)) return;
        query.set(key, Array.isArray(value) ? value.join(',') : String(value));
      });
      const suffix = query.toString() ? `?${query.toString()}` : '';
      const response = await requestFetch(`${baseUrl}/catalog-api${suffix}`, { method: 'GET' });
      const data = await readResponse(response);
      return (Array.isArray(data.products) ? data.products : []).map(normalizeProduct);
    }

    async function adminRequest(action, payload = {}) {
      const response = await requestFetch(`${baseUrl}/admin-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, initData: options.initData ?? getInitData(), ...payload }),
      });
      return readResponse(response);
    }

    return {
      getCatalog,
      async getAdminProducts(filters) {
        const data = await adminRequest('list', { filters });
        return (Array.isArray(data.products) ? data.products : []).map(normalizeProduct);
      },
      async createAdminProduct(product) {
        const data = await adminRequest('create', { product });
        return normalizeProduct(data.product);
      },
      async updateAdminProduct(product) {
        const data = await adminRequest('update', { productId: product?.id, product });
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
        return adminRequest('update-stock', { productId, variantId, stock, isEnabled });
      },
      async getAdminUploadUrl(productId, file) {
        const extension = String(file?.name || '').split('.').pop().toLowerCase();
        return adminRequest('upload-url', { productId, fileExtension: extension });
      },
    };
  }

  const API = { FashionStoreApiError, createApiClient, normalizeProduct };
  window.FashionStoreApi = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
}(typeof window !== 'undefined' ? window : globalThis));
