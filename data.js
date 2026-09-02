/* Здесь хранятся стартовые данные витрины. */
(function exposeData(root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  root.FashionStoreData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createData() {
  const STORE = {
    name: 'Fashion Style',
    tagline: 'Трендовая одежда для стильных образов без лишних наценок.',
    description: 'Выбирайте в каталоге и оформляйте заказ прямо в Telegram.',
    address: 'Самовывоз в Элисте — адрес сообщим после оформления заказа.',
    hours: '',
    support: '',
    phone: '',
    preorderTerms: {
      payment: 'Полная оплата при оформлении заказа.',
      orderPeriod: 'Заказ можно оформить только в период действующего закупа.',
      leadTime: 'Срок поступления: 7–10 дней.',
      pickup: 'Самовывоз в Элисте.',
      delivery: 'Цены указаны с учётом доставки до Элисты.',
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
