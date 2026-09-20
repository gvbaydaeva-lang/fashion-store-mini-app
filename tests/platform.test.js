const test = require('node:test');
const assert = require('node:assert/strict');

const Platform = require('../platform.js');

function createWindow(overrides = {}) {
  const css = new Map();
  const listeners = new Map();
  const history = { backCalls: 0, back() { this.backCalls += 1; } };
  const navigator = {};
  return {
    document: {
      documentElement: {
        dataset: {},
        style: { setProperty(name, value) { css.set(name, value); } },
      },
    },
    history,
    navigator,
    addEventListener(type, handler) { listeners.set(type, handler); },
    setTimeout,
    __css: css,
    __listeners: listeners,
    ...overrides,
  };
}

test('browser mode works without Telegram and uses browser fallbacks', async () => {
  const windowLike = createWindow();
  const platform = Platform.createPlatform(windowLike);

  assert.equal(platform.mode, 'browser');
  assert.equal(platform.isTelegram(), false);
  assert.equal(platform.getUserName(), 'Гость');
  platform.setBackVisibility(true);
  platform.goBack();
  assert.equal(windowLike.history.backCalls, 1);

  let clipboardText = '';
  windowLike.navigator.clipboard = { async writeText(value) { clipboardText = value; } };
  assert.equal(await platform.share('https://example.test/order/1', 'Заказ'), true);
  assert.equal(clipboardText, 'https://example.test/order/1');
});

test('browser theme is applied through regular CSS variables', () => {
  const windowLike = createWindow();
  const platform = Platform.createPlatform(windowLike);

  platform.applyTheme({ bg_color: '#111111', text_color: '#eeeeee' });

  assert.equal(platform.isTelegram(), false);
  assert.equal(windowLike.__css.get('--tg-bg'), '#111111');
  assert.equal(windowLike.__css.get('--tg-text'), '#eeeeee');
  assert.equal(windowLike.document.documentElement.dataset.platform, 'browser');
});

test('Telegram mode exposes the existing back, theme, share and raw initData capabilities', async () => {
  const calls = [];
  const telegram = {
    WebApp: {
      initData: 'signed-init-data',
      initDataUnsafe: { user: { first_name: 'Гиляна' } },
      themeParams: { bg_color: '#fff' },
      colorScheme: 'dark',
      BackButton: {
        show() { calls.push('show'); },
        hide() { calls.push('hide'); },
        onClick(handler) { calls.push(['back', handler]); },
      },
      openTelegramLink(url) { calls.push(['share', url]); },
    },
  };
  const platform = Platform.createPlatform(createWindow({ Telegram: telegram }));
  const onBack = () => {};

  assert.equal(platform.mode, 'telegram');
  assert.equal(platform.isTelegram(), true);
  assert.equal(platform.getUserName(), 'Гиляна');
  assert.equal(platform.getInitData(), 'signed-init-data');
  platform.setBackVisibility(true);
  platform.setBackVisibility(false);
  platform.goBack(onBack);
  assert.deepEqual(calls.slice(0, 3), ['show', 'hide', ['back', onBack]]);
  platform.applyTheme();
  assert.equal(await platform.share('https://t.me/share/url?url=x', 'text'), true);
  assert.deepEqual(calls.at(-1), ['share', 'https://t.me/share/url?url=x']);
});
