/* Управляет экранами, событиями и интеграцией Telegram Web App. */
(function createApp(window, document) {
  'use strict';

  const Data = window.FashionStoreData;
  const Core = window.FashionStoreCore;
  const UI = window.FashionStoreUI;
  const API = window.FashionStoreApi;
  const tg = window.Telegram?.WebApp;
  const screenElement = document.querySelector('#screen');
  const appShell = document.querySelector('#app');
  const bottomNav = document.querySelector('#bottom-nav');
  const cartBadge = document.querySelector('#cart-badge');
  const toastElement = document.querySelector('#toast');
  const modalRoot = document.querySelector('#modal-root');
  const CART_KEY = 'fashion-store-cart-v1';
  const ORDER_KEY = 'fashion-store-order-v1';
  const ORDERS_KEY = 'fashion-store-orders-v2';
  const ORDER_IDEMPOTENCY_KEY = 'fashion-store-order-idempotency-v1';
  const OFFER_KEY = 'fashion-store-offer-seen-v1';
  const ADMIN_PRODUCTS_KEY = 'fashion-store-admin-products-v1';
  const ADMIN_DRAFT_KEY = 'fashion-store-admin-draft-v1';
  const PREORDER_RESET_KEY = 'fashion-store-preorder-reset-v1';
  const MAIN_APP_URL = Core.buildMainMiniAppUrl('fashion_katalog_bot');
  const OFFER_BOT_URL = 'https://t.me/fashion_katalog_bot?start=from_app';
  const SHARE_TEXT = 'Посмотри «Выгодные покупки» в Telegram 🛍';
  const ROOT_SCREENS = new Set(['home', 'catalog', 'cart', 'orders', 'store']);
  const CHECKOUT_SCREENS = new Set([
    'product', 'checkout-contact', 'checkout-delivery', 'checkout-review',
    'payment-success', 'order-detail', 'seller-access', 'seller-products',
    'seller-product-edit', 'seller-orders', 'seller-order', 'seller-users', 'seller-user',
  ]);
  const DEFAULT_FILTERS = {
    category: 'all',
    sizes: [],
    colors: [],
    maxPrice: null,
    onlyNew: false,
  };
  const ADMIN_COLORS = [
    { id: 'black', name: 'Чёрный', hex: '#242424' },
    { id: 'milk', name: 'Молочный', hex: '#eee9df' },
    { id: 'blue', name: 'Голубой', hex: '#9ec9e6' },
    { id: 'berry', name: 'Ягодный', hex: '#8a3d55' },
    { id: 'sand', name: 'Песочный', hex: '#c9ad8a' },
    { id: 'graphite', name: 'Графит', hex: '#555861' },
  ];
  const ADMIN_SIZES = ['XS', 'S', 'M', 'L', 'XL'];

  const state = {
    screen: 'home',
    history: [],
    params: {},
    filters: { ...DEFAULT_FILTERS },
    draftFilters: { ...DEFAULT_FILTERS },
    sortId: 'default',
    selectedColorId: null,
    selectedSize: null,
    cart: [],
    orders: [],
    activeOrderId: null,
    checkoutIdempotencyKey: null,
    customer: { name: '', phone: '' },
    delivery: null,
    sellerMode: false,
    sellerSection: 'products',
    sellerTab: 'collect',
    sellerOrders: [],
    sellerOrder: null,
    sellerOrdersStatus: 'idle',
    sellerOrdersError: '',
    adminUsers: [],
    adminUserStats: { total: 0, joinedToday: 0, openedApp: 0, ordered: 0 },
    adminUsersStatus: 'idle',
    adminUsersError: '',
    adminUsersQuery: '',
    adminUsersFilter: 'all',
    adminUser: null,
    catalogProducts: [],
    adminProducts: [],
    adminCategories: [],
    adminQuery: '',
    adminFilter: 'all',
    adminCategory: 'all',
    adminSupplier: 'all',
    adminAvailability: 'all',
    adminOnlyNew: false,
    adminDraft: null,
    adminColorEmptyRows: 0,
    adminSizeEmptyRows: {},
    adminStep: 1,
    adminDirty: false,
    adminErrors: {},
    adminSaveError: '',
    isSubmitting: false,
    catalogStatus: 'idle',
    catalogError: '',
    sellerAuthStatus: 'idle',
    sellerAuthError: '',
  };

  let toastTimer = null;
  let focusBeforeSheet = null;
  let apiClient = null;

  try {
    apiClient = API?.createApiClient?.() || null;
  } catch (_error) {
    apiClient = null;
  }

  function icon(name, className = 'ui-icon') {
    return UI?.icon(name, className) || '';
  }

  function hydrateStaticIcons() {
    document.querySelectorAll('[data-icon]').forEach((element) => {
      element.innerHTML = icon(element.dataset.icon);
    });
  }

  function applyViewportWidth() {
    // Ширину меняем только при открытии Mini App или повороте телефона. События
    // клавиатуры и сохранения в Telegram не должны менять раскладку формы.
    const viewportWidth = window.innerWidth;
    document.documentElement.style.setProperty('--app-width', `${UI.getMiniAppWidth(viewportWidth)}px`);
  }

  function applyViewportHeight() {
    const viewportHeight = tg?.viewportHeight || window.visualViewport?.height || window.innerHeight;
    if (viewportHeight) document.documentElement.style.setProperty('--app-height', `${Math.round(viewportHeight)}px`);
  }

  function applyViewportLayout() {
    applyViewportWidth();
    applyViewportHeight();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[character]);
  }

  function money(value) {
    return new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
  }

  function getTelegramFirstName() {
    return tg?.initDataUnsafe?.user?.first_name || 'Гость';
  }

  function readStored(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (_error) {
      window.localStorage.removeItem(key);
      return fallback;
    }
  }

  function loadPersistedState() {
    const cart = readStored(CART_KEY, []);
    const legacyOrder = readStored(ORDER_KEY, null);
    const storedOrders = readStored(ORDERS_KEY, []);
    state.cart = Array.isArray(cart)
      ? cart.filter((item) => item && typeof item.key === 'string' && item.quantity > 0)
      : [];
    const validOrders = Array.isArray(storedOrders)
      ? storedOrders.filter((order) => order && order.orderType === 'server' && typeof order.id === 'string')
      : [];
    if (legacyOrder && legacyOrder.orderType === 'server' && typeof legacyOrder.id === 'string'
      && !validOrders.some(({ id }) => id === legacyOrder.id)) validOrders.unshift(legacyOrder);
    state.orders = validOrders;
    state.activeOrderId = state.orders[0]?.id || null;
    window.localStorage.removeItem(ORDER_KEY);
    state.checkoutIdempotencyKey = readStored(ORDER_IDEMPOTENCY_KEY, null);
    state.adminProducts = [];
    state.adminCategories = [];
    state.adminProducts.forEach((product) => {
      if (!product.category || product.category === 'all') return;
      if (!state.adminCategories.some(({ id }) => id === product.category)) {
        state.adminCategories.push({ id: product.category, title: product.category });
      }
    });
    state.customer.name = getTelegramFirstName() === 'Гость' ? '' : getTelegramFirstName();
  }

  function applyApprovedDemoReset() {
    if (window.localStorage.getItem(PREORDER_RESET_KEY) === '1') return;
    [CART_KEY, ORDER_KEY, ORDERS_KEY, ADMIN_PRODUCTS_KEY].forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.setItem(PREORDER_RESET_KEY, '1');
  }

  function saveState() {
    window.localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(state.orders));
    window.localStorage.removeItem(ORDER_KEY);
    if (state.checkoutIdempotencyKey) window.localStorage.setItem(ORDER_IDEMPOTENCY_KEY, state.checkoutIdempotencyKey);
    else window.localStorage.removeItem(ORDER_IDEMPOTENCY_KEY);
  }

  function persistAdminDraft() {
    if (!state.adminDraft) return;
    try {
      window.localStorage.setItem(ADMIN_DRAFT_KEY, Core.serializeAdminDraft(state.adminDraft, state.adminStep));
    } catch (_error) {
      // Черновик остаётся в памяти до конца текущего открытия приложения.
    }
  }

  function readAdminDraft() {
    try {
      const stored = Core.parseAdminDraft(window.localStorage.getItem(ADMIN_DRAFT_KEY));
      return stored ? { ...stored, draft: cloneAdminProduct(stored.draft) } : null;
    } catch (_error) {
      return null;
    }
  }

  function clearAdminDraft() {
    try {
      window.localStorage.removeItem(ADMIN_DRAFT_KEY);
    } catch (_error) {
      // Невозможность очистить локальное хранилище не должна ломать сохранение.
    }
  }

  function applyTelegramTheme() {
    const params = tg?.themeParams || {};
    document.documentElement.dataset.theme = tg?.colorScheme === 'dark' ? 'dark' : 'light';
    if (params.bg_color) document.documentElement.style.setProperty('--tg-bg', params.bg_color);
    if (params.secondary_bg_color) document.documentElement.style.setProperty('--tg-secondary-bg', params.secondary_bg_color);
    if (params.text_color) document.documentElement.style.setProperty('--tg-text', params.text_color);
    if (params.hint_color) document.documentElement.style.setProperty('--tg-hint', params.hint_color);
    if (params.button_color) document.documentElement.style.setProperty('--accent', params.button_color);
    if (params.button_text_color) document.documentElement.style.setProperty('--button-text', params.button_text_color);
    if (params.destructive_text_color) document.documentElement.style.setProperty('--tg-destructive', params.destructive_text_color);
  }

  function updateBackButton() {
    if (!tg?.BackButton) return;
    if (state.history.length) tg.BackButton.show();
    else tg.BackButton.hide();
  }

  function getCatalogProducts() {
    return Core.getPublishedProducts(state.catalogProducts).map((product) => ({
      ...product,
      variants: product.variants.filter(({ enabled }) => enabled !== false),
    }));
  }

  function getProduct(productId) {
    return getCatalogProducts().find((product) => product.id === productId) || null;
  }

  function getActiveOrder() {
    return state.orders.find(({ id }) => id === state.activeOrderId) || null;
  }

  function replaceOrder(order) {
    state.orders = [order, ...state.orders.filter(({ id }) => id !== order.id)];
    state.activeOrderId = order.id;
  }

  function getProductGroup(product) {
    if (!product) return [];
    if (!product.groupId) return [product];
    return getCatalogProducts().filter((item) => item.groupId === product.groupId);
  }

  function getAdminProduct(productId) {
    return state.adminProducts.find((product) => product.id === productId) || null;
  }

  function createBlankAdminProduct() {
    return {
      id: `admin-${Date.now().toString(36)}`,
      name: '',
      sellerSku: '',
      wholesalePrice: null,
      supplier: '',
      category: 'all',
      categoryNew: '',
      price: '',
      oldPrice: null,
      badge: null,
      images: [],
      imagePaths: [],
      colors: [],
      sizes: [],
      description: '',
      composition: '',
      care: '',
      fit: '',
      model: '',
      measurements: {},
      variants: [],
      adminStatus: 'draft',
    };
  }

  function cloneAdminProduct(product) {
    return Core.createAdminCatalog([product])[0];
  }

  function startAdminDraft(product = null) {
    const restored = !product ? readAdminDraft() : null;
    state.adminDraft = product ? cloneAdminProduct(product) : restored?.draft || createBlankAdminProduct();
    state.adminStep = restored?.step || 1;
    state.adminDirty = Boolean(restored);
    state.adminErrors = {};
    state.adminSaveError = '';
    state.adminColorEmptyRows = 0;
    state.adminSizeEmptyRows = {};
    persistAdminDraft();
    navigate('seller-product-edit', { productId: state.adminDraft.id });
  }

  function getAdminCategories() {
    return state.adminCategories
      .filter((category, index, categories) => categories.findIndex(({ id }) => id === category.id) === index);
  }

  function normalizeAdminProductCategory(product) {
    const category = Core.createAdminCategory(product.category);
    return { ...product, category: category.id || 'all' };
  }

  function rebuildAdminCategories() {
    state.adminProducts = state.adminProducts.map(normalizeAdminProductCategory);
    state.adminCategories = state.adminProducts
      .filter((product) => product.category && product.category !== 'all')
      .map((product) => Core.createAdminCategory(product.category))
      .filter((category, index, categories) => categories.findIndex(({ id }) => id === category.id) === index);
  }

  function getColor(product, colorId) {
    return product.colors.find((color) => color.id === colorId) || null;
  }

  function getVariant(product, colorId, size) {
    return product.variants.find((variant) => (
      variant.colorId === colorId && variant.size === size
    )) || null;
  }

  function getVariantStock(item) {
    const product = getProduct(item.productId);
    return getVariant(product, item.colorId, item.size)?.stock || 0;
  }

  function prepareScreen(screen, params) {
    if (screen === 'product' && params.productId !== state.params.productId) {
      const product = getProduct(params.productId);
      state.selectedColorId = product?.colors[0]?.id || null;
      state.selectedSize = null;
    }
  }

  function navigate(screen, params = {}, options = {}) {
    prepareScreen(screen, params);
    if (options.root || ROOT_SCREENS.has(screen) && options.fromNav) state.history = [];
    else state.history.push({ screen: state.screen, params: state.params });
    state.screen = screen;
    state.params = params;
    render();
  }

  function goBack() {
    if (modalRoot.children.length) {
      closeSheet();
      return;
    }
    if (state.screen === 'seller-product-edit') {
      adminEditorBack();
      return;
    }
    const previous = state.history.pop();
    if (!previous) return;
    state.screen = previous.screen;
    state.params = previous.params;
    render();
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toastElement.textContent = message;
    toastElement.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toastElement.classList.remove('is-visible'), 2400);
  }

  function openSheet(content, { title = 'Панель' } = {}) {
    focusBeforeSheet = document.activeElement;
    appShell.inert = true;
    modalRoot.innerHTML = `
      <div class="sheet__backdrop" data-action="close-sheet"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="sheet__handle" aria-hidden="true"></div>
        <button class="icon-button sheet__close" type="button" data-action="close-sheet" aria-label="Закрыть">${icon('close')}</button>
        ${content}
      </section>`;
    modalRoot.querySelector('.sheet button, .sheet input, .sheet select')?.focus();
  }

  function closeSheet() {
    modalRoot.replaceChildren();
    appShell.inert = false;
    focusBeforeSheet?.focus();
  }

  function showFirstOpenOffer() {
    let storedValue = null;
    try {
      storedValue = window.localStorage.getItem(OFFER_KEY);
    } catch (_error) {
      storedValue = null;
    }
    if (!Core.shouldShowFirstOpenOffer(storedValue)) return;

    try {
      window.localStorage.setItem(OFFER_KEY, 'seen');
    } catch (_error) {
      // Оффер остаётся доступным, даже если браузер запретил localStorage.
    }

    focusBeforeSheet = document.activeElement;
    appShell.inert = true;
    modalRoot.innerHTML = `
      <div class="offer-overlay">
        <section class="offer-dialog" role="dialog" aria-modal="true" aria-labelledby="offer-title" aria-describedby="offer-description">
          <div class="offer-dialog__emoji" aria-hidden="true">🛍</div>
          <h2 id="offer-title">Добро пожаловать в «Выгодные покупки» 🛍</h2>
          <p id="offer-description">Здесь вы найдёте товары по приятным ценам и сможете оформить заказ в период закупа.</p>
          <ul class="offer-dialog__benefits">
            <li>Выгодные цены на женскую одежду</li>
            <li>Новинки и ближайшие закупки</li>
            <li>Новости и акции в Telegram</li>
          </ul>
          <button class="offer-dialog__cta" type="button" data-action="open-offer-bot">Получить скидку 15%</button>
          <button class="offer-dialog__skip" type="button" data-action="close-sheet">Пропустить</button>
        </section>
      </div>`;
    modalRoot.querySelector('.offer-dialog__cta')?.focus();
  }

  function openOfferBot() {
    closeSheet();
    if (tg?.openTelegramLink) tg.openTelegramLink(OFFER_BOT_URL);
    else window.location.assign(OFFER_BOT_URL);
  }

  function shareBot() {
    const shareUrl = Core.buildTelegramShareUrl(MAIN_APP_URL, SHARE_TEXT);
    if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
    else window.location.assign(shareUrl);
  }

  function handleModalKeydown(event) {
    const dialog = modalRoot.querySelector('.sheet, .offer-dialog');
    if (!dialog) return;
    if (event.key === 'Escape') {
      closeSheet();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
    )];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function pageHeader(title, subtitle = '') {
    return `
      <header class="page-header">
        ${state.history.length ? `<button class="icon-button" type="button" data-action="go-back" aria-label="Назад">${icon('chevron-left')}</button>` : ''}
        <div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div>
      </header>`;
  }

  function productBackHeader() {
    return state.history.length
      ? `<header class="page-header page-header--compact"><button class="icon-button" type="button" data-action="go-back" aria-label="Назад">${icon('chevron-left')}</button><span class="sr-only">Карточка товара</span></header>`
      : '';
  }

  function productCard(product) {
    const sizes = [...new Set(product.variants
      .filter((variant) => variant.enabled !== false && Number(variant.stock) > 0)
      .map(({ size }) => size))];
    const image = product.images?.[0] || 'assets/preorder-hero-bags.png';
    return `
      <article class="product-card card">
        <button class="product-card__open" type="button" data-action="open-product" data-product-id="${product.id}" aria-label="Открыть ${escapeHtml(product.name)}">
          <span class="product-card__media">
            <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" loading="eager" fetchpriority="high" decoding="async">
            ${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ''}
          </span>
          <span class="product-card__body">
            <strong>${escapeHtml(product.name)}</strong>
            <span class="price-row"><b>${money(product.price)}</b>${product.oldPrice ? `<s>${money(product.oldPrice)}</s>` : ''}</span>
            <small>${escapeHtml(product.colors[0]?.name || 'Цвет не указан')} · ${sizes.length ? `Размеры: ${sizes.join(', ')}` : 'Нет в наличии'}</small>
          </span>
        </button>
      </article>`;
  }

  function renderHome() {
    const terms = Object.values(Data.STORE.preorderTerms || {}).map((term) => `
      <li class="preorder-terms__item">${escapeHtml(term)}</li>`).join('');

    return `
      <header class="home-header">
        <div><p class="eyebrow">Здравствуйте, ${escapeHtml(getTelegramFirstName())}</p><h1>${Data.STORE.name}</h1></div>
        <div class="brand-mark brand-mark--small" aria-hidden="true">🛍</div>
      </header>
      <section class="hero card">
        <span class="hero__orb hero__orb--one" aria-hidden="true"></span>
        <span class="hero__orb hero__orb--two" aria-hidden="true"></span>
        <h2>${Data.STORE.tagline}</h2>
        <p>${escapeHtml(Data.STORE.description)}</p>
        <button class="secondary-button" type="button" data-action="navigate" data-screen="catalog">Открыть каталог</button>
      </section>
      <section class="preorder-summary" aria-label="Условия предзаказа">
        <ul class="preorder-terms preorder-terms--compact">${terms}</ul>
      </section>
      <button class="share-button" type="button" data-action="share-bot">${icon('share')}<span>Поделиться с другом</span></button>`;
  }

  function activeFilterChips() {
    const chips = [];
    if (state.filters.sizes.length) chips.push(`Размер: ${state.filters.sizes.join(', ')}`);
    if (state.filters.colors.length) {
      const names = state.filters.colors.map((id) => (
        getCatalogProducts().flatMap(({ colors }) => colors).find((color) => color.id === id)?.name || id
      ));
      chips.push(`Цвет: ${names.join(', ')}`);
    }
    if (state.filters.maxPrice != null) chips.push(`До ${money(state.filters.maxPrice)}`);
    if (state.filters.onlyNew) chips.push('Новинки');
    return chips.map((chip) => `<span class="filter-chip">${escapeHtml(chip)}</span>`).join('');
  }

  function renderCatalog() {
    const catalogProducts = getCatalogProducts();
    if (state.catalogStatus === 'loading' && !catalogProducts.length) {
      return `${pageHeader('Каталог')}<section class="loading-screen card"><p class="eyebrow">🛍 Выгодные покупки</p><h1>Загружаем каталог…</h1></section>`;
    }
    if (state.catalogStatus === 'error' && !catalogProducts.length) {
      return `${pageHeader('Каталог')}<section class="empty-state card"><span aria-hidden="true">${icon('info')}</span><h2>Каталог временно недоступен</h2><p>${escapeHtml(state.catalogError || 'Попробуй ещё раз через несколько секунд.')}</p><button class="primary-button" type="button" data-action="reload-catalog">Повторить</button></section>`;
    }
    if (!catalogProducts.length) {
      return `
        ${pageHeader('Каталог')}
        <section class="empty-state card"><span aria-hidden="true">${icon('grid')}</span><h2>Ассортимент скоро появится</h2><p>Следите за обновлениями — новые модели будут здесь.</p><button class="primary-button" type="button" data-action="navigate" data-screen="store">Условия предзаказа</button></section>`;
    }
    const products = Core.sortProducts(
      Core.filterProducts(catalogProducts, state.filters),
      state.sortId,
    );
    const categories = Data.CATEGORIES.map((category) => `
      <button class="chip ${state.filters.category === category.id ? 'is-active' : ''}" type="button" data-action="set-category" data-category="${category.id}">${escapeHtml(category.title)}</button>
    `).join('');

    return `
      ${pageHeader('Каталог', `${products.length} товаров`)}
      <div class="chip-strip" aria-label="Категории">${categories}</div>
      <div class="toolbar">
        <button class="toolbar-button" type="button" data-action="filters">Фильтры <span aria-hidden="true">${icon('chevron-down')}</span></button>
        <button class="toolbar-button" type="button" data-action="sort">Сортировка <span aria-hidden="true">${icon('chevron-down')}</span></button>
      </div>
      ${activeFilterChips() ? `<div class="active-filters">${activeFilterChips()}<button type="button" data-action="reset-filters">Сбросить</button></div>` : ''}
      ${products.length
        ? `<div class="product-grid">${products.map(productCard).join('')}</div>`
        : `<section class="empty-state card"><span aria-hidden="true">${icon('grid')}</span><h2>Таких товаров пока нет</h2><p>Попробуйте изменить размер, цвет или цену.</p><button class="primary-button" type="button" data-action="reset-filters">Сбросить фильтры</button></section>`}
    `;
  }

  function renderProduct(productId) {
    const product = getProduct(productId);
    if (!product) return renderNotFound();
    const galleryImages = Array.isArray(product.images) && product.images.length
      ? product.images
      : ['assets/preorder-hero-bags.png'];
    const groupedProducts = getProductGroup(product);
    const colorButtons = groupedProducts.map((option) => {
      const color = option.colors[0] || { id: option.id, name: 'Цвет' };
      const unavailable = !Core.hasAvailableVariant(option);
      return `
      <button class="color-button ${option.id === product.id ? 'is-active' : ''}${unavailable ? ' is-unavailable' : ''}" type="button" data-action="select-product-option" data-product-id="${escapeHtml(option.id)}" aria-pressed="${option.id === product.id}"${unavailable ? ' aria-disabled="true"' : ''}>
        <span style="--swatch:${color.hex || '#8e8e93'}" aria-hidden="true"></span>${escapeHtml(color.name)}
      </button>`;
    }).join('');
    const colorVariants = product.variants.filter(({ colorId }) => colorId === state.selectedColorId);
    const sizes = [...new Set(colorVariants.map(({ size }) => size).filter(Boolean))];
    const sizeButtons = sizes.map((size) => {
      const variant = state.selectedColorId ? getVariant(product, state.selectedColorId, size) : null;
      const unavailable = !Core.isVariantAvailable(variant);
      const status = !state.selectedColorId
        ? 'Выберите цвет'
        : unavailable ? 'Нет' : variant.stock === 1 ? 'Последний' : 'В наличии';
      return `
      <button class="size-button ${state.selectedSize === size ? 'is-active' : ''}" type="button" data-action="select-size" data-size="${size}" ${unavailable ? 'disabled' : ''} aria-pressed="${state.selectedSize === size}">
        <strong>${size}</strong><small>${status}</small>
      </button>`;
    }).join('');
    const selectedVariant = state.selectedColorId && state.selectedSize
      ? getVariant(product, state.selectedColorId, state.selectedSize)
      : null;
    const colorUnavailable = !Core.hasAvailableVariant(product, state.selectedColorId);
    const actionsDisabled = !Core.isVariantAvailable(selectedVariant);

    return `
      ${productBackHeader()}
      <section class="product-gallery card" aria-label="Фотографии ${escapeHtml(product.name)}">
        <div class="product-gallery__track">
          ${galleryImages.map((image, index) => `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)} — фото ${index + 1}" loading="eager" fetchpriority="${index ? 'auto' : 'high'}" decoding="async">`).join('')}
        </div>
        <div class="gallery-dots" aria-hidden="true">${galleryImages.map((_, index) => `<span class="gallery-dot${index === 0 ? ' is-active' : ''}"></span>`).join('')}</div>
        ${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ''}
      </section>
      <section class="product-info">
        <p class="eyebrow">${escapeHtml(getAdminCategories().find(({ id }) => id === product.category)?.title || '')}</p>
        <h1>${escapeHtml(product.name)}</h1>
        <div class="product-price"><b>${money(product.price)}</b>${product.oldPrice ? `<s>${money(product.oldPrice)}</s>` : ''}</div>
        <p>${escapeHtml(product.description)}</p>
      </section>
      <section class="choice-section" id="product-choice">
        <div class="section-heading"><h2>Цвет</h2><span>${escapeHtml(product.colors[0]?.name || 'Не указан')}</span></div>
        <div class="choice-grid choice-grid--colors">${colorButtons}</div>
        <div class="section-heading"><h2>Размер</h2></div>
        <div class="choice-grid choice-grid--sizes ${sizes.length === 1 ? 'choice-grid--single' : sizes.length > 1 ? 'choice-grid--compact' : ''}">${sizeButtons}</div>
        ${colorUnavailable ? '<p class="choice-hint choice-hint--unavailable">Для этого цвета доступных размеров нет.</p>' : ''}
        ${selectedVariant?.stock === 1 ? '<p class="low-stock-text">Осталась 1 шт.</p>' : ''}
      </section>
      <div class="product-actions">
        <button class="secondary-button" type="button" data-action="add-to-cart" ${actionsDisabled ? 'disabled' : ''}>В корзину</button>
        <button class="primary-button" type="button" data-action="buy-now" ${actionsDisabled ? 'disabled' : ''}>Купить сейчас</button>
        <button class="product-actions__cart" type="button" data-action="navigate" data-screen="cart">Перейти в корзину</button>
      </div>`;
  }

  function renderCart() {
    if (!state.cart.length) {
      return `
        ${pageHeader('Корзина')}
        <section class="empty-state card"><span aria-hidden="true">${icon('bag')}</span><h2>Корзина пока пуста</h2><p>Выберите цвет и размер — мы сохраним вещи здесь.</p><button class="primary-button" type="button" data-action="navigate" data-screen="catalog">Перейти в каталог</button></section>`;
    }
    const summary = Core.getCartSummary(state.cart, 0);
    const items = state.cart.map((item) => `
      <article class="cart-item card">
        <button class="cart-item__image" type="button" data-action="open-product" data-product-id="${item.productId}" aria-label="Открыть ${escapeHtml(item.name)}"><img src="${escapeHtml(getProductImage(item))}" alt="${escapeHtml(item.name)}"></button>
        <div class="cart-item__body">
          <strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.colorName)}, ${escapeHtml(item.size)}</small><b>${money(item.price)}</b>
          <div class="quantity-control" aria-label="Количество ${escapeHtml(item.name)}">
            <button type="button" data-action="cart-decrease" data-key="${item.key}" aria-label="Уменьшить количество">${icon('minus')}</button>
            <span>${item.quantity}</span>
            <button type="button" data-action="cart-increase" data-key="${item.key}" aria-label="Увеличить количество">${icon('plus')}</button>
          </div>
          <button class="remove-button" type="button" data-action="cart-remove" data-key="${item.key}">Удалить</button>
        </div>
      </article>`).join('');

    return `
      ${pageHeader('Корзина', `${summary.itemCount} ${summary.itemCount === 1 ? 'товар' : 'товара'}`)}
      <div class="cart-list">${items}</div>
      <section class="summary-card card">
        <div><span>Товары</span><b>${money(summary.subtotal)}</b></div><div class="summary-total"><span>Итого</span><b>${money(summary.total)}</b></div>
        <button class="primary-button" type="button" data-action="checkout-start">Оформить заказ</button>
        <button class="text-button text-button--center" type="button" data-action="navigate" data-screen="catalog">Продолжить покупки</button>
      </section>`;
  }

  function orderStatus(order) {
    if (order.orderType === 'server' && order.status === 'demo') {
      return { title: 'Заказ создан', text: 'Мы свяжемся с вами для подтверждения.', className: 'demo' };
    }
    if (order.orderType !== 'server' || order.status === 'draft') {
      return { title: 'Ожидает подтверждения', text: 'Мы уточняем детали заказа.', className: 'draft' };
    }
    if (order.status === 'pending_payment') {
      return { title: 'Ожидает подтверждения', text: 'Мы уточняем детали заказа.', className: 'paid' };
    }
    return order.status === 'ready'
      ? { title: 'Заказ собран', text: order.delivery.id === 'pickup' ? 'Ждёт вас в магазине' : 'Готов к передаче в доставку', className: 'ready' }
      : { title: 'Оплачен, собираем', text: 'Сообщим, когда всё будет готово', className: 'paid' };
  }

  function renderOrders() {
    if (!state.orders.length) {
      return `
        ${pageHeader('Заказы')}
        <section class="empty-state card"><span aria-hidden="true">${icon('receipt')}</span><h2>Заказов пока нет</h2><p>Оформленные заказы появятся здесь.</p><button class="primary-button" type="button" data-action="navigate" data-screen="catalog">Перейти в каталог</button></section>`;
    }
    return `
      ${pageHeader('Заказы', `${state.orders.length} ${state.orders.length === 1 ? 'заказ' : 'заказа'}`)}
      <div class="order-list">${state.orders.map((order) => {
        const status = orderStatus(order);
        return `<button class="order-card card" type="button" data-action="open-order" data-order-id="${escapeHtml(order.id)}">
          <span class="status-pill status-pill--${status.className}">${status.title}</span>
          <span class="order-card__top"><strong>Заказ ${escapeHtml(order.id)}</strong><b>${money(order.total)}</b></span>
          <span>${escapeHtml(status.text)}</span><small>${order.items.length} позиций · ${escapeHtml(order.delivery.title)}</small>
        </button>`;
      }).join('')}</div>`;
  }

  function renderStore() {
    const information = Data.STORE.information;
    return `
      ${pageHeader('Информация')}
      <section class="information-intro card">
        <span class="information-intro__mark" aria-hidden="true">✦</span>
        <p class="eyebrow">Для вас</p>
        <h2>${escapeHtml(information.title)}</h2>
        <p>${escapeHtml(information.intro)}</p>
      </section>
      <section class="information-list" aria-label="Информация о покупках">
        <article class="information-item card"><span class="information-item__icon" aria-hidden="true">↗</span><div><h3>Как проходят закупки</h3><p>${escapeHtml(information.purchasing)}</p></div></article>
        <article class="information-item card"><span class="information-item__icon" aria-hidden="true">₽</span><div><h3>Выгодные цены</h3><p>${escapeHtml(information.prices)}</p></div></article>
        <article class="information-item card"><span class="information-item__icon" aria-hidden="true">♡</span><div><h3>Развиваемся вместе</h3><p>${escapeHtml(information.future)}</p></div></article>
        <article class="information-item card"><span class="information-item__icon" aria-hidden="true">✦</span><div><h3>Больше пользы впереди</h3><p>${escapeHtml(information.benefits)}</p></div></article>
      </section>
      <button class="secondary-button full-width" type="button" data-action="open-seller-demo">Войти в админ</button>`;
  }

  function renderNotFound() {
    return `${pageHeader('Не найдено')}<section class="empty-state card"><h2>Экран не найден</h2><button class="primary-button" type="button" data-action="navigate" data-screen="home">На главную</button></section>`;
  }

  function checkoutProgress(current) {
    return `<div class="checkout-progress" aria-label="Шаг ${current} из 3">${[1, 2, 3].map((step) => `<span class="${step <= current ? 'is-active' : ''}">${step}</span>`).join('')}</div>`;
  }

  function formatItemCount(count) {
    const remainder = count % 100;
    const lastDigit = count % 10;
    const word = remainder >= 11 && remainder <= 19
      ? 'товаров'
      : lastDigit === 1
        ? 'товар'
        : lastDigit >= 2 && lastDigit <= 4
          ? 'товара'
          : 'товаров';
    return `${count} ${word}`;
  }

  function renderCheckoutItems(summary = Core.getCartSummary(state.cart, 0)) {
    const items = state.cart.map((item) => `
      <li>
        <img src="${escapeHtml(getProductImage(item))}" alt="${escapeHtml(item.name)}">
        <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.colorName)}, ${escapeHtml(item.size)} · ${item.quantity} шт.</small></span>
        <b>${money(item.price * item.quantity)}</b>
        <button class="remove-button checkout-items-disclosure__remove" type="button" data-action="cart-remove" data-key="${escapeHtml(item.key)}">Удалить</button>
      </li>`).join('');
    return `
      <details class="checkout-items-disclosure">
        <summary data-checkout-items-toggle><span>${formatItemCount(summary.itemCount)}</span><b>${money(summary.subtotal)}</b><span class="checkout-items-disclosure__arrow" aria-hidden="true">⌄</span></summary>
        <ul class="review-items">${items}</ul>
      </details>`;
  }

  function renderCheckoutContact() {
    const summary = Core.getCartSummary(state.cart, 0);
    return `
      ${pageHeader('Контакты', 'Шаг 1 из 3')}
      ${checkoutProgress(1)}
      <section class="checkout-summary card">${renderCheckoutItems(summary)}</section>
      <form id="contact-form" class="form-card card" novalidate>
        <label><span>Имя</span><input name="name" type="text" autocomplete="name" maxlength="60" value="${escapeHtml(state.customer.name)}" placeholder="Как к вам обращаться" required></label>
        <label><span>Телефон</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" value="${escapeHtml(state.customer.phone)}" placeholder="+7 999 000-00-00" required aria-describedby="phone-help phone-error"></label>
        <small id="phone-help">Телефон нужен для выдачи или доставки.</small>
        <p id="phone-error" class="field-error" role="alert" hidden>Введите телефон: от 10 до 20 цифр и разрешённых символов.</p>
        <button class="primary-button" type="submit">Продолжить</button>
      </form>`;
  }

  function renderCheckoutDelivery() {
    const methods = Data.DELIVERY_METHODS.map((method) => `
      <button class="delivery-card card ${state.delivery?.id === method.id ? 'is-active' : ''}" type="button" data-action="choose-delivery" data-delivery-id="${method.id}" aria-pressed="${state.delivery?.id === method.id}">
        <span class="delivery-card__icon" aria-hidden="true">${icon(method.id === 'pickup' ? 'map-pin' : 'truck')}</span>
        <span><strong>${escapeHtml(method.title)}</strong><small>${escapeHtml(method.description)}</small></span>
        <span class="delivery-card__price">${method.price ? money(method.price) : 'Бесплатно'}</span>
      </button>`).join('');
    const subtotal = Core.getCartSummary(state.cart, 0).subtotal;
    const deliveryPrice = state.delivery?.price || 0;
    return `
      ${pageHeader('Получение', 'Шаг 2 из 3')}
      ${checkoutProgress(2)}
      <section class="checkout-summary card">${renderCheckoutItems({ ...Core.getCartSummary(state.cart, 0) })}</section>
      <div class="delivery-list">${methods}</div>
      <section class="notice-card"><span aria-hidden="true">${icon('info')}</span><p>Адрес, стоимость и сроки указаны предварительно.</p></section>
      <section class="sticky-checkout">
        <div><span>Итого</span><b>${money(subtotal + deliveryPrice)}</b></div>
        <button class="primary-button" type="button" data-action="delivery-continue" ${state.delivery ? '' : 'disabled'}>Продолжить</button>
      </section>`;
  }

  function renderCheckoutReview() {
    if (!state.delivery) return renderCheckoutDelivery();
    const summary = Core.getCartSummary(state.cart, state.delivery.price);
    return `
      ${pageHeader('Проверка заказа', 'Шаг 3 из 3')}
      ${checkoutProgress(3)}
      <section class="review-section card"><div class="review-heading"><h2>Товары</h2><button type="button" data-action="navigate" data-screen="cart">Изменить</button></div>${renderCheckoutItems(summary)}</section>
      <section class="review-section card"><div class="review-heading"><h2>Контакты</h2><button type="button" data-action="edit-contact">Изменить</button></div><p><strong>${escapeHtml(state.customer.name)}</strong><br>${escapeHtml(state.customer.phone)}</p></section>
      <section class="review-section card"><div class="review-heading"><h2>Получение</h2><button type="button" data-action="edit-delivery">Изменить</button></div><p><strong>${escapeHtml(state.delivery.title)}</strong><br>${escapeHtml(state.delivery.description)}</p></section>
      <section class="summary-card card">
        <div><span>Товары</span><b>${money(summary.subtotal)}</b></div>
        <div><span>Получение</span><b>${summary.deliveryPrice ? money(summary.deliveryPrice) : 'Бесплатно'}</b></div>
        <div class="summary-total"><span>Итого</span><b>${money(summary.total)}</b></div>
        <button class="primary-button" type="button" data-action="request-payment">Оформить заказ ${money(summary.total)}</button>
      </section>`;
  }

  function renderPaymentSuccess() {
    const order = getActiveOrder();
    if (!order) return renderNotFound();
    return `
      <section class="success-screen">
        <div class="success-mark" aria-hidden="true">${icon('check')}</div>
        <h1>Заказ создан</h1>
        <p>Мы свяжемся с вами для подтверждения.</p>
        <section class="success-card card"><span>Заказ</span><strong>${escapeHtml(order.id)}</strong><span>Статус</span><strong>${escapeHtml(orderStatus(order).title)}</strong><span>Итого</span><strong>${money(order.total)}</strong></section>
        <section class="review-section card"><h2>Состав заказа</h2><ul class="review-items">${orderItems(order)}</ul></section>
        <button class="primary-button" type="button" data-action="open-order">Открыть заказ</button>
        <button class="text-button text-button--center" type="button" data-action="navigate" data-screen="catalog">Вернуться в каталог</button>
      </section>`;
  }

  function orderItems(order) {
    return order.items.map((item) => `
      <li class="order-item"><img class="order-item-image" src="${escapeHtml(getOrderItemImage(item))}" alt="${escapeHtml(item.name)}" data-order-item-image><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.colorName)}, ${escapeHtml(item.size)} · ${item.quantity} шт.</small></span><b>${money(item.price * item.quantity)}</b></li>`).join('');
  }

  function getOrderItemImage(item) {
    return getProductImage(item);
  }

  function getProductImage(item) {
    return getProduct(item?.productId)?.images?.[0]
      || item?.image
      || getAdminProduct(item?.productId)?.images?.[0]
      || 'assets/preorder-hero-bags.png';
  }

  function renderOrderDetail() {
    const order = getActiveOrder();
    if (!order) return renderNotFound();
    const status = orderStatus(order);
    return `
      ${pageHeader(`Заказ ${order.id}`)}
      <section class="order-status-card order-status-card--${status.className} card"><span class="status-pill status-pill--${status.className}">${status.title}</span><h2>${escapeHtml(status.text)}</h2><p>Состав и итог подтверждены при создании заказа.</p></section>
      <section class="review-section card"><h2>Состав</h2><ul class="review-items">${orderItems(order)}</ul></section>
      <section class="info-list card">
        <div><span aria-hidden="true">${icon('map-pin')}</span><p><strong>${escapeHtml(order.delivery.title)}</strong><small>${escapeHtml(order.delivery.description)}</small></p></div>
        <div><span aria-hidden="true">₽</span><p><strong>${money(order.total)}</strong><small>Итог заказа</small></p></div>
      </section>
      <button class="secondary-button full-width" type="button" data-action="demo-contact">Связаться с магазином</button>`;
  }

  function sellerShell(section, content) {
    state.sellerSection = section;
    return `
      <div class="seller-shell">
        <header class="seller-header">
          <div><p class="eyebrow">Управление магазином</p><h1>🛍 Выгодные покупки</h1></div>
          <button class="secondary-button" type="button" data-action="exit-seller">В магазин</button>
        </header>
        <nav class="seller-main-tabs" aria-label="Разделы админ-панели">
          <button class="${section === 'products' ? 'is-active' : ''}" type="button" data-action="set-seller-section" data-section="products" aria-current="${section === 'products' ? 'page' : 'false'}">Товары</button>
          <button class="${section === 'orders' ? 'is-active' : ''}" type="button" data-action="set-seller-section" data-section="orders" aria-current="${section === 'orders' ? 'page' : 'false'}">Заказы</button>
          <button class="${section === 'users' ? 'is-active' : ''}" type="button" data-action="set-seller-section" data-section="users" aria-current="${section === 'users' ? 'page' : 'false'}">Пользователи</button>
        </nav>
        ${content}
      </div>`;
  }

  function renderSellerAccess() {
    if (state.sellerAuthStatus === 'loading') return `<section class="seller-access"><div class="brand-mark" aria-hidden="true">🛍</div><p class="eyebrow">Проверка доступа</p><h1>Подключаем панель</h1><p>Проверяю настоящий Telegram-сеанс и загружаю товары.</p></section>`;
    if (state.sellerAuthStatus === 'error') return `<section class="seller-access"><div class="brand-mark" aria-hidden="true">🛍</div><p class="eyebrow">Доступ закрыт</p><h1>Не удалось открыть панель</h1><section class="notice-card"><span aria-hidden="true">${icon('info')}</span><p>${escapeHtml(state.sellerAuthError || 'Открой Mini App из Telegram и повтори вход.')}</p></section><button class="primary-button full-width" type="button" data-action="enter-seller">Повторить</button><button class="text-button text-button--center" type="button" data-action="exit-seller">Вернуться в магазин</button></section>`;
    return `
      <section class="seller-access">
        <div class="brand-mark" aria-hidden="true">🛍</div>
        <p class="eyebrow">Закрытая зона</p>
        <h1>Управление магазином</h1>
        <p>Панель доступна только авторизованному продавцу в Telegram.</p>
        <section class="notice-card"><span aria-hidden="true">${icon('lock')}</span><p><strong>Закрытая зона.</strong> Доступ проверяется по Telegram-сеансу.</p></section>
        <button class="primary-button full-width" type="button" data-action="enter-seller">Войти через Telegram</button>
        <button class="text-button text-button--center" type="button" data-action="exit-seller">Вернуться в магазин</button>
      </section>`;
  }

  function adminStatusMeta(product) {
    const status = Core.getAdminProductStatus(product);
    if (status === 'archived') return { label: 'В архиве', className: 'archived' };
    if (status === 'draft') return { label: 'Черновик', className: 'draft' };
    if (status === 'out') return { label: 'Нет в наличии', className: 'out' };
    return { label: 'Опубликован', className: 'published' };
  }

  function renderAdminProductRow(product) {
    const status = adminStatusMeta(product);
    const stock = product.variants.reduce((sum, variant) => (
      variant.enabled === false ? sum : sum + Number(variant.stock || 0)
    ), 0);
    const image = product.images[0]
      ? `<img src="${escapeHtml(product.images[0])}" alt="">`
      : `<span class="admin-product-row__placeholder" aria-hidden="true">${icon('image')}</span>`;
    return `
      <article class="admin-product-row card">
        <button class="admin-product-row__open" type="button" data-action="edit-admin-product" data-product-id="${escapeHtml(product.id)}">
          <span class="admin-product-row__image">${image}</span>
          <span class="admin-product-row__content">
            <strong>${escapeHtml(product.name || 'Без названия')}</strong>
            <small>${product.sellerSku ? `Артикул: ${escapeHtml(product.sellerSku)} · ` : ''}${product.price ? money(product.price) : 'Цена не указана'} · ${product.colors.length} ${product.colors.length === 1 ? 'цвет' : 'цвета'}</small>
            <span>Остаток: <b>${stock}</b> · изменить в карточке</span>
            <em class="admin-status admin-status--${status.className}">${status.label}</em>
          </span>
        </button>
        <button class="icon-button admin-product-row__more" type="button" data-action="admin-product-menu" data-product-id="${escapeHtml(product.id)}" aria-label="Действия с товаром ${escapeHtml(product.name || 'Без названия')}">${icon('more')}</button>
      </article>`;
  }

  function renderSellerProducts() {
    const products = Core.filterAdminProducts(
      state.adminProducts,
      state.adminQuery,
      state.adminFilter,
      {
        category: state.adminCategory,
        supplier: state.adminSupplier,
        availability: state.adminAvailability,
        onlyNew: state.adminOnlyNew,
      },
    );
    const filters = [
      { id: 'all', label: 'Все' },
      { id: 'published', label: 'Опубликованы' },
      { id: 'draft', label: 'Черновики' },
      { id: 'out', label: 'Нет в наличии' },
    ];
    const categories = getAdminCategories();
    const suppliers = [...new Set(state.adminProducts
      .map((product) => String(product.supplier || '').trim())
      .filter(Boolean))].sort((left, right) => left.localeCompare(right, 'ru-RU'));
    const content = `
      <section class="admin-section-heading">
        <div><p class="eyebrow">Ассортимент</p><h2>Товары</h2><p>${state.adminProducts.length} позиций в каталоге</p></div>
        <button class="primary-button admin-add-button" type="button" data-action="add-admin-product">${icon('plus')}<span>Добавить товар</span></button>
      </section>
      <label class="admin-search">
        <span aria-hidden="true">${icon('search')}</span>
        <span class="sr-only">Поиск по названию</span>
        <input type="search" data-action="admin-search" value="${escapeHtml(state.adminQuery)}" placeholder="Найти товар" autocomplete="off">
      </label>
      <div class="admin-filter-strip" aria-label="Статус товара">${filters.map((filter) => `
        <button class="${state.adminFilter === filter.id ? 'is-active' : ''}" type="button" data-action="set-admin-filter" data-filter="${filter.id}" aria-pressed="${state.adminFilter === filter.id}">${filter.label}</button>
      `).join('')}</div>
      <div class="admin-filter-tools">
        <label class="admin-filter-select"><span class="sr-only">Категория</span><select data-action="set-admin-category"><option value="all">Все категории</option>${categories.map((category) => `<option value="${category.id}" ${state.adminCategory === category.id ? 'selected' : ''}>${escapeHtml(category.title)}</option>`).join('')}</select></label>
        <label class="admin-filter-select"><span class="sr-only">Поставщик</span><select data-action="set-admin-supplier"><option value="all">Все поставщики</option>${suppliers.map((supplier) => `<option value="${escapeHtml(supplier)}" ${state.adminSupplier === supplier ? 'selected' : ''}>${escapeHtml(supplier)}</option>`).join('')}</select></label>
        ${['all', 'in-stock', 'out-of-stock'].map((id) => `<button class="filter-chip ${state.adminAvailability === id ? 'is-active' : ''}" type="button" data-action="set-admin-availability" data-availability="${id}">${id === 'all' ? 'Любое наличие' : id === 'in-stock' ? 'В наличии' : 'Нет остатка'}</button>`).join('')}
        <button class="filter-chip ${state.adminOnlyNew ? 'is-active' : ''}" type="button" data-action="toggle-admin-new" aria-pressed="${state.adminOnlyNew}">Новинки</button>
      </div>
      ${products.length
        ? `<div class="admin-product-list">${products.map(renderAdminProductRow).join('')}</div>`
        : `<section class="empty-state card"><span aria-hidden="true">${icon('package')}</span><h2>${state.adminProducts.length ? 'Ничего не найдено' : 'Товаров пока нет'}</h2><p>${state.adminProducts.length ? 'Измени запрос или выбери другой статус.' : 'Добавь первый товар — он сохранится как черновик.'}</p><button class="primary-button" type="button" data-action="add-admin-product">Добавить товар</button></section>`}
      <section class="notice-card"><span aria-hidden="true">${icon('info')}</span><p>Товары и остатки сохраняются и доступны после обновления на другом устройстве.</p></section>`;
    return sellerShell('products', content);
  }

  function adminProgress() {
    const labels = ['Фото', 'Данные', 'Варианты', 'Проверка'];
    return `
      <div class="admin-progress" aria-label="Шаг ${state.adminStep} из 4">
        <div class="admin-progress__top"><strong>Шаг ${state.adminStep} из 4</strong><span>${labels[state.adminStep - 1]}</span></div>
        <div class="admin-progress__track"><span style="--progress:${state.adminStep * 25}%"></span></div>
        <div class="admin-progress__labels">${labels.map((label, index) => `<span class="${index + 1 <= state.adminStep ? 'is-active' : ''}">${label}</span>`).join('')}</div>
      </div>`;
  }

  function adminFieldError(name) {
    return state.adminErrors[name]
      ? `<p class="field-error" role="alert">${escapeHtml(state.adminErrors[name])}</p>`
      : '';
  }

  function adminEditorHeader() {
    return `
      <header class="admin-editor-header">
        <button class="icon-button" type="button" data-action="admin-editor-back" aria-label="Назад">${icon('chevron-left')}</button>
        <div><p class="eyebrow">${state.adminDraft?.adminStatus === 'published' ? 'Редактирование' : 'Новый товар'}</p><h1>${escapeHtml(state.adminDraft?.name || 'Без названия')}</h1></div>
      </header>`;
  }

  function renderAdminStepOne(product) {
    const photos = product.images.map((image, index) => `
      <figure class="admin-photo">
        <img src="${escapeHtml(image)}" alt="Фото товара ${index + 1}">
        ${index === 0 ? '<figcaption>Главное</figcaption>' : `<button type="button" data-action="admin-photo-main" data-index="${index}">Сделать главной</button>`}
        <button class="icon-button" type="button" data-action="admin-photo-remove" data-index="${index}" aria-label="Удалить фото ${index + 1}">${icon('close')}</button>
      </figure>`).join('');
    const categories = getAdminCategories().map((category) => `
      <option value="${category.id}" ${product.category === category.id ? 'selected' : ''}>${escapeHtml(category.title)}</option>`).join('');
    return `
      <form id="admin-product-form" class="admin-editor-form" data-step="1" novalidate>
        <section class="admin-form-section card">
          <div class="admin-form-heading"><div><p class="eyebrow">Сначала образ</p><h2>Фото товара</h2></div><span>${product.images.length}/4</span></div>
          ${photos ? `<div class="admin-photo-grid">${photos}</div>` : `<div class="admin-photo-empty">${icon('image')}<strong>Добавь фотографию</strong><span>Вертикальное фото лучше покажет одежду</span></div>`}
          ${adminFieldError('images')}
          <div class="admin-photo-actions">
            <label class="secondary-button">${icon('camera')}<span>Камера</span><input class="sr-only" type="file" accept="image/*" capture="environment" data-action="admin-photo-input"></label>
            <label class="secondary-button">${icon('image')}<span>Из галереи</span><input class="sr-only" type="file" accept="image/*" multiple data-action="admin-photo-input"></label>
          </div>
          <small>До 4 фотографий, каждая не больше 800 КБ.</small>
        </section>
        <section class="admin-form-section card">
          <label><span>Название товара</span><input name="name" type="text" maxlength="80" value="${escapeHtml(product.name)}" placeholder="Например, Платье Миди" autocomplete="off"></label>
          ${adminFieldError('name')}
          <label><span>Артикул продавца</span><input name="sellerSku" type="text" maxlength="40" value="${escapeHtml(product.sellerSku)}" placeholder="Например, DR-204" autocomplete="off"></label>
          <label><span>Категория</span><select name="category">${categories}</select></label>
        </section>
        ${adminEditorActions('Продолжить')}
      </form>`;
  }

  function renderAdminStepTwo(product) {
    return `
      <form id="admin-product-form" class="admin-editor-form" data-step="2" novalidate>
        <section class="admin-form-section card">
          <div class="admin-form-heading"><div><p class="eyebrow">Покупатель увидит</p><h2>Цена и описание</h2></div></div>
          <div class="admin-price-grid">
            <label><span>Цена, ₽</span><input name="price" type="number" min="1" step="1" inputmode="numeric" value="${product.price || ''}" placeholder="5990"></label>
            <label><span>Старая цена, ₽</span><input name="oldPrice" type="number" min="1" step="1" inputmode="numeric" value="${product.oldPrice || ''}" placeholder="Необязательно"></label>
            <label><span>Опт, ₽</span><input name="wholesalePrice" type="number" min="1" step="1" inputmode="numeric" value="${product.wholesalePrice || ''}" placeholder="Необязательно"></label>
            <label><span>Поставщик</span><input name="supplier" type="text" maxlength="80" value="${escapeHtml(product.supplier)}" placeholder="Например, Milan Fashion" autocomplete="off"></label>
          </div>
          ${adminFieldError('price')}${adminFieldError('oldPrice')}
          <label><span>Описание</span><textarea name="description" rows="4" maxlength="500" placeholder="Крой, длина и главные детали">${escapeHtml(product.description)}</textarea></label>
          <label><span>Состав</span><input name="composition" type="text" maxlength="180" value="${escapeHtml(product.composition)}" placeholder="Вискоза 70%, полиэстер 30%"></label>
          <label><span>Посадка</span><input name="fit" type="text" maxlength="180" value="${escapeHtml(product.fit)}" placeholder="Свободная, размер в размер"></label>
          <label><span>Уход</span><input name="care" type="text" maxlength="180" value="${escapeHtml(product.care)}" placeholder="Деликатная стирка при 30 °C"></label>
        </section>
        ${adminEditorActions('Продолжить')}
      </form>`;
  }

  function renderAdminStepThree(product) {
    const colorChips = ADMIN_COLORS.map((color) => {
      const selected = product.colors.some(({ id }) => id === color.id);
      return `<button class="color-button ${selected ? 'is-active' : ''}" type="button" data-action="toggle-admin-color" data-color-id="${color.id}" aria-pressed="${selected}"><span style="--swatch:${color.hex}" aria-hidden="true"></span>${color.name}</button>`;
    }).join('');
    const sizeChips = ADMIN_SIZES.map((size) => `
      <button class="chip ${product.sizes.includes(size) ? 'is-active' : ''}" type="button" data-action="toggle-admin-size" data-size="${size}" aria-pressed="${product.sizes.includes(size)}">${size}</button>`).join('');
    const groups = product.colors.map((color) => {
      const variants = product.variants.filter(({ colorId }) => colorId === color.id);
      return `
        <details class="admin-variant-group card" open>
          <summary><span><i style="--swatch:${color.hex}"></i><strong>${escapeHtml(color.name)}</strong></span><small>${variants.filter(({ enabled }) => enabled !== false).length} вариантов</small></summary>
          <div>${variants.map((variant) => `
            <label class="admin-variant-row ${variant.enabled === false ? 'is-disabled' : ''}">
              <button type="button" data-action="toggle-admin-variant" data-color-id="${variant.colorId}" data-size="${variant.size}" aria-pressed="${variant.enabled !== false}">${variant.enabled === false ? 'Выкл.' : 'Вкл.'}</button>
              <strong>${variant.size}</strong>
              <span>Остаток</span>
              <input type="number" min="0" step="1" inputmode="numeric" value="${variant.stock}" data-action="admin-stock" data-color-id="${variant.colorId}" data-size="${variant.size}" ${variant.enabled === false ? 'disabled' : ''} aria-label="Остаток ${escapeHtml(color.name)}, размер ${variant.size}">
            </label>`).join('')}</div>
        </details>`;
    }).join('');
    return `
      <form id="admin-product-form" class="admin-editor-form" data-step="3" novalidate>
        <section class="admin-form-section card">
          <div class="admin-form-heading"><div><p class="eyebrow">Количество товара</p><h2>Остатки по вариантам</h2><p>Введи число отдельно для каждого цвета и размера.</p></div><span>${product.variants.length} вариантов</span></div>
          <fieldset><legend>Цвета</legend><div class="choice-grid choice-grid--colors">${colorChips}</div>${adminFieldError('colors')}</fieldset>
          <fieldset><legend>Размеры</legend><div class="choice-grid choice-grid--compact">${sizeChips}</div>${adminFieldError('sizes')}</fieldset>
        </section>
        ${groups || '<section class="empty-state card"><span aria-hidden="true">' + icon('grid') + '</span><h2>Выбери цвета и размеры</h2><p>Приложение само создаст все сочетания.</p></section>'}
        ${adminFieldError('variants')}
        ${adminEditorActions('Продолжить')}
      </form>`;
  }

  function adminProductPreview(product) {
    const sizes = [...new Set(product.variants.filter((variant) => variant.enabled !== false).map(({ size }) => size))];
    const colors = product.colors.map((color) => {
      const unavailable = !Core.hasAvailableVariant(product, color.id);
      return `<span class="color-button${unavailable ? ' is-unavailable' : ''}"${unavailable ? ' aria-disabled="true"' : ''}><span style="--swatch:${color.hex}" aria-hidden="true"></span>${escapeHtml(color.name)}</span>`;
    }).join('');
    return `
      <article class="admin-preview-card card">
        <div class="admin-preview-card__media">${product.images[0] ? `<img src="${escapeHtml(product.images[0])}" alt="${escapeHtml(product.name)}">` : icon('image')}</div>
        <div class="admin-preview-card__body">
          <p class="eyebrow">${escapeHtml(getAdminCategories().find(({ id }) => id === product.category)?.title || 'Без категории')}</p>
          <h2>${escapeHtml(product.name || 'Без названия')}</h2>
          <p class="product-price"><b>${product.price ? money(product.price) : 'Цена не указана'}</b>${product.oldPrice ? `<s>${money(product.oldPrice)}</s>` : ''}</p>
          ${product.sellerSku ? `<p class="choice-hint">Артикул: ${escapeHtml(product.sellerSku)}</p>` : ''}
          <p>${escapeHtml(product.description || 'Описание пока не добавлено.')}</p>
          <div class="choice-grid choice-grid--colors">${colors}</div>
          <p class="choice-hint">Размеры: ${sizes.length ? sizes.join(', ') : 'не указаны'}</p>
        </div>
      </article>`;
  }

  function renderAdminStepFour(product) {
    const errors = Core.validateAdminProduct(product, 4);
    const errorEntries = Object.values(errors);
    const finalActions = product.adminStatus === 'published'
      ? `<div class="admin-editor-actions"><span></span><button class="primary-button" type="button" data-action="save-admin-changes" ${errorEntries.length ? 'disabled' : ''}>Сохранить изменения</button></div>`
      : `<div class="admin-editor-actions admin-editor-actions--final"><button class="secondary-button" type="button" data-action="save-admin-draft">Сохранить черновик</button><button class="primary-button" type="button" data-action="publish-admin-product" ${errorEntries.length ? 'disabled' : ''}>Опубликовать</button></div>`;
    return `
      <section class="admin-editor-form">
        <div class="admin-preview-switch" role="group" aria-label="Режим просмотра"><span>Редактор</span><strong>Как увидит покупатель</strong></div>
        ${adminProductPreview(product)}
        ${errorEntries.length ? `<section class="admin-validation card"><h2>Перед публикацией исправь</h2><ul>${errorEntries.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul><button class="secondary-button full-width" type="button" data-action="admin-fix-errors">Исправить</button></section>` : '<section class="notice-card notice-card--success"><span aria-hidden="true">' + icon('check') + '</span><p>Карточка заполнена и готова к публикации.</p></section>'}
        ${finalActions}
      </section>`;
  }

  function adminEditorActions(primaryLabel) {
    const saveAction = state.adminDraft?.adminStatus === 'published'
      ? '<button class="text-button" type="button" data-action="save-admin-changes">Сохранить изменения</button>'
      : '<button class="text-button" type="button" data-action="save-admin-draft">Сохранить черновик</button>';
    return `
      <div class="admin-editor-actions">
        ${saveAction}
        <button class="primary-button" type="submit">${primaryLabel}</button>
      </div>`;
  }

  function renderAdminEditor() {
    const product = state.adminDraft || createBlankAdminProduct();
    const photos = product.images.map((image, index) => `
      <figure class="admin-photo">
        <img src="${escapeHtml(image)}" alt="Фото товара ${index + 1}">
        ${index === 0 ? '<figcaption>Главное</figcaption>' : `<button type="button" data-action="admin-photo-main" data-index="${index}">Сделать главной</button>`}
        <button class="icon-button" type="button" data-action="admin-photo-remove" data-index="${index}" aria-label="Удалить фото ${index + 1}">${icon('close')}</button>
      </figure>`).join('');
    const categories = getAdminCategories().map((category) => `
      <option value="${category.id}" ${product.category === category.id ? 'selected' : ''}>${escapeHtml(category.title)}</option>`).join('');
    const renderColorFields = (color, index, isNew = false) => {
      const variants = product.variants.filter(({ colorId }) => colorId === color.id);
      const emptySizeCount = isNew ? 1 : (state.adminSizeEmptyRows[color.id] || 0);
      const sizeRows = [
        ...variants.map((variant) => `
          <div class="admin-size-row ${variant.enabled === false ? 'is-disabled' : ''}">
            <label><span>Размер</span><input data-admin-size-name type="text" maxlength="20" value="${escapeHtml(variant.size)}" placeholder="Например, 42" autocomplete="off"></label>
            <label><span>Остаток</span><input type="number" min="0" step="1" inputmode="numeric" value="${variant.stock}" data-action="admin-stock" data-color-id="${variant.colorId}" data-size="${variant.size}" ${variant.enabled === false ? 'disabled' : ''} aria-label="Количество ${escapeHtml(color.name)}, размер ${variant.size}"></label>
            <button class="icon-button admin-remove-size-button" type="button" data-action="remove-admin-size" aria-label="Удалить размер ${escapeHtml(variant.size)}">${icon('close')}</button>
          </div>`),
        ...Array.from({ length: emptySizeCount }, () => `
          <div class="admin-size-row"><label><span>Размер</span><input data-admin-size-name type="text" maxlength="20" value="" placeholder="Например, 42" autocomplete="off"></label><label><span>Остаток</span><input type="number" min="0" step="1" inputmode="numeric" value="0" aria-label="Остаток нового размера"></label><button class="icon-button admin-remove-size-button" type="button" data-action="remove-admin-size" aria-label="Удалить размер">${icon('close')}</button></div>`),
      ].join('');
      return `
        <section class="admin-variant-fields" data-admin-color-block data-admin-color-index="${index}" data-color-id="${escapeHtml(color.id)}">
          <label><span>Цвет</span><input data-admin-color-name type="text" maxlength="120" value="${escapeHtml(color.name)}" placeholder="Например, чёрный" autocomplete="off"></label>
          <div class="admin-size-list">${sizeRows}</div>
          <button class="text-button admin-add-size-button" type="button" data-action="add-admin-size">Добавить размер</button>
        </section>`;
    };
    const colorFields = product.colors.map((color, index) => renderColorFields(color, index)).join('');
    const emptyColorBlocks = Array.from({ length: state.adminColorEmptyRows }, (_value, index) => (
      renderColorFields({ id: '', name: '' }, product.colors.length + index, true)
    )).join('');
    return `
      ${adminEditorHeader()}
      ${state.adminSaveError ? `<section class="notice-card admin-save-error" role="alert"><span aria-hidden="true">${icon('info')}</span><p>${escapeHtml(state.adminSaveError)}<br><small>Введённые данные сохранены на этом устройстве. Исправь ошибку и повтори сохранение.</small></p></section>` : ''}
      <form id="admin-product-form" class="admin-editor-form admin-editor-form--single" novalidate>
        <section class="admin-form-section card">
          <div class="admin-form-heading"><div><p class="eyebrow">Карточка товара</p><h2>Основная информация</h2></div><span>${product.images.length}/4 фото</span></div>
          ${photos ? `<div class="admin-photo-grid">${photos}</div>` : `<div class="admin-photo-empty">${icon('image')}<strong>Добавь фотографию</strong><span>Вертикальное фото лучше покажет одежду</span></div>`}
          ${adminFieldError('images')}
          <div class="admin-photo-actions">
            <label class="secondary-button">${icon('camera')}<span>Камера</span><input class="sr-only" type="file" accept="image/*" capture="environment" data-action="admin-photo-input"></label>
            <label class="secondary-button">${icon('image')}<span>Из галереи</span><input class="sr-only" type="file" accept="image/*" multiple data-action="admin-photo-input"></label>
          </div>
          <div class="admin-editor-grid">
            <label><span>Название товара</span><input name="name" type="text" maxlength="80" value="${escapeHtml(product.name)}" placeholder="Например, Платье Миди" autocomplete="off"></label>
            <label><span>Артикул продавца</span><input name="sellerSku" type="text" maxlength="40" value="${escapeHtml(product.sellerSku)}" placeholder="Например, DR-204" autocomplete="off"></label>
            <label><span>Категория</span><select name="category"><option value="all" ${product.category === 'all' ? 'selected' : ''}>Выбери категорию</option>${categories}</select></label>
            <label><span>Новая категория</span><input name="categoryNew" type="text" maxlength="60" value="${escapeHtml(product.categoryNew || '')}" placeholder="Можно добавить вручную" autocomplete="off"></label>
            <label><span>Цена, ₽</span><input name="price" type="number" min="1" step="1" inputmode="numeric" value="${product.price || ''}" placeholder="5990"></label>
            <label><span>Старая цена, ₽</span><input name="oldPrice" type="number" min="1" step="1" inputmode="numeric" value="${product.oldPrice || ''}" placeholder="Необязательно"></label>
            <label><span>Оптовая цена, ₽</span><input name="wholesalePrice" type="number" min="1" step="1" inputmode="numeric" value="${product.wholesalePrice || ''}" placeholder="Необязательно"></label>
            <label><span>Поставщик</span><input name="supplier" type="text" maxlength="80" value="${escapeHtml(product.supplier)}" placeholder="Например, Milan Fashion" autocomplete="off"></label>
          </div>
          ${adminFieldError('name')}${adminFieldError('price')}${adminFieldError('oldPrice')}${adminFieldError('wholesalePrice')}
          <div class="admin-form-heading admin-form-heading--variants"><div><p class="eyebrow">Варианты товара</p><h2>Цвет и размеры</h2></div><span>${product.variants.length} размеров</span></div>
          ${colorFields || emptyColorBlocks || renderColorFields({ id: '', name: '' }, 0, true)}
          ${adminFieldError('colors')}${adminFieldError('sizes')}${adminFieldError('variants')}
          <button class="secondary-button admin-add-variant-button" type="button" data-action="add-admin-product-option">Добавить новый вариант</button>
        </section>
        <section class="admin-form-section card">
          <div class="admin-form-heading"><div><p class="eyebrow">Текст карточки</p><h2>Описание товара</h2><p>Расскажи о крое, составе, посадке и уходе одним текстом.</p></div></div>
          <label><span>Описание товара</span><textarea name="description" rows="4" maxlength="500" placeholder="Крой, длина и главные детали">${escapeHtml(product.description)}</textarea></label>
          ${adminFieldError('description')}
        </section>
        <div class="admin-editor-actions admin-editor-actions--final" aria-busy="${state.isSubmitting}">
          <button class="secondary-button" type="button" data-action="${product.adminStatus === 'published' ? 'save-admin-changes' : 'save-admin-draft'}" ${state.isSubmitting ? 'disabled' : ''}>${state.isSubmitting ? 'Сохраняем…' : 'Сохранить'}</button>
          ${product.adminStatus === 'published' ? '<span></span>' : `<button class="primary-button" type="button" data-action="publish-admin-product" ${state.isSubmitting ? 'disabled' : ''}>${state.isSubmitting ? 'Сохраняем…' : 'Опубликовать'}</button>`}
        </div>
        ${/^\d+$/.test(String(product.id)) ? '<button class="danger-button full-width admin-delete-product-button" type="button" data-action="delete-admin-product">Удалить этот вариант</button>' : ''}
      </form>`;
  }

  function formatOrderTime(createdAt) {
    try {
      return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(createdAt));
    } catch (_error) {
      return 'сейчас';
    }
  }

  function renderSellerOrders() {
    const orders = state.sellerOrders.filter((order) => state.sellerTab === 'ready' ? order.status === 'ready' : order.status === 'paid');
    const collectCount = state.sellerOrders.filter((order) => order.status === 'paid').length;
    const readyCount = state.sellerOrders.filter((order) => order.status === 'ready').length;
    const content = state.sellerOrdersStatus === 'loading'
      ? '<section class="empty-state card"><h2>Загружаем заказы…</h2></section>'
      : state.sellerOrdersStatus === 'error'
        ? `<section class="empty-state card"><h2>Не удалось загрузить заказы</h2><p>${escapeHtml(state.sellerOrdersError)}</p><button class="primary-button" type="button" data-action="reload-seller-orders">Повторить</button></section>`
        : orders.length
          ? orders.map((order) => `<button class="seller-order-card card" type="button" data-action="seller-open-order" data-order-id="${escapeHtml(order.id)}"><span class="status-pill status-pill--${order.status === 'ready' ? 'ready' : 'paid'}">${order.status === 'ready' ? 'Заказ собран' : 'Оплачен, собираем'}</span><img class="order-item-image" src="${escapeHtml(getOrderItemImage(order.items[0]))}" alt="${escapeHtml(order.items[0]?.name || 'Товар заказа')}" data-order-item-image><span><strong>${escapeHtml(order.id)}</strong><small>${formatOrderTime(order.createdAt)} · ${escapeHtml(order.customer.name || 'Покупатель')} · ${order.items.length} позиций</small><small>${escapeHtml(order.delivery.title)}</small></span><b>${money(order.total)}</b></button>`).join('')
          : `<section class="empty-state card"><span aria-hidden="true">${icon('package')}</span><h2>${state.sellerTab === 'ready' ? 'Готовых заказов пока нет' : 'Нет заказов на сборку'}</h2><p>Очередь пуста.</p></section>`;
    return sellerShell('orders', `
      <section class="admin-section-heading"><div><p class="eyebrow">Рабочая очередь</p><h2>Заказы</h2><p>Актуальные заказы магазина</p></div></section>
      <div class="seller-tabs"><button class="${state.sellerTab === 'collect' ? 'is-active' : ''}" type="button" data-action="set-seller-tab" data-tab="collect">Собрать <span>${collectCount}</span></button><button class="${state.sellerTab === 'ready' ? 'is-active' : ''}" type="button" data-action="set-seller-tab" data-tab="ready">Готовы <span>${readyCount}</span></button></div>
      ${content}
      <section class="notice-card"><span aria-hidden="true">${icon('info')}</span><p>Доступ и изменение статусов защищены.</p></section>`);
  }

  function renderSellerOrder() {
    if (!state.sellerOrder) return renderSellerOrders();
    const status = orderStatus(state.sellerOrder);
    const content = `
      <header class="admin-editor-header"><button class="icon-button" type="button" data-action="go-back" aria-label="Назад">${icon('chevron-left')}</button><div><p class="eyebrow">${escapeHtml(state.sellerOrder.id)}</p><h1>Карточка заказа</h1></div></header>
      <section class="order-status-card card"><span class="status-pill status-pill--${status.className}">${status.title}</span><h2>${escapeHtml(status.text)}</h2><p>${formatOrderTime(state.sellerOrder.createdAt)} · ${money(state.sellerOrder.total)}</p></section>
      <section class="review-section card"><h2>Состав заказа</h2><ul class="review-items">${orderItems(state.sellerOrder)}</ul></section>
      <section class="info-list card"><div><span aria-hidden="true">${icon('at-sign')}</span><p><strong>${escapeHtml(state.sellerOrder.customer.name || 'Покупатель')}</strong><small>${escapeHtml(state.sellerOrder.customer.phone || '')}</small></p></div><div><span aria-hidden="true">${icon('map-pin')}</span><p><strong>${escapeHtml(state.sellerOrder.delivery.title)}</strong><small>${escapeHtml(state.sellerOrder.delivery.description)}</small></p></div></section>
      ${state.sellerOrder.status === 'paid' ? '<button class="primary-button full-width seller-ready-button" type="button" data-action="request-ready">Заказ собран</button>' : `<section class="notice-card notice-card--success"><span aria-hidden="true">${icon('check')}</span><p>${state.sellerOrder.delivery.id === 'pickup' ? 'Ждёт покупателя в магазине.' : 'Готов к передаче в доставку.'}</p></section>`}`;
    return sellerShell('orders', content);
  }

  function formatUserDate(value, empty = '—') {
    if (!value) return empty;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return empty;
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function userDisplayName(user) {
    return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Имя не указано';
  }

  function renderSellerUsers() {
    const filters = [{ id: 'all', label: 'Все' }, { id: 'today', label: 'Сегодня' }, { id: 'orders', label: 'Оформляли заказ' }];
    const query = state.adminUsersQuery.trim().toLocaleLowerCase('ru-RU');
    const visibleUsers = state.adminUsers.filter((user) => !query || `${user.firstName} ${user.lastName} ${user.username || ''}`.toLocaleLowerCase('ru-RU').includes(query));
    const content = state.adminUsersStatus === 'loading'
      ? '<section class="empty-state card"><p>Загружаем пользователей…</p></section>'
      : state.adminUsersStatus === 'error'
        ? `<section class="empty-state card"><h2>Не удалось загрузить пользователей</h2><p>${escapeHtml(state.adminUsersError)}</p><button class="primary-button" type="button" data-action="reload-admin-users">Повторить</button></section>`
        : visibleUsers.length
          ? `<div class="admin-user-list">${visibleUsers.map((user) => `<button class="admin-user-row card" type="button" data-action="open-admin-user" data-user-id="${escapeHtml(user.telegramUserId)}"><span class="admin-user-row__avatar" aria-hidden="true">${escapeHtml((userDisplayName(user)[0] || 'П').toUpperCase())}</span><span class="admin-user-row__content"><strong>${escapeHtml(userDisplayName(user))}</strong><small>${user.username ? `@${escapeHtml(String(user.username).replace(/^@/, ''))}` : 'Username не указан'}</small><small>Присоединился: ${escapeHtml(formatUserDate(user.firstAppOpenedAt))}</small><small>Открывал: ${escapeHtml(formatUserDate(user.lastAppOpenedAt))}</small>${user.ordered ? '<em class="admin-user-badge">Оформлял заказ</em>' : ''}</span></button>`).join('')}</div>`
          : '<section class="empty-state card"><span aria-hidden="true">👤</span><h2>Пользователей пока нет</h2><p>Они появятся после первого открытия приложения в Telegram.</p></section>';
    return sellerShell('users', `
      <section class="admin-section-heading"><div><p class="eyebrow">Аудитория Mini App</p><h2>Пользователи</h2><p>Только открытия с проверенным Telegram-сеансом.</p></div></section>
      <div class="admin-user-stats"><div class="card"><strong>${state.adminUserStats.total}</strong><span>Всего пользователей</span></div><div class="card"><strong>${state.adminUserStats.joinedToday}</strong><span>Сегодня присоединились</span></div><div class="card"><strong>${state.adminUserStats.openedApp}</strong><span>Открыли приложение</span></div><div class="card"><strong>${state.adminUserStats.ordered}</strong><span>Оформляли заказ</span></div></div>
      <label class="admin-search"><span aria-hidden="true">${icon('search')}</span><span class="sr-only">Поиск по имени или username</span><input type="search" data-action="admin-users-search" value="${escapeHtml(state.adminUsersQuery)}" placeholder="Найти пользователя" autocomplete="off"></label>
      <div class="admin-filter-strip" aria-label="Фильтр пользователей">${filters.map((filter) => `<button class="filter-chip ${state.adminUsersFilter === filter.id ? 'is-active' : ''}" type="button" data-action="set-admin-users-filter" data-filter="${filter.id}" aria-pressed="${state.adminUsersFilter === filter.id}">${filter.label}</button>`).join('')}</div>
      ${content}`);
  }

  function renderSellerUser() {
    if (!state.adminUser) return renderSellerUsers();
    const user = state.adminUser;
    return sellerShell('users', `<header class="admin-editor-header"><button class="icon-button" type="button" data-action="go-back" aria-label="Назад">${icon('chevron-left')}</button><div><p class="eyebrow">Профиль Mini App</p><h1>Карточка пользователя</h1></div></header><section class="admin-user-detail card"><div class="admin-user-detail__avatar" aria-hidden="true">${escapeHtml((userDisplayName(user)[0] || 'П').toUpperCase())}</div><h2>${escapeHtml(userDisplayName(user))}</h2><p>${user.username ? `@${escapeHtml(String(user.username).replace(/^@/, ''))}` : 'Username не указан'}</p></section><section class="info-list card"><div><span aria-hidden="true">◷</span><p><strong>Первое открытие</strong><small>${escapeHtml(formatUserDate(user.firstAppOpenedAt))}</small></p></div><div><span aria-hidden="true">◷</span><p><strong>Последнее открытие</strong><small>${escapeHtml(formatUserDate(user.lastAppOpenedAt))}</small></p></div><div><span aria-hidden="true">✓</span><p><strong>Заказы</strong><small>${user.ordered ? 'Оформлял заказ' : 'Заказов нет'}</small></p></div></section>`);
  }

  const renderers = {
    home: renderHome,
    catalog: renderCatalog,
    product: () => renderProduct(state.params.productId),
    cart: renderCart,
    orders: renderOrders,
    store: renderStore,
    'checkout-contact': renderCheckoutContact,
    'checkout-delivery': renderCheckoutDelivery,
    'checkout-review': renderCheckoutReview,
    'payment-success': renderPaymentSuccess,
    'order-detail': renderOrderDetail,
    'seller-access': renderSellerAccess,
    'seller-products': renderSellerProducts,
    'seller-product-edit': renderAdminEditor,
    'seller-orders': renderSellerOrders,
    'seller-order': renderSellerOrder,
    'seller-users': renderSellerUsers,
    'seller-user': renderSellerUser,
  };

  function updateNav() {
    bottomNav.querySelectorAll('[data-screen]').forEach((button) => {
      const active = button.dataset.screen === state.screen;
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const summary = Core.getCartSummary(state.cart, 0);
    cartBadge.textContent = String(summary.itemCount);
    cartBadge.hidden = summary.itemCount === 0;
  }

  function render(options = {}) {
    const previousScrollTop = screenElement.scrollTop;
    applyTelegramTheme();
    screenElement.dataset.screen = state.screen;
    screenElement.classList.toggle('screen--product', state.screen === 'product');
    screenElement.classList.toggle('screen--full', CHECKOUT_SCREENS.has(state.screen));
    screenElement.innerHTML = (renderers[state.screen] || renderNotFound)();
    bottomNav.hidden = !ROOT_SCREENS.has(state.screen);
    updateNav();
    updateBackButton();
    UI.resetScroll(screenElement);
    if (options.preserveScroll) screenElement.scrollTop = previousScrollTop;
  }

  function selectColor(colorId) {
    state.selectedColorId = colorId;
    state.selectedSize = null;
    render({ preserveScroll: true });
  }

  function selectProductOption(productId) {
    const product = getProduct(productId);
    if (!product) return;
    state.params = { ...state.params, productId: product.id };
    state.selectedColorId = product.colors[0]?.id || null;
    state.selectedSize = null;
    render({ preserveScroll: true });
  }

  function selectSize(size) {
    state.selectedSize = size;
    render({ preserveScroll: true });
  }

  function addSelectedProduct(goToCheckout) {
    const product = getProduct(state.params.productId);
    if (!product || !state.selectedColorId || !state.selectedSize) {
      showToast('Выберите цвет и размер');
      document.querySelector('#product-choice')?.classList.add('needs-attention');
      return;
    }
    const color = getColor(product, state.selectedColorId);
    const variant = getVariant(product, state.selectedColorId, state.selectedSize);
    if (!variant || variant.enabled === false || variant.stock <= 0) {
      showToast('Этот вариант закончился');
      return;
    }
    const item = {
      key: `${product.id}:${color.id}:${variant.size}`,
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      image: product.images[0],
      colorId: color.id,
      colorName: color.name,
      size: variant.size,
      price: product.price,
      quantity: 1,
    };
    state.cart = Core.addCartItem(state.cart, item, variant.stock, variant.enabled);
    saveState();
    showToast('Добавлено в корзину');
    if (goToCheckout) navigate('checkout-contact');
    else render({ preserveScroll: true });
  }

  function changeCartQuantity(key, delta) {
    const item = state.cart.find((entry) => entry.key === key);
    if (!item) return;
    const stock = getVariantStock(item);
    const nextQuantity = item.quantity + delta;
    if (nextQuantity > stock) showToast(`Доступно только ${stock}`);
    state.cart = Core.setCartItemQuantity(state.cart, key, nextQuantity, stock);
    saveState();
    render();
  }

  function removeFromCart(key) {
    state.cart = Core.removeCartItem(state.cart, key);
    saveState();
    showToast('Товар удалён');
    if (CHECKOUT_SCREENS.has(state.screen) && !state.cart.length) navigate('cart');
    else render();
  }

  function renderFilterSheet() {
    const catalogProducts = getCatalogProducts();
    const sizes = ['XS', 'S', 'M', 'L', 'XL'];
    const uniqueColors = [...new Map(
      catalogProducts.flatMap((product) => product.variants
        .filter((variant) => variant.enabled !== false && Number(variant.stock) > 0)
        .map((variant) => product.colors.find((color) => color.id === variant.colorId))
        .filter(Boolean)).map((color) => [color.id, color]),
    ).values()];
    const results = Core.filterProducts(catalogProducts, state.draftFilters).length;
    openSheet(`
      <div class="sheet__header"><p class="eyebrow">Каталог</p><h2>Фильтры</h2></div>
      <fieldset><legend>Размер</legend><div class="choice-grid choice-grid--compact">${sizes.map((size) => `<button class="chip ${state.draftFilters.sizes.includes(size) ? 'is-active' : ''}" type="button" data-action="toggle-filter-size" data-size="${size}">${size}</button>`).join('')}</div></fieldset>
      <fieldset><legend>Цвет</legend><div class="choice-grid choice-grid--colors">${uniqueColors.map((color) => `<button class="color-button ${state.draftFilters.colors.includes(color.id) ? 'is-active' : ''}" type="button" data-action="toggle-filter-color" data-color-id="${color.id}"><span style="--swatch:${color.hex}" aria-hidden="true"></span>${escapeHtml(color.name)}</button>`).join('')}</div></fieldset>
      <fieldset><legend>Цена</legend><div class="choice-grid choice-grid--compact">${[6000, 8000, 12000].map((price) => `<button class="chip ${state.draftFilters.maxPrice === price ? 'is-active' : ''}" type="button" data-action="set-max-price" data-price="${price}">До ${money(price)}</button>`).join('')}</div></fieldset>
      <label class="toggle-row"><input type="checkbox" data-action="toggle-new" ${state.draftFilters.onlyNew ? 'checked' : ''}><span>Только новинки</span></label>
      <div class="sheet__actions"><button class="secondary-button" type="button" data-action="reset-draft-filters">Сбросить</button><button class="primary-button" type="button" data-action="apply-filters">Показать ${results}</button></div>
    `, { title: 'Фильтры каталога' });
  }

  function openFilters() {
    state.draftFilters = {
      ...state.filters,
      sizes: [...state.filters.sizes],
      colors: [...state.filters.colors],
    };
    renderFilterSheet();
  }

  function toggleDraftFilter(key, value) {
    const values = state.draftFilters[key];
    state.draftFilters[key] = values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
    renderFilterSheet();
  }

  function openSort() {
    const options = [
      { id: 'default', title: 'По умолчанию' },
      { id: 'price-asc', title: 'Сначала дешевле' },
      { id: 'price-desc', title: 'Сначала дороже' },
    ];
    openSheet(`
      <div class="sheet__header"><p class="eyebrow">Каталог</p><h2>Сортировка</h2></div>
      <div class="sort-list">${options.map((option) => `<button type="button" data-action="set-sort" data-sort="${option.id}" aria-pressed="${state.sortId === option.id}"><span>${option.title}</span>${state.sortId === option.id ? `<b>${icon('check')}</b>` : ''}</button>`).join('')}</div>
    `, { title: 'Сортировка каталога' });
  }

  function openRules() {
    openSheet(`
      <div class="sheet__header"><p class="eyebrow">Важно</p><h2>Оплата и возврат</h2></div>
      <p>Порядок оплаты, получения и возврата магазин подтверждает перед оформлением.</p>
      <button class="primary-button" type="button" data-action="close-sheet">Понятно</button>
    `, { title: 'Условия магазина' });
  }

  function startCheckout() {
    if (!state.cart.length) {
      showToast('Корзина пока пуста');
      return;
    }
    navigate('checkout-contact');
  }

  function requestDemoPayment() {
    const summary = Core.getCartSummary(state.cart, state.delivery?.price || 0);
    openSheet(`
      <div class="sheet__header"><p class="eyebrow">Проверка заказа</p><h2>Оформить заказ?</h2></div>
      <p>Мы получим состав заказа и свяжемся с вами для подтверждения.</p>
      <div class="sheet__actions"><button class="secondary-button" type="button" data-action="close-sheet">Отмена</button><button class="primary-button" type="button" data-action="confirm-demo-payment">Подтвердить</button></div>
    `, { title: 'Подтверждение заказа' });
  }

  async function submitDemoPayment() {
    if (state.isSubmitting || !state.cart.length || !state.delivery) return;
    state.isSubmitting = true;
    state.checkoutIdempotencyKey ||= (globalThis.crypto?.randomUUID?.() || `checkout-${Date.now()}`);
    try {
      if (!apiClient?.createOrder) throw new Error('server-unavailable');
      const serverOrder = await apiClient.createOrder({
        idempotencyKey: state.checkoutIdempotencyKey,
        customer: state.customer,
        deliveryId: state.delivery.id,
        items: state.cart.map((item) => ({
          ...item,
          variantId: item.variantId ?? getVariant(getProduct(item.productId), item.colorId, item.size)?.id,
        })),
      });
      state.orders = [serverOrder, ...state.orders.filter(({ id }) => id !== serverOrder.id)];
      state.activeOrderId = serverOrder.id;
      state.cart = [];
      state.checkoutIdempotencyKey = null;
      saveState();
      closeSheet();
      navigate('payment-success');
    } catch (_error) {
      closeSheet();
      showToast('Не удалось создать заказ. Проверь интернет и попробуй ещё раз');
      render();
    } finally {
      state.isSubmitting = false;
    }
  }

  function enterSellerMode() {
    state.sellerMode = true;
    state.sellerSection = 'products';
    state.sellerTab = 'collect';
    state.sellerAuthStatus = 'loading';
    state.sellerAuthError = '';
    state.sellerOrder = null;
    navigate('seller-access');
    void loadRemoteAdminProducts();
  }

  function openSellerDemo() {
    enterSellerMode();
  }

  function exitSellerMode() {
    state.sellerMode = false;
    state.history = [];
    state.screen = 'store';
    state.params = {};
    render();
  }

  function setSellerSection(section) {
    if (section === 'orders') {
      navigate('seller-orders', {}, { root: true });
      void loadRemoteSellerOrders();
      return;
    }
    if (section === 'users') {
      navigate('seller-users', {}, { root: true });
      void loadRemoteAdminUsers();
      return;
    }
    navigate('seller-products', {}, { root: true });
  }

  function syncAdminForm(form) {
    if (!form || !state.adminDraft) return;
    const formData = new FormData(form);
    state.adminDraft.name = String(formData.get('name') || '').trim();
    state.adminDraft.sellerSku = String(formData.get('sellerSku') || '').trim();
    const newCategoryTitle = String(formData.get('categoryNew') || '').trim();
    state.adminDraft.categoryNew = newCategoryTitle;
    if (newCategoryTitle) {
      const category = Core.createAdminCategory(newCategoryTitle);
      state.adminDraft.category = category.id;
    } else {
      state.adminDraft.category = String(formData.get('category') || 'all');
    }
    const price = Number(formData.get('price'));
    const oldPriceValue = String(formData.get('oldPrice') || '').trim();
    state.adminDraft.price = Number.isInteger(price) && price > 0 ? price : '';
    state.adminDraft.oldPrice = oldPriceValue ? Number(oldPriceValue) : null;
    const wholesalePriceValue = String(formData.get('wholesalePrice') || '').trim();
    state.adminDraft.wholesalePrice = wholesalePriceValue ? Number(wholesalePriceValue) : null;
    state.adminDraft.supplier = String(formData.get('supplier') || '').trim();
    state.adminDraft.description = String(formData.get('description') || '').trim();
    const colorBlocks = [...form.querySelectorAll('[data-admin-color-block]')];
    if (colorBlocks.length) {
      const previousVariants = state.adminDraft.variants;
      const usedIds = new Set();
      const parsedBlocks = colorBlocks.map((block) => {
        const name = String(block.querySelector('[data-admin-color-name]')?.value || '').trim();
        const sizeRows = [...block.querySelectorAll('.admin-size-row')].map((row) => {
          const size = String(row.querySelector('[data-admin-size-name]')?.value || '').trim();
          const stockValue = String(row.querySelector('input[type="number"]')?.value || '').trim();
          const stock = stockValue === '' ? 0 : Number(stockValue);
          return { size, stock: Number.isInteger(stock) && stock >= 0 ? stock : -1 };
        }).filter(({ size }) => size);
        const savedId = String(block.dataset.colorId || '').trim();
        const baseId = name.toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'variant';
        let id = savedId || baseId;
        let suffix = 2;
        while (usedIds.has(id)) {
          id = `${baseId}-${suffix}`;
          suffix += 1;
        }
        if (name) usedIds.add(id);
        return { id, name, sizeRows };
      }).filter(({ name }) => name);
      state.adminDraft.colors = parsedBlocks.map(({ id, name }) => ({ id, name }));
      state.adminDraft.sizes = [...new Set(parsedBlocks.flatMap(({ sizeRows }) => sizeRows.map(({ size }) => size)))];
      state.adminDraft.variants = parsedBlocks.flatMap(({ id, name, sizeRows }) => {
        const stockBySize = new Map(sizeRows.map(({ size, stock }) => [size, stock]));
        return Core.buildColorVariants({ id, name }, sizeRows.map(({ size }) => size), previousVariants)
          .map((variant) => ({ ...variant, stock: stockBySize.get(variant.size) ?? variant.stock }));
      });
      state.adminColorEmptyRows = 0;
      state.adminSizeEmptyRows = {};
    }
    state.adminDirty = true;
    state.adminSaveError = '';
    persistAdminDraft();
  }

  function focusFirstAdminError() {
    const firstError = Object.keys(state.adminErrors)[0];
    if (!firstError) return;
    document.querySelector(`[name="${firstError}"]`)?.focus();
  }

  function continueAdminEditor(form) {
    syncAdminForm(form);
    state.adminErrors = Core.validateAdminProduct(state.adminDraft, state.adminStep);
    if (Object.keys(state.adminErrors).length) {
      render();
      focusFirstAdminError();
      return;
    }
    state.adminErrors = {};
    state.adminStep = Math.min(4, state.adminStep + 1);
    persistAdminDraft();
    render();
  }

  function confirmLeaveAdminEditor() {
    state.adminDirty = false;
    closeSheet();
    state.adminDraft = null;
    clearAdminDraft();
    state.adminStep = 1;
    state.adminErrors = {};
    state.adminSaveError = '';
    leaveAdminEditor();
  }

  function leaveAdminEditor() {
    const result = Core.popScreenHistory(state.history, 'seller-products');
    state.history = result.history;
    state.screen = result.target.screen;
    state.params = result.target.params || {};
    render();
  }

  function adminEditorBack() {
    if (!state.adminDirty) {
      state.adminDraft = null;
      clearAdminDraft();
      leaveAdminEditor();
      return;
    }
    openSheet(`
      <div class="sheet__header"><p class="eyebrow">Несохранённые изменения</p><h2>Выйти из редактора?</h2></div>
      <p>Изменения этого товара будут потеряны.</p>
      <div class="sheet__actions"><button class="secondary-button" type="button" data-action="close-sheet">Остаться</button><button class="primary-button" type="button" data-action="confirm-leave-admin">Выйти</button></div>
    `, { title: 'Подтверждение выхода' });
  }

  function rebuildAdminVariants() {
    state.adminDraft.variants = Core.buildProductVariants(
      state.adminDraft.colors,
      state.adminDraft.sizes,
      state.adminDraft.variants,
    );
    state.adminDirty = true;
    state.adminErrors = {};
    persistAdminDraft();
  }

  function toggleAdminColor(colorId) {
    const color = ADMIN_COLORS.find(({ id }) => id === colorId);
    if (!color || !state.adminDraft) return;
    const selected = state.adminDraft.colors.some(({ id }) => id === colorId);
    state.adminDraft.colors = selected
      ? state.adminDraft.colors.filter(({ id }) => id !== colorId)
      : [...state.adminDraft.colors, { ...color }];
    rebuildAdminVariants();
    persistAdminDraft();
    render();
  }

  function toggleAdminSize(size) {
    if (!ADMIN_SIZES.includes(size) || !state.adminDraft) return;
    state.adminDraft.sizes = state.adminDraft.sizes.includes(size)
      ? state.adminDraft.sizes.filter((item) => item !== size)
      : ADMIN_SIZES.filter((item) => [...state.adminDraft.sizes, size].includes(item));
    rebuildAdminVariants();
    persistAdminDraft();
    render();
  }

  function addAdminVariant() {
    syncAdminForm(document.querySelector('#admin-product-form'));
    state.adminColorEmptyRows += 1;
    state.adminDirty = true;
    render({ preserveScroll: true });
  }

  function addAdminSize(control) {
    const form = document.querySelector('#admin-product-form');
    const block = control.closest('[data-admin-color-block]');
    if (!form || !block) return;
    const colorName = block.querySelector('[data-admin-color-name]')?.value.trim() || '';
    syncAdminForm(form);
    const color = state.adminDraft?.colors.find((item) => item.name === colorName)
      || state.adminDraft?.colors[Number(block.dataset.adminColorIndex)];
    if (!color) {
      showToast('Сначала укажи цвет');
      return;
    }
    state.adminSizeEmptyRows[color.id] = (state.adminSizeEmptyRows[color.id] || 0) + 1;
    state.adminDirty = true;
    render({ preserveScroll: true });
  }

  function removeAdminSize(control) {
    const row = control.closest('.admin-size-row');
    if (!row) return;
    row.remove();
    syncAdminForm(document.querySelector('#admin-product-form'));
    state.adminDirty = true;
    render({ preserveScroll: true });
  }

  function addAdminProductOption() {
    const form = document.querySelector('#admin-product-form');
    syncAdminForm(form);
    const source = state.adminDraft;
    if (!source) return;
    if (!/^\d+$/.test(String(source.id))) {
      persistAdminDraft();
      showToast('Сначала сохрани первый вариант как черновик');
      return;
    }
    const option = Core.createAdminProductVariant(source, `admin-${Date.now().toString(36)}`);
    startAdminDraft(option);
    showToast('Заполни новый вариант товара');
  }

  function removeAdminColor(control) {
    const block = control.closest('[data-admin-color-block]');
    if (!block) return;
    block.remove();
    syncAdminForm(document.querySelector('#admin-product-form'));
    state.adminDirty = true;
    render({ preserveScroll: true });
  }

  function getAdminVariant(colorId, size) {
    return state.adminDraft?.variants.find((variant) => (
      variant.colorId === colorId && variant.size === size
    ));
  }

  function toggleAdminVariant(colorId, size) {
    const variant = getAdminVariant(colorId, size);
    if (!variant) return;
    variant.enabled = variant.enabled === false;
    state.adminDirty = true;
    render();
  }

  function updateAdminStock(control) {
    const variant = getAdminVariant(control.dataset.colorId, control.dataset.size);
    if (!variant) return;
    const stock = Number(control.value);
    variant.stock = Number.isInteger(stock) && stock >= 0 ? stock : -1;
    state.adminDirty = true;
    state.adminSaveError = '';
    persistAdminDraft();
  }

  async function persistAdminVariantStock(control) {
    const productId = state.adminDraft?.id;
    const variant = getAdminVariant(control.dataset.colorId, control.dataset.size);
    if (!apiClient || !/^\d+$/.test(String(productId)) || !variant?.id) return;
    try {
      const saved = await apiClient.updateAdminStock(productId, variant.id, variant.stock, variant.enabled !== false);
      variant.stock = Number(saved.stock);
      variant.enabled = saved.is_enabled ?? saved.isEnabled ?? variant.enabled;
      state.adminProducts = state.adminProducts.map((product) => product.id === String(productId)
        ? { ...product, variants: product.variants.map((item) => item.id === variant.id ? { ...item, ...variant } : item) }
        : product);
      persistAdminDraft();
      await loadRemoteCatalog();
    } catch (error) {
      persistAdminDraft();
      showToast(error?.message || 'Не удалось сохранить остаток.');
    }
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleAdminPhotos(files) {
    if (!state.adminDraft) return;
    const availableSlots = Math.max(0, 4 - state.adminDraft.images.length);
    const selectedFiles = [...files].slice(0, availableSlots);
    if (!selectedFiles.length) {
      showToast(state.adminDraft.images.length >= 4 ? 'Можно добавить не больше 4 фото' : 'Выбери изображение');
      return;
    }
    if (selectedFiles.some((file) => !file.type.startsWith('image/'))) {
      showToast('Выбери файл изображения');
      return;
    }
    if (selectedFiles.some((file) => file.size > 800 * 1024)) {
      showToast('Каждое фото должно быть не больше 800 КБ');
      return;
    }
    try {
      const images = await Promise.all(selectedFiles.map(readImageFile));
      state.adminDraft.images = [...state.adminDraft.images, ...images];
      state.adminDraft.imagePaths = [...(state.adminDraft.imagePaths || []), ...images.map(() => null)];
      state.adminDirty = true;
      state.adminErrors = {};
      persistAdminDraft();
      render();
    } catch (_error) {
      showToast('Не удалось прочитать фотографию');
    }
  }

  function makeAdminPhotoMain(index) {
    if (!state.adminDraft?.images[index]) return;
    const images = [...state.adminDraft.images];
    const imagePaths = [...(state.adminDraft.imagePaths || [])];
    const [selected] = images.splice(index, 1);
    const [selectedPath] = imagePaths.splice(index, 1);
    state.adminDraft.images = [selected, ...images];
    state.adminDraft.imagePaths = [selectedPath, ...imagePaths];
    state.adminDirty = true;
    persistAdminDraft();
    render();
  }

  function removeAdminPhoto(index) {
    if (!state.adminDraft?.images[index]) return;
    state.adminDraft.images = state.adminDraft.images.filter((_image, itemIndex) => itemIndex !== index);
    state.adminDraft.imagePaths = (state.adminDraft.imagePaths || []).filter((_image, itemIndex) => itemIndex !== index);
    state.adminDirty = true;
    persistAdminDraft();
    render();
  }

  function openAdminProductMenu(productId) {
    const product = getAdminProduct(productId);
    if (!product) return;
    openSheet(`
      <div class="sheet__header"><p class="eyebrow">Товар</p><h2>${escapeHtml(product.name || 'Без названия')}</h2></div>
      <div class="admin-action-list">
        <button type="button" data-action="edit-admin-product" data-product-id="${escapeHtml(product.id)}">${icon('edit')}<span><strong>Редактировать</strong><small>Изменить данные и остатки</small></span>${icon('chevron-right')}</button>
        <button type="button" data-action="preview-admin-product" data-product-id="${escapeHtml(product.id)}">${icon('image')}<span><strong>Как увидит покупатель</strong><small>Открыть предпросмотр карточки</small></span>${icon('chevron-right')}</button>
        <button type="button" data-action="duplicate-admin-product" data-product-id="${escapeHtml(product.id)}">${icon('copy')}<span><strong>Создать похожий</strong><small>Остатки не перенесутся</small></span>${icon('chevron-right')}</button>
        ${product.adminStatus !== 'archived' ? `<button type="button" data-action="archive-admin-product" data-product-id="${escapeHtml(product.id)}">${icon('archive')}<span><strong>Убрать в архив</strong><small>Скрыть товар без удаления истории</small></span>${icon('chevron-right')}</button>` : ''}
      </div>
      <button class="secondary-button full-width" type="button" data-action="close-sheet">Отмена</button>
    `, { title: 'Действия с товаром' });
  }

  function confirmDeleteAdminProduct() {
    const product = state.adminDraft;
    if (!product || !/^\d+$/.test(String(product.id))) return;
    openSheet(`
      <div class="sheet__header"><p class="eyebrow">Удаление варианта</p><h2>Удалить «${escapeHtml(product.name || 'Без названия')}»?</h2></div>
      <p>Будет удалена только эта карточка товара вместе с её фото, цветами и размерами. Остальные цветовые варианты сохранятся; если это владелец группы, они продолжат работать как самостоятельные карточки.</p>
      <div class="sheet__actions"><button class="secondary-button" type="button" data-action="close-sheet">Отмена</button><button class="danger-button" type="button" data-action="confirm-delete-admin-product">Удалить</button></div>
    `, { title: 'Подтверждение удаления' });
  }

  async function deleteAdminProduct() {
    const productId = state.adminDraft?.id;
    if (!apiClient || !/^\d+$/.test(String(productId))) return;
    try {
      const result = await apiClient.deleteAdminProduct(productId);
      if (Number(result?.deletedProductId) !== Number(productId)) {
        throw new Error('Не удалось подтвердить удаление варианта.');
      }
      state.adminProducts = state.adminProducts.filter((product) => product.id !== String(productId));
      state.adminDraft = null;
      state.adminDirty = false;
      state.adminErrors = {};
      clearAdminDraft();
      closeSheet();
      state.history = [];
      state.screen = 'seller-products';
      state.params = {};
      render();
      showToast('Вариант удалён');
    } catch (error) {
      showToast(error?.message || 'Не удалось удалить вариант.');
    }
  }

  async function archiveAdminProduct(productId) {
    if (!apiClient) return;
    try {
      await apiClient.archiveAdminProduct(productId);
      state.adminProducts = state.adminProducts.map((product) => (
        product.id === productId ? { ...product, adminStatus: 'archived' } : product
      ));
      await loadRemoteCatalog();
      closeSheet();
      render();
      showToast('Товар убран в архив');
    } catch (error) {
      showToast(error?.message || 'Не удалось архивировать товар.');
    }
  }

  function duplicateProduct(productId) {
    const product = getAdminProduct(productId);
    if (!product) return;
    const copy = Core.duplicateAdminProduct(product, `admin-${Date.now().toString(36)}`);
    closeSheet();
    startAdminDraft(copy);
    state.adminDirty = true;
  }

  function previewAdminProduct(productId) {
    const product = getAdminProduct(productId);
    if (!product) return;
    closeSheet();
    state.adminDraft = cloneAdminProduct(product);
    state.adminStep = 4;
    state.adminDirty = false;
    state.adminErrors = {};
    navigate('seller-product-edit', { productId: product.id });
  }

  function jumpToFirstAdminError() {
    const errors = Core.validateAdminProduct(state.adminDraft, 'publish');
    if (errors.images || errors.name) state.adminStep = 1;
    else if (errors.price || errors.oldPrice) state.adminStep = 2;
    else state.adminStep = 3;
    state.adminErrors = Core.validateAdminProduct(state.adminDraft, state.adminStep);
    render();
  }

  function requestOrderReady() {
    if (!state.sellerOrder || state.sellerOrder.status !== 'paid') return;
    const message = state.sellerOrder.delivery.id === 'pickup'
      ? 'Покупатель увидит: «Ждёт вас в магазине».'
      : 'Покупатель увидит: «Готов к передаче в доставку».';
    openSheet(`
      <div class="sheet__header"><p class="eyebrow">${escapeHtml(state.sellerOrder.id)}</p><h2>Заказ действительно собран?</h2></div>
      <p>${message}</p>
      <div class="sheet__actions"><button class="secondary-button" type="button" data-action="close-sheet">Отмена</button><button class="primary-button" type="button" data-action="confirm-ready">Да, заказ собран</button></div>
    `, { title: 'Подтверждение сборки заказа' });
  }

  async function confirmOrderReady() {
    if (!state.sellerOrder || state.sellerOrder.status !== 'paid' || state.isSubmitting || !apiClient?.markOrderReady) return;
    state.isSubmitting = true;
    try {
      const updatedOrder = await apiClient.markOrderReady(state.sellerOrder.id);
      state.sellerOrder = updatedOrder;
      state.sellerOrders = state.sellerOrders.map((order) => order.id === updatedOrder.id ? updatedOrder : order);
      if (state.orders.some(({ id }) => id === updatedOrder.id)) replaceOrder(updatedOrder);
      state.sellerTab = 'ready';
      saveState();
      closeSheet();
      showToast('Статус обновлён: заказ собран');
      render();
    } catch (error) {
      closeSheet();
      showToast(error?.status === 409 ? 'Заказ уже изменён или его нельзя собрать.' : error?.message || 'Не удалось обновить заказ.');
    } finally {
      state.isSubmitting = false;
    }
  }

  async function openBuyerOrder(orderId = state.activeOrderId) {
    const order = state.orders.find(({ id }) => id === orderId);
    if (!order) return;
    state.activeOrderId = order.id;
    navigate('order-detail');
    if (order.orderType !== 'server' || !apiClient?.getBuyerOrder) return;
    try {
      const latestOrder = await apiClient.getBuyerOrder(order.id);
      replaceOrder(latestOrder);
      saveState();
      render();
    } catch (_error) {
      // Последний корректный серверный заказ остаётся на экране при временной ошибке.
    }
  }

  async function loadRemoteSellerOrders() {
    if (!apiClient?.listSellerOrders) return false;
    state.sellerOrdersStatus = 'loading';
    state.sellerOrdersError = '';
    render();
    try {
      state.sellerOrders = await apiClient.listSellerOrders();
      state.sellerOrdersStatus = 'ready';
      render();
      return true;
    } catch (error) {
      state.sellerOrdersStatus = 'error';
      state.sellerOrdersError = error?.status === 403
        ? 'У тебя нет доступа к заказам.'
        : error?.status === 401
          ? 'Не удалось подтвердить Telegram-сеанс. Открой Mini App заново.'
          : error?.message || 'Не удалось загрузить заказы.';
      render();
      return false;
    }
  }

  async function openSellerOrder(control) {
    const orderId = control?.dataset?.orderId;
    if (!orderId || !apiClient?.getSellerOrder) return;
    const cachedOrder = state.sellerOrders.find((order) => order.id === orderId);
    state.sellerOrder = cachedOrder || null;
    navigate('seller-order', { orderId });
    try {
      state.sellerOrder = await apiClient.getSellerOrder(orderId);
      state.sellerOrders = state.sellerOrders.map((order) => order.id === state.sellerOrder.id ? state.sellerOrder : order);
      render();
    } catch (error) {
      showToast(error?.message || 'Не удалось загрузить заказ.');
      navigate('seller-orders', {}, { root: true });
    }
  }

  async function loadRemoteAdminProducts() {
    if (!apiClient) {
      state.sellerAuthStatus = 'error';
      state.sellerAuthError = 'Открой Mini App в Telegram: в обычном браузере нет подтверждённого Telegram-сеанса.';
      render();
      return false;
    }
    try {
      const products = await apiClient.getAdminProducts();
      state.adminProducts = Core.createAdminCatalog(products);
      rebuildAdminCategories();
      state.sellerAuthStatus = 'ready';
      state.screen = 'seller-products';
      state.history = [];
      render();
      return true;
    } catch (error) {
      state.sellerAuthStatus = 'error';
      state.sellerAuthError = error?.status === 403
        ? 'У тебя нет доступа к панели продавца.'
        : error?.status === 401
          ? 'Не удалось подтвердить Telegram-сеанс. Открой Mini App заново.'
          : error?.message || 'Не удалось загрузить товары.';
      state.adminProducts = [];
      render();
      return false;
    }
  }

  async function loadRemoteAdminUsers() {
    if (!apiClient?.listAdminUsers) return false;
    state.adminUsersStatus = 'loading';
    state.adminUsersError = '';
    render();
    try {
      const result = await apiClient.listAdminUsers({ query: state.adminUsersQuery, filter: state.adminUsersFilter });
      state.adminUsers = result.users || [];
      state.adminUserStats = result.stats || state.adminUserStats;
      state.adminUsersStatus = 'ready';
      render();
      return true;
    } catch (error) {
      state.adminUsersStatus = 'error';
      state.adminUsersError = error?.status === 403
        ? 'У тебя нет доступа к пользователям.'
        : error?.status === 401
          ? 'Не удалось подтвердить Telegram-сеанс. Открой Mini App заново.'
          : error?.message || 'Не удалось загрузить пользователей.';
      state.adminUsers = [];
      render();
      return false;
    }
  }

  async function loadRemoteCatalog() {
    if (!apiClient) return false;
    state.catalogStatus = 'loading';
    state.catalogError = '';
    render();
    try {
      const products = await apiClient.getCatalog(state.filters);
      state.catalogProducts = Core.createAdminCatalog(products);
      await preloadCatalogImages(state.catalogProducts);
      state.catalogStatus = 'ready';
      render();
      return true;
    } catch (error) {
      state.catalogStatus = 'error';
      state.catalogError = error?.message || 'Каталог временно недоступен.';
      render();
      return false;
    }
  }

  function preloadCatalogImages(products) {
    if (typeof window.Image !== 'function') return Promise.resolve();
    const urls = [...new Set(products.flatMap((product) => product.images || []).filter(Boolean))];
    return Promise.all(urls.map((source) => new Promise((resolve) => {
      const image = new window.Image();
      image.onload = resolve;
      image.onerror = resolve;
      image.src = source;
    })));
  }

  async function saveAdminProduct(status) {
    if (state.isSubmitting) return;
    const form = document.querySelector('#admin-product-form');
    syncAdminForm(form);
    if (!state.adminDraft || !apiClient) return;
    if (status === 'published') {
      state.adminErrors = Core.validateAdminProduct(state.adminDraft, 'publish');
      if (Object.keys(state.adminErrors).length) {
        state.adminStep = 4;
        render();
        showToast('Исправь ошибки перед публикацией');
        return;
      }
    }
    persistAdminDraft();
    state.isSubmitting = true;
    render();
    try {
      let saved = state.adminDraft.id && /^\d+$/.test(String(state.adminDraft.id))
        ? await apiClient.updateAdminProduct({ ...state.adminDraft, adminStatus: 'draft' })
        : await apiClient.createAdminProduct({ ...state.adminDraft, adminStatus: 'draft' });
      const imagesToUpload = state.adminDraft.images
        .map((image, index) => ({ image, objectPath: state.adminDraft.imagePaths?.[index] || null }))
        .filter(({ image }) => String(image).startsWith('data:'));
      state.adminDraft = { ...state.adminDraft, id: saved.id, updatedAt: saved.updatedAt, imagePaths: saved.imagePaths || state.adminDraft.imagePaths || [] };
      persistAdminDraft();
      if (imagesToUpload.length) {
        const imagePaths = await Promise.all(state.adminDraft.images.map((image, index) => (
          String(image).startsWith('data:')
            ? apiClient.uploadAdminImage(saved.id, image)
            : state.adminDraft.imagePaths?.[index] || image
        )));
        saved = await apiClient.updateAdminProduct({
          ...state.adminDraft,
          id: saved.id,
          updatedAt: saved.updatedAt,
          imagePaths,
          adminStatus: 'draft',
        });
      }
      const finalProduct = status === 'published'
        ? await apiClient.publishAdminProduct(saved.id)
        : saved;
      const normalizedProduct = normalizeAdminProductCategory(finalProduct);
      state.adminProducts = state.adminProducts.some(({ id }) => id === normalizedProduct.id)
        ? state.adminProducts.map((item) => item.id === normalizedProduct.id ? normalizedProduct : item)
        : [normalizedProduct, ...state.adminProducts];
      rebuildAdminCategories();
      if (status === 'published') await loadRemoteCatalog();
      state.adminDraft = null;
      clearAdminDraft();
      state.adminDirty = false;
      state.adminErrors = {};
      state.adminSaveError = '';
      state.adminStep = 1;
      state.history = [];
      state.screen = 'seller-products';
      state.params = {};
      state.isSubmitting = false;
      render();
      showToast(status === 'published' ? 'Товар опубликован' : 'Черновик сохранён');
    } catch (error) {
      state.isSubmitting = false;
      state.adminSaveError = error?.message || 'Не удалось сохранить товар.';
      persistAdminDraft();
      render();
      showToast(error?.status === 409 ? 'Товар изменён на другом устройстве. Обнови список.' : 'Данные сохранены в черновик. Исправь ошибку и повтори.');
    }
  }

  const actions = {
    navigate: (control) => navigate(control.dataset.screen, {}, { root: true, fromNav: true }),
    'go-back': goBack,
    'open-product': (control) => navigate('product', { productId: control.dataset.productId }),
    'open-category': (control) => {
      state.filters = { ...DEFAULT_FILTERS, category: control.dataset.category };
      navigate('catalog', {}, { root: true });
    },
    'open-new': () => {
      state.filters = { ...DEFAULT_FILTERS, onlyNew: true };
      navigate('catalog', {}, { root: true });
    },
    'set-category': (control) => {
      state.filters.category = control.dataset.category;
      render();
    },
    filters: openFilters,
    sort: openSort,
    'reset-filters': () => {
      state.filters = { ...DEFAULT_FILTERS };
      render();
    },
    'toggle-filter-size': (control) => toggleDraftFilter('sizes', control.dataset.size),
    'toggle-filter-color': (control) => toggleDraftFilter('colors', control.dataset.colorId),
    'set-max-price': (control) => {
      const price = Number(control.dataset.price);
      state.draftFilters.maxPrice = state.draftFilters.maxPrice === price ? null : price;
      renderFilterSheet();
    },
    'toggle-new': (control) => {
      state.draftFilters.onlyNew = control.checked;
      renderFilterSheet();
    },
    'reset-draft-filters': () => {
      state.draftFilters = { ...DEFAULT_FILTERS, category: state.filters.category };
      renderFilterSheet();
    },
    'apply-filters': () => {
      state.filters = { ...state.draftFilters, sizes: [...state.draftFilters.sizes], colors: [...state.draftFilters.colors] };
      closeSheet();
      render();
    },
    'set-sort': (control) => {
      state.sortId = control.dataset.sort;
      closeSheet();
      render();
    },
    'select-color': (control) => selectColor(control.dataset.colorId),
    'select-product-option': (control) => selectProductOption(control.dataset.productId),
    'select-size': (control) => selectSize(control.dataset.size),
    'add-to-cart': () => addSelectedProduct(false),
    'buy-now': () => addSelectedProduct(true),
    'cart-decrease': (control) => changeCartQuantity(control.dataset.key, -1),
    'cart-increase': (control) => changeCartQuantity(control.dataset.key, 1),
    'cart-remove': (control) => removeFromCart(control.dataset.key),
    'checkout-start': startCheckout,
    'choose-delivery': (control) => {
      state.delivery = Data.DELIVERY_METHODS.find(({ id }) => id === control.dataset.deliveryId) || null;
      render();
    },
    'delivery-continue': () => {
      if (state.delivery) navigate('checkout-review');
    },
    'edit-contact': () => navigate('checkout-contact'),
    'edit-delivery': () => navigate('checkout-delivery'),
    'request-payment': requestDemoPayment,
    'confirm-demo-payment': submitDemoPayment,
    'open-order': (control) => void openBuyerOrder(control.dataset.orderId),
    'demo-contact': () => showToast('Контакт магазина: ' + Data.STORE.support),
    'store-rules': openRules,
    'enter-seller': enterSellerMode,
    'open-seller-demo': openSellerDemo,
    'exit-seller': exitSellerMode,
    'set-seller-section': (control) => setSellerSection(control.dataset.section),
    'open-admin-user': (control) => void openAdminUser(control.dataset.userId),
    'set-admin-users-filter': (control) => {
      state.adminUsersFilter = ['today', 'orders'].includes(control.dataset.filter) ? control.dataset.filter : 'all';
      void loadRemoteAdminUsers();
    },
    'add-admin-product': () => startAdminDraft(),
    'edit-admin-product': (control) => {
      const product = getAdminProduct(control.dataset.productId);
      if (!product) return;
      if (modalRoot.children.length) closeSheet();
      startAdminDraft(product);
    },
    'admin-product-menu': (control) => openAdminProductMenu(control.dataset.productId),
    'archive-admin-product': (control) => void archiveAdminProduct(control.dataset.productId),
    'preview-admin-product': (control) => previewAdminProduct(control.dataset.productId),
    'duplicate-admin-product': (control) => duplicateProduct(control.dataset.productId),
    'set-admin-filter': (control) => {
      state.adminFilter = ['published', 'draft', 'out'].includes(control.dataset.filter)
        ? control.dataset.filter
        : 'all';
      render();
    },
    'set-admin-category': (control) => {
      state.adminCategory = control.value || 'all';
      render();
    },
    'set-admin-supplier': (control) => {
      state.adminSupplier = control.value || 'all';
      render();
    },
    'set-admin-availability': (control) => {
      state.adminAvailability = ['in-stock', 'out-of-stock'].includes(control.dataset.availability)
        ? control.dataset.availability
        : 'all';
      render();
    },
    'toggle-admin-new': () => {
      state.adminOnlyNew = !state.adminOnlyNew;
      render();
    },
    'admin-editor-back': adminEditorBack,
    'save-admin-draft': () => void saveAdminProduct('draft'),
    'save-admin-changes': () => void saveAdminProduct('published'),
    'publish-admin-product': () => void saveAdminProduct('published'),
    'confirm-leave-admin': confirmLeaveAdminEditor,
    'delete-admin-product': confirmDeleteAdminProduct,
    'confirm-delete-admin-product': () => void deleteAdminProduct(),
    'toggle-admin-color': (control) => toggleAdminColor(control.dataset.colorId),
    'toggle-admin-size': (control) => toggleAdminSize(control.dataset.size),
    'add-admin-product-option': addAdminProductOption,
    'add-admin-size': (control) => addAdminSize(control),
    'remove-admin-size': (control) => removeAdminSize(control),
    'remove-admin-color': (control) => removeAdminColor(control),
    'toggle-admin-variant': (control) => toggleAdminVariant(control.dataset.colorId, control.dataset.size),
    'admin-photo-main': (control) => makeAdminPhotoMain(Number(control.dataset.index)),
    'admin-photo-remove': (control) => removeAdminPhoto(Number(control.dataset.index)),
    'admin-fix-errors': jumpToFirstAdminError,
    'seller-open-order': openSellerOrder,
    'set-seller-tab': (control) => {
      state.sellerTab = control.dataset.tab === 'ready' ? 'ready' : 'collect';
      render();
    },
    'request-ready': requestOrderReady,
    'confirm-ready': confirmOrderReady,
    'reload-seller-orders': () => void loadRemoteSellerOrders(),
    'reload-admin-users': () => void loadRemoteAdminUsers(),
    'open-offer-bot': openOfferBot,
    'share-bot': shareBot,
    'close-sheet': closeSheet,
    'reload-catalog': loadRemoteCatalog,
  };

  function init() {
    hydrateStaticIcons();
    applyViewportLayout();
    applyApprovedDemoReset();
    loadPersistedState();
    applyTelegramTheme();
    tg?.ready();
    tg?.expand();
    tg?.BackButton?.onClick(goBack);
    tg?.onEvent?.('themeChanged', applyTelegramTheme);
    tg?.onEvent?.('viewportChanged', applyViewportHeight);
    window.addEventListener('orientationchange', applyViewportLayout);
    render();
    showFirstOpenOffer();
    if (tg?.initData && apiClient?.trackOpen) void apiClient.trackOpen().catch(() => {});
    void loadRemoteCatalog();
  }

  document.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled || control.matches('input[data-action], select[data-action]')) return;
    actions[control.dataset.action]?.(control, event);
  });

  document.addEventListener('change', (event) => {
    const control = event.target.closest('[data-action]');
    if (control?.dataset.action === 'toggle-new') actions['toggle-new'](control);
    if (control?.dataset.action === 'set-admin-category') actions['set-admin-category'](control);
    if (control?.dataset.action === 'set-admin-supplier') actions['set-admin-supplier'](control);
    if (control?.dataset.action === 'admin-stock') void persistAdminVariantStock(control);
    if (control?.dataset.action === 'admin-photo-input') {
      handleAdminPhotos(control.files || []);
      control.value = '';
    }
  });

  document.addEventListener('input', (event) => {
    const control = event.target;
    if (control.matches('[data-action="admin-search"]')) {
      state.adminQuery = control.value;
      render();
      const search = document.querySelector('[data-action="admin-search"]');
      search?.focus();
      search?.setSelectionRange?.(search.value.length, search.value.length);
      return;
    }
    if (control.matches('[data-action="admin-stock"]')) {
      updateAdminStock(control);
      return;
    }
    if (control.matches('[data-action="admin-users-search"]')) {
      state.adminUsersQuery = control.value;
      render();
      const search = document.querySelector('[data-action="admin-users-search"]');
      search?.focus();
      search?.setSelectionRange?.(search.value.length, search.value.length);
      return;
    }
    if (control.closest('#admin-product-form')) state.adminDirty = true;
  });

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'admin-product-form') {
      event.preventDefault();
      continueAdminEditor(event.target);
      return;
    }
    if (event.target.id !== 'contact-form') return;
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const phoneIsValid = /^\+?[0-9\s()\-]{10,20}$/.test(phone)
      && phone.replace(/\D/g, '').length >= 10;
    const error = form.querySelector('#phone-error');
    error.hidden = phoneIsValid;
    if (!name) {
      form.elements.name.focus();
      showToast('Введите имя');
      return;
    }
    if (!phoneIsValid) {
      form.elements.phone.focus();
      return;
    }
    state.customer = { name, phone };
    navigate('checkout-delivery');
  });

  document.addEventListener('keydown', handleModalKeydown);
  document.addEventListener('focusin', (event) => {
    if (!event.target.closest?.('#admin-product-form')) return;
    const resetHorizontalScroll = () => {
      screenElement.scrollLeft = 0;
      appShell.scrollLeft = 0;
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    };
    resetHorizontalScroll();
    window.setTimeout(resetHorizontalScroll, 0);
  });
  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement) {
      const image = event.target;
      if (image.dataset.fallbackApplied !== '1') {
        image.dataset.fallbackApplied = '1';
        image.src = 'assets/preorder-hero-bags.png';
        image.hidden = false;
        return;
      }
      image.closest('.product-card__media, .product-gallery, .category-card, .store-visual')?.classList.add('image-fallback');
      image.hidden = true;
    }
  }, true);

  async function openAdminUser(userId) {
    if (!userId || !apiClient?.getAdminUser) return;
    state.adminUser = state.adminUsers.find((user) => String(user.telegramUserId) === String(userId)) || null;
    navigate('seller-user', { userId });
    try {
      state.adminUser = await apiClient.getAdminUser(userId);
      render();
    } catch (error) {
      showToast(error?.message || 'Не удалось загрузить карточку пользователя.');
      navigate('seller-users', {}, { root: true });
    }
  }

  window.FashionStoreApp = { init, navigate, goBack, render, selectColor, selectProductOption, selectSize, loadRemoteCatalog, loadRemoteAdminUsers };
  document.addEventListener('DOMContentLoaded', init, { once: true });
})(window, document);
