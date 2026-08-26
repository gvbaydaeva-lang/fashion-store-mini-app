/* Тесты проверяют целостность демонстрационного каталога. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { STORE, CATEGORIES, PRODUCTS, DELIVERY_METHODS } = require('../data.js');

test('каталог содержит бренд, пять категорий и полноценные варианты', () => {
  assert.equal(STORE.name, 'Фэшн стор');
  assert.equal(STORE.tagline, 'Стильная женская одежда на каждый день');
  assert.deepEqual(
    CATEGORIES.map(({ id }) => id),
    ['all', 'dresses', 'jackets', 'trousers', 'knitwear', 'shirts'],
  );
  assert.ok(PRODUCTS.length >= 8);

  for (const product of PRODUCTS) {
    assert.ok(product.images.length >= 1);
    assert.ok(product.variants.some(({ stock }) => stock > 0));
    assert.ok(product.variants.every(({ stock }) => Number.isInteger(stock) && stock >= 0));
  }

  assert.deepEqual(DELIVERY_METHODS.map(({ id }) => id), ['pickup', 'courier']);
  assert.ok(DELIVERY_METHODS.every(({ demo }) => demo === true));
});

test('все изображения каталога локальны и существуют', () => {
  const root = path.join(__dirname, '..');

  for (const product of PRODUCTS) {
    for (const image of product.images) {
      assert.match(image, /^assets\/[a-z0-9-]+\.jpg$/);
      assert.ok(fs.existsSync(path.join(root, image)), image);
    }
  }

  assert.ok(fs.existsSync(path.join(root, 'assets/storefront.jpg')));
});
