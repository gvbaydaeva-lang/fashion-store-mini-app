/* Здесь находится чистая бизнес-логика каталога, корзины и заказа. */
(function exposeCore(root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  root.FashionStoreCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCore() {
  function filterProducts(products, filters) {
    return products.filter((product) => {
      const availableVariants = product.variants.filter(({ stock }) => stock > 0);
      const matchesCategory = filters.category === 'all' || product.category === filters.category;
      const matchesSize = !filters.sizes.length || filters.sizes.some((size) => (
        availableVariants.some((variant) => variant.size === size)
      ));
      const matchesColor = !filters.colors.length || filters.colors.some((colorId) => (
        availableVariants.some((variant) => variant.colorId === colorId)
      ));
      const matchesPrice = filters.maxPrice == null || product.price <= filters.maxPrice;
      const matchesNew = !filters.onlyNew || product.badge === 'Новинка';

      return matchesCategory && matchesSize && matchesColor && matchesPrice && matchesNew;
    });
  }

  function sortProducts(products, sortId) {
    const result = [...products];
    if (sortId === 'price-asc') result.sort((left, right) => left.price - right.price);
    if (sortId === 'price-desc') result.sort((left, right) => right.price - left.price);
    return result;
  }

  function getAvailableOptions(product, colorId) {
    return product.variants.filter((variant) => variant.colorId === colorId);
  }

  function flattenCatalogProductGroups(groups) {
    return (Array.isArray(groups) ? groups : []).flatMap((group) => (
      (Array.isArray(group.options) ? group.options : []).map((option) => ({
        ...group,
        ...option,
        id: `${group.id}:${option.id}`,
        groupId: String(group.id),
        optionId: String(option.id),
        images: Array.isArray(option.images) ? [...option.images] : [],
        sizes: Array.isArray(option.sizes) ? option.sizes.map((size) => ({ ...size })) : [],
      }))
    ));
  }

  function getSelectedProductOption(group, optionId) {
    const options = Array.isArray(group?.options) ? group.options : [];
    return options.find((option) => String(option.id) === String(optionId)) || options[0] || null;
  }

  function addCartItem(cart, item, stock) {
    if (stock <= 0) return [...cart];
    const current = cart.find((entry) => entry.key === item.key);
    if (!current) {
      return [...cart, { ...item, quantity: Math.min(item.quantity || 1, stock) }];
    }
    return cart.map((entry) => (
      entry.key === item.key
        ? { ...entry, quantity: Math.min(entry.quantity + 1, stock) }
        : entry
    ));
  }

  function setCartItemQuantity(cart, key, quantity, stock) {
    if (quantity <= 0) return cart.filter((item) => item.key !== key);
    return cart.map((item) => (
      item.key === key ? { ...item, quantity: Math.min(quantity, stock) } : item
    ));
  }

  function removeCartItem(cart, key) {
    return cart.filter((item) => item.key !== key);
  }

  function getCartSummary(cart, deliveryPrice = 0) {
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return {
      itemCount,
      subtotal,
      deliveryPrice,
      total: subtotal + deliveryPrice,
    };
  }

  function createDemoOrder(
    cart,
    customer,
    delivery,
    existingOrder,
    orderId = `FS-${String(Date.now()).slice(-6)}`,
    createdAt = new Date().toISOString(),
  ) {
    if (existingOrder) return existingOrder;
    const summary = getCartSummary(cart, delivery.price);
    return {
      id: orderId,
      createdAt,
      status: 'paid',
      items: cart.map((item) => ({ ...item })),
      customer: { ...customer },
      delivery: { ...delivery },
      ...summary,
    };
  }

  function markOrderReady(order) {
    return order.status === 'paid' ? { ...order, status: 'ready' } : { ...order };
  }

  function shouldShowFirstOpenOffer(storedValue) {
    return storedValue !== 'seen';
  }

  function buildMainMiniAppUrl(username) {
    const normalizedUsername = String(username || '').trim().replace(/^@/, '');
    return `https://t.me/${normalizedUsername}?startapp`;
  }

  function buildTelegramShareUrl(botUrl, text) {
    return `https://t.me/share/url?url=${encodeURIComponent(botUrl)}&text=${encodeURIComponent(text)}`;
  }

  function cloneAdminProduct(product) {
    const variants = Array.isArray(product.variants)
      ? product.variants.map((variant) => ({ ...variant }))
      : [];
    const sizes = Array.isArray(product.sizes) && product.sizes.length
      ? [...product.sizes]
      : [...new Set(variants.map(({ size }) => size).filter(Boolean))];

    return {
      ...product,
      images: Array.isArray(product.images) ? [...product.images] : [],
      imagePaths: Array.isArray(product.imagePaths) ? [...product.imagePaths] : [],
      colors: Array.isArray(product.colors)
        ? product.colors.map((color) => ({ ...color }))
        : [],
      sizes,
      variants,
      measurements: product.measurements ? { ...product.measurements } : {},
    };
  }

  function createAdminCatalog(products) {
    return products.map((product) => ({
      ...cloneAdminProduct(product),
      adminStatus: ['draft', 'published', 'archived'].includes(product.adminStatus)
        ? product.adminStatus : 'published',
    }));
  }

  function getPublishedProducts(products) {
    return products.filter(({ adminStatus }) => adminStatus === 'published');
  }

  function getAdminProductStatus(product) {
    if (product.adminStatus === 'archived') return 'archived';
    if (product.adminStatus === 'draft') return 'draft';
    const hasStock = (product.variants || []).some((variant) => (
      variant.enabled !== false && Number(variant.stock) > 0
    ));
    return hasStock ? 'published' : 'out';
  }

  function filterAdminProducts(products, query = '', status = 'all', filters = {}) {
    const normalizedQuery = String(query).trim().toLocaleLowerCase('ru-RU');
    return products.filter((product) => {
      const matchesQuery = !normalizedQuery
        || String(product.name || '').toLocaleLowerCase('ru-RU').includes(normalizedQuery);
      const matchesStatus = status === 'all' || getAdminProductStatus(product) === status;
      const matchesCategory = !filters.category || filters.category === 'all'
        || product.category === filters.category;
      const matchesSupplier = !filters.supplier || filters.supplier === 'all'
        || String(product.supplier || '').trim() === filters.supplier;
      const hasStock = (product.variants || []).some((variant) => (
        variant.enabled !== false && Number(variant.stock) > 0
      ));
      const matchesAvailability = !filters.availability || filters.availability === 'all'
        || (filters.availability === 'in-stock' ? hasStock : !hasStock);
      const matchesNew = !filters.onlyNew || product.badge === 'Новинка';
      return matchesQuery && matchesStatus && matchesCategory && matchesSupplier
        && matchesAvailability && matchesNew;
    });
  }

  function buildProductVariants(colors, sizes, previousVariants = []) {
    const previousByKey = new Map(previousVariants.map((variant) => (
      [`${variant.colorId}:${variant.size}`, variant]
    )));
    return colors.flatMap((color) => sizes.map((size) => {
      const previous = previousByKey.get(`${color.id}:${size}`);
      return {
        colorId: color.id,
        size,
        stock: Number.isInteger(previous?.stock) && previous.stock >= 0 ? previous.stock : 0,
        enabled: previous?.enabled !== false,
      };
    }));
  }

  function buildColorVariants(color, sizes, previousVariants = []) {
    if (!color?.id) return [];
    const previousBySize = new Map(previousVariants
      .filter((variant) => variant.colorId === color.id)
      .map((variant) => [variant.size, variant]));
    return normalizeAdminOptionList(sizes).map((size) => {
      const previous = previousBySize.get(size);
      return {
        colorId: color.id,
        size,
        stock: Number.isInteger(previous?.stock) && previous.stock >= 0 ? previous.stock : 0,
        enabled: previous?.enabled !== false,
      };
    });
  }

  function normalizeAdminOptionList(value) {
    const source = Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
    const seen = new Set();
    return source.map((item) => String(item || '').trim()).filter((item) => {
      const key = item.toLocaleLowerCase('ru-RU');
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function createAdminCategory(value) {
    const source = String(value || '').trim();
    const title = source.startsWith('custom-')
      ? source.slice('custom-'.length).replace(/-/g, ' ')
      : source;
    return { id: title, title };
  }

  function validateAdminProduct(product, step = 4) {
    const errors = {};
    if (step === 'draft') return errors;
    const isPublish = step === 'publish';
    const shouldValidate = (targetStep) => step === 4 || step === targetStep;

    if (shouldValidate(1)) {
      if (!Array.isArray(product.images) || !product.images.length) {
        errors.images = 'Загрузи хотя бы одно фото';
      }
      if (!String(product.name || '').trim()) errors.name = 'Добавь название товара';
    }

    if (shouldValidate(2)) {
      const price = Number(product.price);
      const oldPrice = product.oldPrice == null || product.oldPrice === ''
        ? null
        : Number(product.oldPrice);
      if (!Number.isInteger(price) || price <= 0) errors.price = 'Добавь цену';
      if (oldPrice != null && (!Number.isInteger(oldPrice) || oldPrice <= price)) {
        errors.oldPrice = 'Старая цена должна быть выше текущей';
      }
    }

    if (shouldValidate(3) || isPublish) {
      if (!Array.isArray(product.colors) || !product.colors.length) {
        errors.colors = 'Укажи хотя бы один цвет';
      }
      const enabledVariants = Array.isArray(product.variants)
        ? product.variants.filter(({ enabled }) => enabled !== false)
        : [];
      const colorsWithoutSizes = Array.isArray(product.colors)
        && product.colors.some((color) => !product.variants?.some((variant) => (
          variant.colorId === color.id && String(variant.size || '').trim()
        )));
      if (!product.colors?.length && !isPublish) {
        errors.sizes = 'Укажи хотя бы один размер';
      } else if (colorsWithoutSizes) {
        errors.sizes = 'Укажи размер для каждого цвета';
      } else if (product.colors?.length && !enabledVariants.length) {
        errors.variants = 'Оставь хотя бы один вариант';
      } else if (enabledVariants.some(({ stock }) => !Number.isInteger(stock) || stock < 0)) {
        errors.variants = 'Остаток должен быть целым числом от нуля';
      }
    }

    if (isPublish) {
      if (!String(product.description || '').trim()) errors.description = 'Добавь описание товара';
      const wholesalePrice = Number(product.wholesalePrice);
      if (!Number.isInteger(wholesalePrice) || wholesalePrice <= 0) {
        errors.wholesalePrice = 'Добавь оптовую цену';
      }
    }

    return errors;
  }

  function duplicateAdminProduct(product, id) {
    const copy = cloneAdminProduct(product);
    return {
      ...copy,
      id,
      name: `${String(product.name || 'Товар').trim()} — копия`,
      images: [],
      adminStatus: 'draft',
      variants: copy.variants.map((variant) => ({ ...variant, stock: 0 })),
    };
  }

  function popScreenHistory(history, fallbackScreen = 'home') {
    const nextHistory = [...history];
    const previous = nextHistory.pop();
    return {
      target: previous || { screen: fallbackScreen, params: {} },
      history: nextHistory,
    };
  }

  function serializeAdminDraft(draft, step) {
    return JSON.stringify({ draft, step });
  }

  function parseAdminDraft(raw) {
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value.draft !== 'object' || value.draft === null) return null;
      const step = Number(value.step);
      return { draft: value.draft, step: Number.isInteger(step) && step >= 1 && step <= 4 ? step : 1 };
    } catch (_error) {
      return null;
    }
  }

  return {
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
    getAdminProductStatus,
    popScreenHistory,
    serializeAdminDraft,
    parseAdminDraft,
  };
});
