/* Тесты проверяют целостность демонстрационного каталога. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { STORE, CATEGORIES, PRODUCTS, DELIVERY_METHODS } = require('../data.js');

test('стартовый каталог пуст, а главная использует утверждённое позиционирование и условия заказа', () => {
  assert.equal(STORE.name, '🛍 Выгодные покупки');
  assert.equal(STORE.tagline, 'Трендовая одежда для стильных образов без лишних наценок.');
  assert.equal(STORE.description, 'Выгодные покупки и закупки женской одежды по приятным ценам с доставкой до Элисты. Новинки, акции и заказ прямо в Telegram.');
  assert.equal(STORE.preorderTerms.payment, 'Полная 100% предоплата при оформлении заказа.');
  assert.equal(STORE.preorderTerms.orderPeriod, undefined);
  assert.equal(STORE.preorderTerms.leadTime, 'Срок доставки: 7–12 дней.');
  assert.equal(STORE.preorderTerms.pickup, 'Самовывоз в Элисте.');
  assert.equal(STORE.preorderTerms.delivery, 'Цены указаны с учётом доставки до Элисты.');
  assert.equal(STORE.preorderTerms.returns, 'Обмена и возврата нет.');
  assert.equal(STORE.preorderTerms.fitting, 'Примерки нет.');
  assert.equal(STORE.preorderTerms.onlineOnly, 'Только 100% онлайн-выкуп. Это не офлайн-магазин.');
  assert.equal(STORE.information.title, 'Условия покупок');
  assert.match(STORE.information.purchasing, /Срок доставки — 7–12 дней/);
  assert.match(STORE.information.prices, /минимальной наценкой/);
  assert.match(STORE.information.benefits, /подарки, розыгрыши/);
  assert.deepEqual(CATEGORIES.map(({ id }) => id), ['all']);
  assert.deepEqual(PRODUCTS, []);
  assert.deepEqual(DELIVERY_METHODS.map(({ id }) => id), ['pickup']);
  assert.ok(DELIVERY_METHODS.every(({ demo }) => demo === true));
});

test('hero-изображение локально и существует', () => {
  const root = path.join(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, 'assets/preorder-hero-bags.png')));
});
