/* Проверяет видимую реакцию точки входа, если обязательный файл запуска не загрузился. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function loadStartupGuard() {
  const guardSource = indexSource.match(/<script data-startup-guard>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(guardSource, 'не найден исполняемый startup guard в index.html');

  const listeners = new Map();
  const screen = { innerHTML: '' };
  let reloads = 0;
  const document = {
    documentElement: { dataset: {} },
    querySelector(selector) { return selector === '#screen' ? screen : null; },
    addEventListener(type, handler) { listeners.set(type, handler); },
  };
  const window = { document, location: { reload() { reloads += 1; } } };

  vm.runInNewContext(guardSource, { window, document }, { filename: 'startup-guard.js' });
  return {
    fail(resource) { window.FashionStoreStartup.fail(resource); },
    window,
    document,
    clickRetry() {
      listeners.get('click')?.({
        target: { closest(selector) { return selector === '[data-startup-retry]' ? {} : null; } },
      });
    },
    resourceError(resource) {
      listeners.get('error')?.({
        target: { tagName: 'SCRIPT', dataset: { startupModule: '' }, src: resource },
      });
    },
    screen,
    get reloads() { return reloads; },
  };
}

function loadMobileStartupVisibility(telegramPlatform = null) {
  const visibilitySource = indexSource.match(/<script data-mobile-startup-visibility>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(visibilitySource, 'не найден исполняемый mobile startup visibility guard в index.html');

  const document = { documentElement: { dataset: {} } };
  const window = {
    document,
    Telegram: telegramPlatform ? { WebApp: { platform: telegramPlatform } } : undefined,
  };

  vm.runInNewContext(visibilitySource, { window, document }, { filename: 'mobile-startup-visibility.js' });
  return { document };
}

test('iOS и Android получают признак видимого стартового экрана до загрузки модулей', () => {
  const ios = loadMobileStartupVisibility('ios');
  const android = loadMobileStartupVisibility('android');
  const desktop = loadMobileStartupVisibility('tdesktop');

  assert.equal(ios.document.documentElement.dataset.mobileTelegram, 'true');
  assert.equal(android.document.documentElement.dataset.mobileTelegram, 'true');
  assert.equal(desktop.document.documentElement.dataset.mobileTelegram, undefined);
});

test('сбой обязательного файла показывает понятную ошибку и перезапускается только по нажатию', () => {
  const startup = loadStartupGuard();

  startup.fail('https://example.invalid/core.js?v=test');

  assert.match(startup.screen.innerHTML, /Не удалось запустить приложение/);
  assert.match(startup.screen.innerHTML, /core\.js/);
  assert.match(startup.screen.innerHTML, /20261008-unified-startup-guard-1/);
  assert.equal(startup.reloads, 0);

  startup.clickRetry();

  assert.equal(startup.reloads, 1);
});

test('app не перерисовывает экран ошибки после сбоя обязательного файла', () => {
  const startup = loadStartupGuard();
  startup.fail('https://example.invalid/platform.js?v=test');
  const expectedError = startup.screen.innerHTML;

  assert.doesNotThrow(() => {
    vm.runInNewContext(appSource, {
      window: startup.window,
      document: startup.document,
      FormData: class FormData {},
      FileReader: class FileReader {},
      HTMLImageElement: class HTMLImageElement {},
      Intl,
      Map,
      Set,
    }, { filename: 'app.js' });
  });
  assert.equal(startup.window.FashionStoreApp, undefined);
  assert.equal(startup.screen.innerHTML, expectedError);
});

test('обязательные локальные модули остаются в едином порядке и guard ловит их ошибку', () => {
  const scripts = [...indexSource.matchAll(/<script src="([^"]+)"( data-startup-module)?><\/script>/g)]
    .map(([, source, startupModule]) => ({ source, startupModule }));
  const localScripts = scripts.filter(({ source }) => !source.startsWith('https://'));

  assert.deepEqual(
    localScripts.map(({ source }) => source.replace(/\?.*$/, '')),
    ['platform.js', 'data.js', 'core.js', 'ui.js', 'admin-draft-store.js', 'api.js', 'app.js'],
  );
  localScripts.forEach(({ startupModule }) => {
    assert.equal(startupModule, ' data-startup-module');
  });
  assert.deepEqual(
    localScripts.map(({ source }) => source),
    [
      'platform.js?v=20261003-mobile-save-correlation-1',
      'data.js?v=20261004-data-syntax-recovery-1',
      'core.js?v=20261004-mobile-webview-compat-1',
      'ui.js',
      'admin-draft-store.js?v=20260904-admin-save-1',
      'api.js?v=20261004-mobile-webview-compat-1',
      'app.js?v=20261008-unified-startup-guard-1',
    ],
  );

  const startup = loadStartupGuard();
  startup.resourceError('https://example.invalid/core.js?v=test');
  assert.match(startup.screen.innerHTML, /core\.js/);
});
