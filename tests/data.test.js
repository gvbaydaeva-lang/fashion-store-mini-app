/* Тесты проверяют целостность демонстрационного каталога. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { STORE, CATEGORIES, PRODUCTS, DELIVERY_METHODS } = require('../data.js');

test('стартовый каталог пуст, а условия предзаказа зафиксированы', () => {
  assert.equal(STORE.name, 'Fashion Store');
  assert.equal(STORE.tagline, 'Трендовые модели без лишних наценок.');
  assert.equal(STORE.description, 'Стиль, который не требует переплаты.');
  assert.equal(STORE.preorderTerms.delivery, 'Цена указана с учётом доставки до Элисты');
  assert.deepEqual(CATEGORIES.map(({ id }) => id), ['all']);
  assert.deepEqual(PRODUCTS, []);
  assert.deepEqual(DELIVERY_METHODS.map(({ id }) => id), ['pickup']);
  assert.ok(DELIVERY_METHODS.every(({ demo }) => demo === true));
});

test('hero-изображение локально и существует', () => {
  const root = path.join(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, 'assets/preorder-hero-bags.png')));
});
