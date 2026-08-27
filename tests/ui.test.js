/* Проверяет единый SVG-набор интерфейса без эмодзи и текстовых пиктограмм. */
const test = require('node:test');
const assert = require('node:assert/strict');

const { icon, getMiniAppWidth, resetScroll } = require('../ui.js');

test('иконка возвращает декоративный SVG с единым viewBox', () => {
  const markup = icon('home');

  assert.match(markup, /^<svg /);
  assert.match(markup, /viewBox="0 0 24 24"/);
  assert.match(markup, /aria-hidden="true"/);
  assert.doesNotMatch(markup, /[⌂▦⌑✓●⌖◷◇]/);
});

test('неизвестное имя иконки безопасно возвращает пустую строку', () => {
  assert.equal(icon('unknown-icon'), '');
});

test('кнопка шаринга использует общую SVG-иконку', () => {
  const markup = icon('share');

  assert.match(markup, /^<svg /);
  assert.match(markup, /viewBox="0 0 24 24"/);
});

test('оболочка Mini App остаётся компактной на широком экране', () => {
  assert.equal(getMiniAppWidth(375), 375);
  assert.equal(getMiniAppWidth(768), 520);
  assert.equal(getMiniAppWidth(1024), 520);
});

test('переход сбрасывает прокрутку внутреннего экрана, а не окна', () => {
  let options = null;
  const scrollContainer = {
    scrollTo(nextOptions) {
      options = nextOptions;
    },
  };

  resetScroll(scrollContainer);

  assert.deepEqual(options, { top: 0, left: 0, behavior: 'auto' });
});
