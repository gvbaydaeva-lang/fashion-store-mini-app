/* Управляет экранами, событиями и интеграцией Telegram Web App. */
(function createApp(window, document) {
  'use strict';

  const Data = window.FashionStoreData;
  const Core = window.FashionStoreCore;
  const UI = window.FashionStoreUI;
  const tg = window.Telegram?.WebApp;
  const screenElement = document.querySelector('#screen');
  const appShell = document.querySelector('#app');
  const bottomNav = document.querySelector('#bottom-nav');
  const cartBadge = document.querySelector('#cart-badge');
  const toastElement = document.querySelector('#toast');
  const modalRoot = document.querySelector('#modal-root');
  const CART_KEY = 'fashion-store-cart-v1';
  const ORDER_KEY = 'fashion-store-order-v1';
  const OFFER_KEY = 'fashion-store-offer-seen-v1';
  const MAIN_APP_URL = Core.buildMainMiniAppUrl('fashion_katalog_bot');
  const OFFER_BOT_URL = 'https://t.me/fashion_katalog_bot?start=from_app';
  const SHARE_TEXT = 'Посмотри каталог «Фэшн стор» в Telegram';
  const ROOT_SCREENS = new Set(['home', 'catalog', 'cart', 'orders', 'store']);
  const CHECKOUT_SCREENS = new Set([
    'product', 'checkout-contact', 'checkout-delivery', 'checkout-review',
    'payment-success', 'order-detail', 'seller-orders', 'seller-order',
  ]);
  const DEFAULT_FILTERS = {
    category: 'all',
    sizes: [],
    colors: [],
    maxPrice: null,
    onlyNew: false,
  };

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
    order: null,
    customer: { name: '', phone: '' },
    delivery: null,
    sellerMode: false,
    sellerTab: 'collect',
    isSubmitting: false,
  };

  let toastTimer = null;
  let focusBeforeSheet = null;

  function icon(name, className = 'ui-icon') {
    return UI?.icon(name, className) || '';
  }

  function hydrateStaticIcons() {
    document.querySelectorAll('[data-icon]').forEach((element) => {
      element.innerHTML = icon(element.dataset.icon);
    });
  }

  function applyViewportLayout() {
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const viewportHeight = tg?.viewportHeight || window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--app-width', `${UI.getMiniAppWidth(viewportWidth)}px`);
    if (viewportHeight) document.documentElement.style.setProperty('--app-height', `${Math.round(viewportHeight)}px`);
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
    const order = readStored(ORDER_KEY, null);
    state.cart = Array.isArray(cart)
      ? cart.filter((item) => item && typeof item.key === 'string' && item.quantity > 0)
      : [];
    state.order = order && typeof order === 'object' && typeof order.id === 'string'
      ? order
      : null;
    state.customer.name = getTelegramFirstName() === 'Гость' ? '' : getTelegramFirstName();
  }

  function saveState() {
    window.localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    if (state.order) window.localStorage.setItem(ORDER_KEY, JSON.stringify(state.order));
    else window.localStorage.removeItem(ORDER_KEY);
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

  function getProduct(productId) {
    return Data.PRODUCTS.find((product) => product.id === productId) || null;
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
      state.selectedColorId = null;
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
          <div class="offer-dialog__emoji" aria-hidden="true">🎁</div>
          <h2 id="offer-title">Добро пожаловать в магазин Фэшн стор</h2>
          <p id="offer-description">Подпишитесь на бота, чтобы быть в курсе акций и новинок</p>
          <ul class="offer-dialog__benefits">
            <li>Расскажем про акции</li>
            <li>Первыми узнаете о новинках</li>
            <li>Эксклюзивные акции для подписчиков</li>
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
    const sizes = [...new Set(product.variants.filter(({ stock }) => stock > 0).map(({ size }) => size))];
    return `
      <article class="product-card card">
        <button class="product-card__open" type="button" data-action="open-product" data-product-id="${product.id}" aria-label="Открыть ${escapeHtml(product.name)}">
          <span class="product-card__media">
            <img src="${product.images[0]}" alt="${escapeHtml(product.name)}" loading="lazy">
            ${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ''}
          </span>
          <span class="product-card__body">
            <strong>${escapeHtml(product.name)}</strong>
            <span class="price-row"><b>${money(product.price)}</b>${product.oldPrice ? `<s>${money(product.oldPrice)}</s>` : ''}</span>
            <small>${sizes.length ? `Размеры: ${sizes.join(', ')}` : 'Нет в наличии'}</small>
          </span>
        </button>
      </article>`;
  }

  function renderHome() {
    const newProducts = Data.PRODUCTS.filter(({ badge }) => badge === 'Новинка').slice(0, 4);
    const categoryCards = Data.CATEGORIES.filter(({ id }) => id !== 'all').map((category) => {
      const product = Data.PRODUCTS.find(({ category: productCategory }) => productCategory === category.id);
      return `
        <button class="category-card" type="button" data-action="open-category" data-category="${category.id}">
          <img src="${product.images[0]}" alt="" loading="lazy"><span>${escapeHtml(category.title)}</span>
        </button>`;
    }).join('');

    return `
      <header class="home-header">
        <div><p class="eyebrow">Здравствуйте, ${escapeHtml(getTelegramFirstName())}</p><h1>${Data.STORE.name}</h1></div>
        <div class="brand-mark brand-mark--small" aria-hidden="true">Ф</div>
      </header>
      <section class="hero card">
        <span class="hero__orb hero__orb--one" aria-hidden="true"></span>
        <span class="hero__orb hero__orb--two" aria-hidden="true"></span>
        <p class="eyebrow">Новая коллекция</p>
        <h2>${Data.STORE.tagline}</h2>
        <p>Лёгкие сочетания, которые работают весь день.</p>
        <button class="secondary-button" type="button" data-action="open-new">Смотреть новинки</button>
      </section>
      <section class="section-block">
        <div class="section-heading"><h2>Категории</h2><button type="button" data-action="navigate" data-screen="catalog">Все</button></div>
        <div class="category-strip">${categoryCards}</div>
      </section>
      <section class="section-block">
        <div class="section-heading"><div><p class="eyebrow">Только поступили</p><h2>Новинки</h2></div><button type="button" data-action="open-new">Смотреть все</button></div>
        <div class="product-grid">${newProducts.map(productCard).join('')}</div>
      </section>
      <section class="editorial-card card">
        <p class="eyebrow">Лёгкие слои</p><h2>Городской гардероб</h2>
        <p>Жакеты, трикотаж и свободные рубашки для переменчивой погоды.</p>
        <button class="text-button text-button--icon" type="button" data-action="open-category" data-category="jackets">Открыть подборку ${icon('chevron-right')}</button>
      </section>
      <button class="share-button" type="button" data-action="share-bot">${icon('share')}<span>Поделиться с другом</span></button>`;
  }

  function activeFilterChips() {
    const chips = [];
    if (state.filters.sizes.length) chips.push(`Размер: ${state.filters.sizes.join(', ')}`);
    if (state.filters.colors.length) {
      const names = state.filters.colors.map((id) => (
        Data.PRODUCTS.flatMap(({ colors }) => colors).find((color) => color.id === id)?.name || id
      ));
      chips.push(`Цвет: ${names.join(', ')}`);
    }
    if (state.filters.maxPrice != null) chips.push(`До ${money(state.filters.maxPrice)}`);
    if (state.filters.onlyNew) chips.push('Новинки');
    return chips.map((chip) => `<span class="filter-chip">${escapeHtml(chip)}</span>`).join('');
  }

  function renderCatalog() {
    const products = Core.sortProducts(
      Core.filterProducts(Data.PRODUCTS, state.filters),
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
    const colorButtons = product.colors.map((color) => `
      <button class="color-button ${state.selectedColorId === color.id ? 'is-active' : ''}" type="button" data-action="select-color" data-color-id="${color.id}" aria-pressed="${state.selectedColorId === color.id}">
        <span style="--swatch:${color.hex}" aria-hidden="true"></span>${escapeHtml(color.name)}
      </button>`).join('');
    const variants = state.selectedColorId ? Core.getAvailableOptions(product, state.selectedColorId) : [];
    const sizeButtons = variants.map((variant) => `
      <button class="size-button ${state.selectedSize === variant.size ? 'is-active' : ''}" type="button" data-action="select-size" data-size="${variant.size}" ${variant.stock === 0 ? 'disabled' : ''} aria-pressed="${state.selectedSize === variant.size}">
        <strong>${variant.size}</strong><small>${variant.stock === 0 ? 'Нет' : variant.stock === 1 ? 'Последний' : 'В наличии'}</small>
      </button>`).join('');

    return `
      ${productBackHeader()}
      <section class="product-gallery card">
        <img src="${product.images[0]}" alt="${escapeHtml(product.name)}">
        <span class="gallery-counter">1 / ${product.images.length}</span>
        ${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ''}
      </section>
      <section class="product-info">
        <p class="eyebrow">${escapeHtml(Data.CATEGORIES.find(({ id }) => id === product.category)?.title || '')}</p>
        <h1>${escapeHtml(product.name)}</h1>
        <div class="product-price"><b>${money(product.price)}</b>${product.oldPrice ? `<s>${money(product.oldPrice)}</s>` : ''}</div>
        <p>${escapeHtml(product.description)}</p>
      </section>
      <section class="choice-section" id="product-choice">
        <div class="section-heading"><h2>Цвет</h2><span>${state.selectedColorId ? escapeHtml(getColor(product, state.selectedColorId)?.name) : 'Выберите'}</span></div>
        <div class="choice-grid choice-grid--colors">${colorButtons}</div>
        <div class="section-heading"><h2>Размер</h2><button type="button" data-action="size-guide" data-product-id="${product.id}">Как выбрать</button></div>
        ${state.selectedColorId ? `<div class="choice-grid">${sizeButtons}</div>` : '<p class="choice-hint">Сначала выберите цвет — покажем доступные размеры.</p>'}
      </section>
      <section class="details-list card">
        <details><summary>Посадка и параметры модели</summary><p>${escapeHtml(product.fit)} ${escapeHtml(product.model)}</p></details>
        <details><summary>Состав и уход</summary><p>${escapeHtml(product.composition)}. ${escapeHtml(product.care)}</p></details>
        <details><summary>Доставка, обмен и возврат</summary><p>Условия в прототипе демонстрационные. Финальные правила подтверждаются магазином до запуска.</p></details>
      </section>
      <div class="product-actions">
        <button class="secondary-button" type="button" data-action="add-to-cart">В корзину</button>
        <button class="primary-button" type="button" data-action="buy-now">Купить сейчас</button>
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
        <button class="cart-item__image" type="button" data-action="open-product" data-product-id="${item.productId}" aria-label="Открыть ${escapeHtml(item.name)}"><img src="${item.image}" alt="${escapeHtml(item.name)}"></button>
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
      <section class="notice-card"><span aria-hidden="true">${icon('info')}</span><p>Товары закрепятся за вами только после демонстрационной оплаты. Корзина не является резервом.</p></section>
      <section class="summary-card card">
        <div><span>Товары</span><b>${money(summary.subtotal)}</b></div><div class="summary-total"><span>Итого</span><b>${money(summary.total)}</b></div>
        <button class="primary-button" type="button" data-action="checkout-start">Оформить заказ</button>
        <button class="text-button text-button--center" type="button" data-action="navigate" data-screen="catalog">Продолжить покупки</button>
      </section>`;
  }

  function orderStatus(order) {
    return order.status === 'ready'
      ? { title: 'Заказ собран', text: order.delivery.id === 'pickup' ? 'Ждёт вас в магазине' : 'Готов к передаче в доставку', className: 'ready' }
      : { title: 'Оплачен, собираем', text: 'Сообщим, когда всё будет готово', className: 'paid' };
  }

  function renderOrders() {
    if (!state.order) {
      return `
        ${pageHeader('Заказы')}
        <section class="empty-state card"><span aria-hidden="true">${icon('receipt')}</span><h2>Заказов пока нет</h2><p>После демонстрационной оплаты здесь появится текущий заказ.</p><button class="primary-button" type="button" data-action="navigate" data-screen="catalog">Перейти в каталог</button></section>`;
    }
    const status = orderStatus(state.order);
    return `
      ${pageHeader('Заказы', 'Текущий заказ')}
      <button class="order-card card" type="button" data-action="open-order">
        <span class="status-pill status-pill--${status.className}">${status.title}</span>
        <span class="order-card__top"><strong>Заказ ${escapeHtml(state.order.id)}</strong><b>${money(state.order.total)}</b></span>
        <span>${escapeHtml(status.text)}</span><small>${state.order.items.length} позиций · ${escapeHtml(state.order.delivery.title)}</small>
      </button>`;
  }

  function renderStore() {
    return `
      ${pageHeader('Магазин')}
      <section class="store-visual card">
        <img src="assets/storefront.jpg" alt="Демонстрационный фасад магазина Фэшн стор">
        <span class="demo-label">Демо</span>
      </section>
      <section class="store-card card"><p class="eyebrow">Фэшн стор</p><h2>${escapeHtml(Data.STORE.tagline)}</h2><p>${escapeHtml(Data.STORE.description)}</p></section>
      <section class="info-list card">
        <div><span aria-hidden="true">${icon('map-pin')}</span><p><strong>Адрес</strong><small>${escapeHtml(Data.STORE.address)}</small></p></div>
        <div><span aria-hidden="true">${icon('clock')}</span><p><strong>Часы работы</strong><small>${escapeHtml(Data.STORE.hours)}</small></p></div>
        <div><span aria-hidden="true">${icon('at-sign')}</span><p><strong>Поддержка</strong><small>${escapeHtml(Data.STORE.support)}</small></p></div>
      </section>
      <section class="notice-card"><span aria-hidden="true">${icon('info')}</span><p>Адрес, контакты, доставка и правила в этом прототипе демонстрационные.</p></section>
      <div class="store-actions"><button class="secondary-button" type="button" data-action="demo-contact">Связаться</button><button class="secondary-button" type="button" data-action="store-rules">Оплата и возврат</button></div>
      <button class="seller-entry" type="button" data-action="enter-seller">Режим продавца <span>Демо ${icon('chevron-right')}</span></button>`;
  }

  function renderNotFound() {
    return `${pageHeader('Не найдено')}<section class="empty-state card"><h2>Экран не найден</h2><button class="primary-button" type="button" data-action="navigate" data-screen="home">На главную</button></section>`;
  }

  function checkoutProgress(current) {
    return `<div class="checkout-progress" aria-label="Шаг ${current} из 3">${[1, 2, 3].map((step) => `<span class="${step <= current ? 'is-active' : ''}">${step}</span>`).join('')}</div>`;
  }

  function renderCheckoutContact() {
    const summary = Core.getCartSummary(state.cart, 0);
    return `
      ${pageHeader('Контакты', 'Шаг 1 из 3')}
      ${checkoutProgress(1)}
      <section class="checkout-summary card"><span>${summary.itemCount} товара</span><b>${money(summary.subtotal)}</b></section>
      <form id="contact-form" class="form-card card" novalidate>
        <label><span>Имя</span><input name="name" type="text" autocomplete="name" maxlength="60" value="${escapeHtml(state.customer.name)}" placeholder="Как к вам обращаться" required></label>
        <label><span>Телефон</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" value="${escapeHtml(state.customer.phone)}" placeholder="+7 999 000-00-00" required aria-describedby="phone-help phone-error"></label>
        <small id="phone-help">Телефон нужен только для демонстрации выдачи или доставки.</small>
        <p id="phone-error" class="field-error" role="alert" hidden>Введите телефон: от 10 до 20 цифр и разрешённых символов.</p>
        <button class="primary-button" type="submit">Продолжить</button>
      </form>`;
  }

  function renderCheckoutDelivery() {
    const methods = Data.DELIVERY_METHODS.map((method) => `
      <button class="delivery-card card ${state.delivery?.id === method.id ? 'is-active' : ''}" type="button" data-action="choose-delivery" data-delivery-id="${method.id}" aria-pressed="${state.delivery?.id === method.id}">
        <span class="delivery-card__icon" aria-hidden="true">${icon(method.id === 'pickup' ? 'map-pin' : 'truck')}</span>
        <span><strong>${escapeHtml(method.title)}</strong><small>${escapeHtml(method.description)}</small></span>
        <span class="delivery-card__price">${method.price ? money(method.price) : 'Бесплатно'}<em>Демо</em></span>
      </button>`).join('');
    const subtotal = Core.getCartSummary(state.cart, 0).subtotal;
    const deliveryPrice = state.delivery?.price || 0;
    return `
      ${pageHeader('Получение', 'Шаг 2 из 3')}
      ${checkoutProgress(2)}
      <div class="delivery-list">${methods}</div>
      <section class="notice-card"><span aria-hidden="true">${icon('info')}</span><p>Адрес, стоимость и сроки указаны только для демонстрации интерфейса.</p></section>
      <section class="sticky-checkout">
        <div><span>Итого</span><b>${money(subtotal + deliveryPrice)}</b></div>
        <button class="primary-button" type="button" data-action="delivery-continue" ${state.delivery ? '' : 'disabled'}>Продолжить</button>
      </section>`;
  }

  function renderCheckoutReview() {
    if (!state.delivery) return renderCheckoutDelivery();
    const summary = Core.getCartSummary(state.cart, state.delivery.price);
    const items = state.cart.map((item) => `
      <li><img src="${item.image}" alt=""><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.colorName)}, ${escapeHtml(item.size)} · ${item.quantity} шт.</small></span><b>${money(item.price * item.quantity)}</b></li>`).join('');
    return `
      ${pageHeader('Проверка заказа', 'Шаг 3 из 3')}
      ${checkoutProgress(3)}
      <section class="review-section card"><div class="review-heading"><h2>Товары</h2><button type="button" data-action="navigate" data-screen="cart">Изменить</button></div><ul class="review-items">${items}</ul></section>
      <section class="review-section card"><div class="review-heading"><h2>Контакты</h2><button type="button" data-action="edit-contact">Изменить</button></div><p><strong>${escapeHtml(state.customer.name)}</strong><br>${escapeHtml(state.customer.phone)}</p></section>
      <section class="review-section card"><div class="review-heading"><h2>Получение</h2><button type="button" data-action="edit-delivery">Изменить</button></div><p><strong>${escapeHtml(state.delivery.title)}</strong><br>${escapeHtml(state.delivery.description)}</p></section>
      <section class="summary-card card">
        <div><span>Товары</span><b>${money(summary.subtotal)}</b></div>
        <div><span>Получение</span><b>${summary.deliveryPrice ? money(summary.deliveryPrice) : 'Бесплатно'}</b></div>
        <div class="summary-total"><span>Итого</span><b>${money(summary.total)}</b></div>
        <button class="primary-button" type="button" data-action="request-payment">Демо-оплата ${money(summary.total)}</button>
        <p class="demo-caption">Деньги не списываются. Настоящий платёжный провайдер не подключён.</p>
      </section>`;
  }

  function renderPaymentSuccess() {
    if (!state.order) return renderNotFound();
    return `
      <section class="success-screen">
        <div class="success-mark" aria-hidden="true">${icon('check')}</div>
        <p class="eyebrow">Демонстрационный заказ</p>
        <h1>Оплата прошла</h1>
        <p>В прототипе платёж не выполнялся. Мы создали локальный заказ для проверки сценария.</p>
        <section class="success-card card"><span>Заказ</span><strong>${escapeHtml(state.order.id)}</strong><span>Статус</span><strong>Оплачен, собираем</strong><span>Итого</span><strong>${money(state.order.total)}</strong></section>
        <button class="primary-button" type="button" data-action="open-order">Открыть заказ</button>
        <button class="text-button text-button--center" type="button" data-action="navigate" data-screen="catalog">Вернуться в каталог</button>
      </section>`;
  }

  function orderItems(order) {
    return order.items.map((item) => `
      <li class="order-item"><img src="${item.image}" alt="${escapeHtml(item.name)}"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.colorName)}, ${escapeHtml(item.size)} · ${item.quantity} шт.</small></span><b>${money(item.price * item.quantity)}</b></li>`).join('');
  }

  function renderOrderDetail() {
    if (!state.order) return renderNotFound();
    const status = orderStatus(state.order);
    return `
      ${pageHeader(`Заказ ${state.order.id}`)}
      <section class="order-status-card order-status-card--${status.className} card"><span class="status-pill status-pill--${status.className}">${status.title}</span><h2>${escapeHtml(status.text)}</h2><p>${state.order.status === 'ready' ? 'Статус изменён в демонстрационном режиме продавца.' : 'Продавец увидит заказ в своей очереди.'}</p></section>
      <section class="review-section card"><h2>Состав</h2><ul class="review-items">${orderItems(state.order)}</ul></section>
      <section class="info-list card">
        <div><span aria-hidden="true">${icon('map-pin')}</span><p><strong>${escapeHtml(state.order.delivery.title)}</strong><small>${escapeHtml(state.order.delivery.description)}</small></p></div>
        <div><span aria-hidden="true">₽</span><p><strong>${money(state.order.total)}</strong><small>Демонстрационный итог</small></p></div>
      </section>
      <button class="secondary-button full-width" type="button" data-action="demo-contact">Связаться с магазином</button>`;
  }

  function renderSellerOrders() {
    const orderMatchesTab = state.order && (
      state.sellerTab === 'ready' ? state.order.status === 'ready' : state.order.status === 'paid'
    );
    const content = orderMatchesTab
      ? `<button class="seller-order-card card" type="button" data-action="seller-open-order"><span class="status-pill status-pill--${state.order.status === 'ready' ? 'ready' : 'paid'}">${state.order.status === 'ready' ? 'Готов' : 'Собрать'}</span><span><strong>${escapeHtml(state.order.id)}</strong><small>${state.order.items.length} позиций · ${escapeHtml(state.order.delivery.title)}</small></span><b>${money(state.order.total)}</b></button>`
      : `<section class="empty-state card"><span aria-hidden="true">${icon('package')}</span><h2>${state.sellerTab === 'ready' ? 'Готовых заказов нет' : 'Заказов на сборку нет'}</h2><p>Демо-заказ появится в нужной вкладке после оплаты или сборки.</p></section>`;
    return `
      <header class="seller-header"><div><p class="eyebrow">Демо-режим</p><h1>Заказы продавца</h1></div><button class="secondary-button" type="button" data-action="exit-seller">В магазин</button></header>
      <div class="seller-tabs"><button class="${state.sellerTab === 'collect' ? 'is-active' : ''}" type="button" data-action="set-seller-tab" data-tab="collect">Собрать</button><button class="${state.sellerTab === 'ready' ? 'is-active' : ''}" type="button" data-action="set-seller-tab" data-tab="ready">Готовы</button></div>
      ${content}
      <section class="notice-card"><span aria-hidden="true">${icon('info')}</span><p>В рабочей версии доступ проверяется сервером по Telegram ID. Эта кнопка открыта только для демонстрации.</p></section>`;
  }

  function renderSellerOrder() {
    if (!state.order) return renderSellerOrders();
    const status = orderStatus(state.order);
    return `
      ${pageHeader(`Заказ ${state.order.id}`, 'Режим продавца')}
      <section class="order-status-card card"><span class="status-pill status-pill--${status.className}">${status.title}</span><p>${escapeHtml(status.text)}</p></section>
      <section class="review-section card"><h2>Собрать</h2><ul class="review-items">${orderItems(state.order)}</ul></section>
      <section class="info-list card"><div><span aria-hidden="true">${icon('at-sign')}</span><p><strong>${escapeHtml(state.order.customer.name)}</strong><small>${escapeHtml(state.order.customer.phone)}</small></p></div><div><span aria-hidden="true">${icon('map-pin')}</span><p><strong>${escapeHtml(state.order.delivery.title)}</strong><small>${escapeHtml(state.order.delivery.description)}</small></p></div></section>
      ${state.order.status === 'paid' ? '<button class="primary-button full-width seller-ready-button" type="button" data-action="request-ready">Заказ собран</button>' : '<button class="secondary-button full-width seller-ready-button" type="button" data-action="exit-seller">Вернуться в магазин</button>'}`;
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
    'seller-orders': renderSellerOrders,
    'seller-order': renderSellerOrder,
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

  function render() {
    applyTelegramTheme();
    screenElement.dataset.screen = state.screen;
    screenElement.classList.toggle('screen--full', CHECKOUT_SCREENS.has(state.screen));
    screenElement.innerHTML = (renderers[state.screen] || renderNotFound)();
    bottomNav.hidden = !ROOT_SCREENS.has(state.screen);
    updateNav();
    updateBackButton();
    UI.resetScroll(screenElement);
  }

  function selectColor(colorId) {
    state.selectedColorId = colorId;
    state.selectedSize = null;
    render();
  }

  function selectSize(size) {
    state.selectedSize = size;
    render();
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
    if (!variant || variant.stock <= 0) {
      showToast('Этот вариант закончился');
      return;
    }
    const item = {
      key: `${product.id}:${color.id}:${variant.size}`,
      productId: product.id,
      name: product.name,
      image: product.images[0],
      colorId: color.id,
      colorName: color.name,
      size: variant.size,
      price: product.price,
      quantity: 1,
    };
    state.cart = Core.addCartItem(state.cart, item, variant.stock);
    saveState();
    showToast('Добавлено в корзину');
    if (goToCheckout) navigate('checkout-contact');
    else render();
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
    render();
  }

  function renderFilterSheet() {
    const sizes = ['XS', 'S', 'M', 'L', 'XL'];
    const uniqueColors = [...new Map(
      Data.PRODUCTS.flatMap(({ colors }) => colors).map((color) => [color.id, color]),
    ).values()];
    const results = Core.filterProducts(Data.PRODUCTS, state.draftFilters).length;
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

  function openSizeGuide(productId) {
    const product = getProduct(productId);
    const rows = Object.entries(product.measurements).map(([size, value]) => `<tr><th>${size}</th><td>${escapeHtml(value)}</td></tr>`).join('');
    openSheet(`
      <div class="sheet__header"><p class="eyebrow">${escapeHtml(product.name)}</p><h2>Размерная сетка</h2></div>
      <p>Сравните замеры вещи со своей одеждой с похожей посадкой.</p>
      <table class="size-table"><thead><tr><th>Размер</th><th>Замеры, см</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="choice-hint">${escapeHtml(product.fit)}</p>
      <button class="primary-button" type="button" data-action="close-sheet">Понятно</button>
    `, { title: 'Размерная сетка' });
  }

  function openRules() {
    openSheet(`
      <div class="sheet__header"><p class="eyebrow">Важно</p><h2>Оплата и возврат</h2></div>
      <p>В прототипе нет настоящей оплаты, доставки и возврата денег.</p>
      <p>Перед запуском магазин должен подтвердить платёжного провайдера, онлайн-кассу, сроки получения и правила обмена.</p>
      <button class="primary-button" type="button" data-action="close-sheet">Понятно</button>
    `, { title: 'Демонстрационные условия' });
  }

  function startCheckout() {
    if (!state.cart.length) {
      showToast('Корзина пока пуста');
      return;
    }
    if (state.order) {
      showToast('В прототипе доступен один текущий заказ');
      navigate('order-detail');
      return;
    }
    navigate('checkout-contact');
  }

  function requestDemoPayment() {
    const summary = Core.getCartSummary(state.cart, state.delivery?.price || 0);
    openSheet(`
      <div class="sheet__header"><p class="eyebrow">Без списания денег</p><h2>Подтвердить демо-оплату?</h2></div>
      <p>Будет создан только локальный заказ на сумму <strong>${money(summary.total)}</strong>.</p>
      <div class="sheet__actions"><button class="secondary-button" type="button" data-action="close-sheet">Отмена</button><button class="primary-button" type="button" data-action="confirm-demo-payment">Подтвердить</button></div>
    `, { title: 'Подтверждение демонстрационной оплаты' });
  }

  function submitDemoPayment() {
    if (state.isSubmitting || !state.cart.length || !state.delivery) return;
    if (state.order) {
      closeSheet();
      navigate('order-detail');
      return;
    }
    state.isSubmitting = true;
    const orderId = `FS-${String(Date.now()).slice(-6)}`;
    state.order = Core.createDemoOrder(
      state.cart,
      state.customer,
      state.delivery,
      null,
      orderId,
      new Date().toISOString(),
    );
    state.cart = [];
    saveState();
    state.isSubmitting = false;
    closeSheet();
    navigate('payment-success');
  }

  function enterSellerMode() {
    state.sellerMode = true;
    state.sellerTab = state.order?.status === 'ready' ? 'ready' : 'collect';
    navigate('seller-orders');
  }

  function exitSellerMode() {
    state.sellerMode = false;
    state.history = [];
    state.screen = 'store';
    state.params = {};
    render();
  }

  function requestOrderReady() {
    if (!state.order || state.order.status !== 'paid') return;
    const message = state.order.delivery.id === 'pickup'
      ? 'Покупатель увидит: «Ждёт вас в магазине».'
      : 'Покупатель увидит: «Готов к передаче в доставку».';
    openSheet(`
      <div class="sheet__header"><p class="eyebrow">${escapeHtml(state.order.id)}</p><h2>Заказ действительно собран?</h2></div>
      <p>${message}</p>
      <div class="sheet__actions"><button class="secondary-button" type="button" data-action="close-sheet">Отмена</button><button class="primary-button" type="button" data-action="confirm-ready">Подтвердить</button></div>
    `, { title: 'Подтверждение сборки заказа' });
  }

  function confirmOrderReady() {
    if (!state.order || state.order.status !== 'paid') return;
    state.order = Core.markOrderReady(state.order);
    state.sellerTab = 'ready';
    saveState();
    closeSheet();
    showToast('Статус обновлён: заказ собран');
    render();
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
    'select-size': (control) => selectSize(control.dataset.size),
    'size-guide': (control) => openSizeGuide(control.dataset.productId),
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
    'open-order': () => navigate('order-detail'),
    'demo-contact': () => showToast('Демонстрационный контакт: ' + Data.STORE.support),
    'store-rules': openRules,
    'enter-seller': enterSellerMode,
    'exit-seller': exitSellerMode,
    'seller-open-order': () => navigate('seller-order'),
    'set-seller-tab': (control) => {
      state.sellerTab = control.dataset.tab === 'ready' ? 'ready' : 'collect';
      render();
    },
    'request-ready': requestOrderReady,
    'confirm-ready': confirmOrderReady,
    'open-offer-bot': openOfferBot,
    'share-bot': shareBot,
    'close-sheet': closeSheet,
  };

  function init() {
    hydrateStaticIcons();
    applyViewportLayout();
    loadPersistedState();
    applyTelegramTheme();
    tg?.ready();
    tg?.expand();
    tg?.BackButton?.onClick(goBack);
    tg?.onEvent?.('themeChanged', applyTelegramTheme);
    tg?.onEvent?.('viewportChanged', applyViewportLayout);
    window.visualViewport?.addEventListener('resize', applyViewportLayout);
    window.addEventListener('resize', applyViewportLayout);
    window.setTimeout(() => {
      render();
      showFirstOpenOffer();
    }, 300);
  }

  document.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled || control.matches('input[data-action]')) return;
    actions[control.dataset.action]?.(control, event);
  });

  document.addEventListener('change', (event) => {
    const control = event.target.closest('[data-action]');
    if (control?.dataset.action === 'toggle-new') actions['toggle-new'](control);
  });

  document.addEventListener('submit', (event) => {
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
  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement) {
      event.target.closest('.product-card__media, .product-gallery, .category-card, .store-visual')?.classList.add('image-fallback');
      event.target.hidden = true;
    }
  }, true);

  window.FashionStoreApp = { init, navigate, goBack, render };
  document.addEventListener('DOMContentLoaded', init, { once: true });
})(window, document);
