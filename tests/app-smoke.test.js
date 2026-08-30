/* Smoke-тест загружает настоящий app.js и проверяет рендер административных экранов. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Data = require('../data.js');
const Core = require('../core.js');
const UI = require('../ui.js');

function createClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    toggle(name, force) {
      if (force === true) values.add(name);
      else if (force === false) values.delete(name);
      else if (values.has(name)) values.delete(name);
      else values.add(name);
    },
    contains(name) { return values.has(name); },
  };
}

function createElement() {
  return {
    children: [],
    classList: createClassList(),
    dataset: {},
    hidden: false,
    innerHTML: '',
    style: { setProperty() {} },
    scrollTop: 0,
    textContent: '',
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    removeAttribute() {},
    setAttribute() {},
    scrollTo() {},
  };
}

function loadApp() {
  const elements = new Map([
    ['#screen', createElement()],
    ['#app', createElement()],
    ['#bottom-nav', createElement()],
    ['#cart-badge', createElement()],
    ['#toast', createElement()],
    ['#modal-root', createElement()],
  ]);
  const storage = new Map([['fashion-store-offer-seen-v1', 'seen']]);
  const document = {
    documentElement: createElement(),
    querySelector(selector) { return elements.get(selector) || null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const window = {
    FashionStoreData: Data,
    FashionStoreCore: Core,
    FashionStoreUI: UI,
    HTMLImageElement: class HTMLImageElement {},
    document,
    innerHeight: 800,
    innerWidth: 375,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    addEventListener() {},
    clearTimeout() {},
    setTimeout(callback) { callback(); return 1; },
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  vm.runInNewContext(source, {
    window,
    document,
    FormData: class FormData {},
    FileReader: class FileReader {},
    HTMLImageElement: window.HTMLImageElement,
    Intl,
    Map,
    Set,
  }, { filename: 'app.js' });
  window.FashionStoreApp.init();
  return { app: window.FashionStoreApp, screen: elements.get('#screen') };
}

test('административные экраны рендерятся из реального app.js без runtime-ошибки', () => {
  const { app, screen } = loadApp();

  app.navigate('seller-access');
  assert.match(screen.innerHTML, /Открыть демо-панель/);

  app.navigate('seller-products');
  assert.match(screen.innerHTML, /Добавить товар/);
  assert.match(screen.innerHTML, /Платье Воздух/);

  app.navigate('seller-product-edit');
  assert.match(screen.innerHTML, /Шаг 1 из 4/);
  assert.match(screen.innerHTML, /Фото товара/);
});

test('карточка сразу показывает цвет и размер и сохраняет прокрутку при перерисовке', () => {
  const { app, screen } = loadApp();

  app.navigate('product', { productId: 'dress-air' });
  assert.match(screen.innerHTML, /data-action="select-color"/);
  assert.match(screen.innerHTML, /data-action="select-size"/);
  assert.match(screen.innerHTML, /Перейти в корзину/);

  screen.scrollTop = 180;
  app.render({ preserveScroll: true });
  assert.equal(screen.scrollTop, 180);
});
