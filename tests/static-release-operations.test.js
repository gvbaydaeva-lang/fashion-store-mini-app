const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptsDirectory = path.join(__dirname, '..', '..', 'scripts');

function readScript(fileName) {
  return fs.readFileSync(path.join(scriptsDirectory, fileName), 'utf8');
}

test('deploy полного пакета проверяет manifest до переключения current и не перезапускает API', () => {
  const source = readScript('deploy-static-release.sh');

  assert.match(source, /release\.json/);
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /chmod -R a\+rX/);
  assert.match(source, /ln -sfn/);
  assert.match(source, /releases\/current/);
  assert.doesNotMatch(source, /systemctl\s+(?:restart|reload)\s+fashion-store\.service/);
  assert.doesNotMatch(source, /psql|postgres|drop\s+database/i);
});

test('bootstrap переводит Nginx только после nginx -t и сохраняет прежнюю конфигурацию', () => {
  const source = readScript('bootstrap-static-release.sh');

  assert.match(source, /cp --preserve/);
  assert.match(source, /chmod -R a\+rX/);
  assert.match(source, /nginx -t/);
  assert.match(source, /nginx -s reload/);
  assert.match(source, /releases\/current\/tg-app/);
});

test('rollback принимает только явный release ID, проверяет manifest и не трогает данные', () => {
  const source = readScript('rollback-static-release.sh');

  assert.match(source, /Usage:.*release-id/);
  assert.match(source, /release\.json/);
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /ln -sfn/);
  assert.doesNotMatch(source, /systemctl\s+(?:restart|reload)\s+fashion-store\.service/);
  assert.doesNotMatch(source, /psql|postgres|drop\s+database/i);
});
