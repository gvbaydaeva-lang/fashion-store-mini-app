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

  return {
    filterProducts,
    sortProducts,
    getAvailableOptions,
    addCartItem,
    setCartItemQuantity,
    removeCartItem,
    getCartSummary,
    createDemoOrder,
    markOrderReady,
  };
});
