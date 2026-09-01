const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

test('админ-панель на мобильной ширине защищена от переполнения и сохраняет touch targets', () => {
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*?\.seller-shell/);
  assert.match(styles, /\.seller-shell[\s\S]*?overflow-x:\s*hidden/);
  assert.match(styles, /\.seller-shell[\s\S]*?font-size:\s*14px/);
  assert.match(styles, /\.seller-shell[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /\.seller-shell[\s\S]*?:active[\s\S]*?transform:\s*none/);
});
