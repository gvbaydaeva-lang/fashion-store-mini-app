/* Здесь хранятся стартовые данные витрины. */
(function exposeData(root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  root.FashionStoreData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createData() {
  const STORE = {
    name: 'Fashion Store',
    tagline: 'Трендовые модели без лишних наценок.',
    description: 'Стиль, который не требует переплаты.',
    address: 'Самовывоз в Элисте — адрес сообщим после оформления заказа.',
    hours: '',
    support: '',
    phone: '',
    preorderTerms: {
      payment: 'Полная оплата при оформлении предзаказа',
      leadTime: 'Срок поступления: 7–10 дней',
      pickup: 'Самовывоз в Элисте',
      delivery: 'Цена указана с учётом доставки до Элисты',
    },
  };

  const CATEGORIES = [{ id: 'all', title: 'Все' }];
  const PRODUCTS = [];

  const DELIVERY_METHODS = [{
    id: 'pickup',
    title: 'Самовывоз в Элисте',
    description: 'Адрес самовывоза сообщим после оформления заказа.',
    price: 0,
    demo: true,
  }];

  return { STORE, CATEGORIES, PRODUCTS, DELIVERY_METHODS };
});
