/* Проверяет, что локальный статический пакет нельзя собрать из смешанных или повреждённых файлов. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const scriptUrl = pathToFileURL(path.join(__dirname, '..', '..', 'scripts', 'build-static-release.mjs')).href;
const STATIC_FILES = [
  'index.html', 'platform.js', 'data.js', 'core.js', 'ui.js',
  'admin-draft-store.js', 'api.js', 'app.js', 'styles.css',
];
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const CREATED_AT = '2026-10-08T12:00:00.000Z';

async function loadReleaseTools() {
  return import(scriptUrl);
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function createIndex({ extra = '', omitted = '' } = {}) {
  const scripts = STATIC_FILES
    .filter((file) => file.endsWith('.js') && file !== omitted)
    .map((file) => `<script src="${file}"></script>`)
    .join('\n');
  const stylesheet = omitted === 'styles.css' ? '' : '<link rel="stylesheet" href="styles.css">';
  return `<!doctype html><html><head>${stylesheet}</head><body>${scripts}${extra}</body></html>`;
}

function createSourceFixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fashion-store-release-test-'));
  const sourceDir = path.join(root, 'tg-app');
  const releasesDir = path.join(root, 'dist', 'releases');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  STATIC_FILES.forEach((file) => {
    const contents = file === 'index.html'
      ? createIndex(options.index)
      : file === 'styles.css' ? 'body { color: black; }' : `window.${file.replace(/\W/g, '_')} = true;`;
    writeFile(path.join(sourceDir, file), contents);
  });
  return { root, sourceDir, releasesDir };
}

function releaseOptions(fixture, overrides = {}) {
  return {
    sourceDir: fixture.sourceDir,
    releasesDir: fixture.releasesDir,
    gitCommit: COMMIT,
    createdAt: CREATED_AT,
    trackedFiles: STATIC_FILES,
    ...overrides,
  };
}

test('строитель создаёт пакет с ровно девятью проверяемыми файлами и manifest', async (t) => {
  const { buildStaticRelease, verifyReleasePackage, STATIC_FILES: exportedFiles } = await loadReleaseTools();
  const fixture = createSourceFixture(t);

  assert.deepEqual(exportedFiles, STATIC_FILES);
  const result = buildStaticRelease(releaseOptions(fixture));

  assert.equal(result.manifest.gitCommit, COMMIT);
  assert.equal(result.manifest.createdAt, CREATED_AT);
  assert.deepEqual(
    fs.readdirSync(path.join(result.releaseDirectory, 'tg-app')).sort(),
    [...STATIC_FILES].sort(),
  );
  assert.deepEqual(verifyReleasePackage(result.releaseDirectory), result.manifest);
});

test('строитель отклоняет отсутствующий файл, постороннюю ссылку и пропущенную обязательную ссылку', async (t) => {
  const { buildStaticRelease } = await loadReleaseTools();

  const missing = createSourceFixture(t);
  fs.rmSync(path.join(missing.sourceDir, 'core.js'));
  assert.throws(() => buildStaticRelease(releaseOptions(missing)), /core\.js/);

  const extraReference = createSourceFixture(t, { index: { extra: '<script src="old-app.js"></script>' } });
  assert.throws(() => buildStaticRelease(releaseOptions(extraReference)), /old-app\.js/);

  const missingReference = createSourceFixture(t, { index: { omitted: 'api.js' } });
  assert.throws(() => buildStaticRelease(releaseOptions(missingReference)), /api\.js/);
});

test('строитель не принимает data-src и data-href за реальные ссылки пакета', async (t) => {
  const { buildStaticRelease } = await loadReleaseTools();
  const fixture = createSourceFixture(t, {
    index: { extra: '<script data-src="old-app.js"></script><link data-href="old.css" rel="stylesheet">' },
  });

  assert.doesNotThrow(() => buildStaticRelease(releaseOptions(fixture)));
});

test('строитель принимает cache-bust параметры обязательных локальных ссылок', async (t) => {
  const { buildStaticRelease } = await loadReleaseTools();
  const fixture = createSourceFixture(t);
  const indexPath = path.join(fixture.sourceDir, 'index.html');
  let index = fs.readFileSync(indexPath, 'utf8');
  STATIC_FILES.filter((file) => file !== 'index.html').forEach((file) => {
    index = index.replace(`\"${file}\"`, `\"${file}?v=cache-test\"`);
  });
  fs.writeFileSync(indexPath, index);

  assert.doesNotThrow(() => buildStaticRelease(releaseOptions(fixture)));
});

test('проверка manifest обнаруживает изменённый байт в пакете', async (t) => {
  const { buildStaticRelease, verifyReleasePackage } = await loadReleaseTools();
  const fixture = createSourceFixture(t);
  const result = buildStaticRelease(releaseOptions(fixture));

  fs.appendFileSync(path.join(result.releaseDirectory, 'tg-app', 'app.js'), '\nwindow.tampered = true;');

  assert.throws(() => verifyReleasePackage(result.releaseDirectory), /SHA-256/);
});

test('проверка Git-основы отклоняет локально изменённый обязательный файл', async (t) => {
  const { assertStaticFilesMatchHead } = await loadReleaseTools();
  const fixture = createSourceFixture(t);
  execFileSync('git', ['init', '--quiet'], { cwd: fixture.root });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: fixture.root });
  execFileSync('git', ['config', 'user.name', 'Release tests'], { cwd: fixture.root });
  execFileSync('git', ['add', 'tg-app'], { cwd: fixture.root });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: fixture.root });

  assert.doesNotThrow(() => assertStaticFilesMatchHead(fixture.root));
  fs.appendFileSync(path.join(fixture.sourceDir, 'app.js'), '\nwindow.dirty = true;');
  assert.throws(() => assertStaticFilesMatchHead(fixture.root), /app\.js/);
});

test('manifest сам хранит SHA-256 каждого файла', async (t) => {
  const { buildStaticRelease } = await loadReleaseTools();
  const fixture = createSourceFixture(t);
  const result = buildStaticRelease(releaseOptions(fixture));
  const appEntry = result.manifest.files.find(({ path: filePath }) => filePath === 'tg-app/app.js');
  const expectedHash = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(result.releaseDirectory, appEntry.path)))
    .digest('hex');

  assert.equal(appEntry.sha256, expectedHash);
});
