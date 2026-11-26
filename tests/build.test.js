'use strict';
// The built page: up to date, locked down, and with no way to call the network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { build, SCRIPTS } = require('../build.js');
const P = require('../src/pro.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');

function inlineScripts(page) {
  const out = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(page))) out.push(m[1]);
  return out;
}

test('index.html and sw.js match a fresh build (run "npm run build" if this fails)', () => {
  const out = build();
  assert.ok(out['index.html'] === html, 'index.html is out of date');
  assert.ok(out['sw.js'] === read('sw.js'), 'sw.js is out of date');
});

test('index.html inlines every source script, in order', () => {
  const scripts = inlineScripts(html);
  assert.equal(scripts.length, SCRIPTS.length);
  SCRIPTS.forEach((rel, i) => assert.equal(scripts[i].trim(), read(rel).trim()));
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external script files');
  assert.ok(html.includes('<style>'), 'styles are inlined');
});

test('the security policy blocks all network calls and allows only these exact scripts', () => {
  const csp = (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html) || [])[1];
  assert.ok(csp, 'page has a CSP');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /object-src 'none'/);
  const hashes = inlineScripts(html).map((s) => "'sha256-" + crypto.createHash('sha256').update(s, 'utf8').digest('base64') + "'");
  for (const h of hashes) assert.ok(csp.includes(h), 'CSP allows script ' + h);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(/script-src[^;]*/.exec(csp)[0], /unsafe-inline/);
});

test('no telemetry: the page has no network calls and links only to its own PRO.md', () => {
  for (const api of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'importScripts', 'new Image(', 'eval(', 'new Function(']) {
    assert.ok(!html.includes(api), 'index.html should not use ' + api);
  }
  const urls = (html.match(/https?:\/\/[^\s"'<>)]+/g) || []).filter((u) => u !== P.PRO_URL);
  assert.deepEqual(urls, []);
  assert.ok(!/\b(googleapis|gstatic|google-analytics|googletagmanager|gtag|segment\.(io|com)|sentry\.io|cdnjs|unpkg|jsdelivr)\b/i.test(html));
});

test('the service worker only serves this site\'s own files', () => {
  const sw = read('sw.js');
  assert.match(sw, /req\.method !== 'GET'/);
  assert.match(sw, /origin !== self\.location\.origin/);
  assert.doesNotMatch(sw, /https?:\/\//);
  assert.match(sw, /const CACHE = 'shift-handoff-1\.0\.0-[0-9a-f]{10}'/);
  const files = JSON.parse('[' + /const FILES = \[([\s\S]*?)\]/.exec(sw)[1].replace(/'/g, '"') + ']');
  for (const f of files) {
    if (f === './') continue;
    assert.ok(fs.existsSync(path.join(ROOT, f)), 'sw.js caches ' + f + ', which should exist');
  }
});

test('the manifest is valid and its icons exist', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.name, 'Shift Handoff');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const icon of m.icons) {
    const file = path.join(ROOT, icon.src);
    assert.ok(fs.existsSync(file), icon.src + ' exists');
    if (icon.type === 'image/png') {
      const buf = fs.readFileSync(file);
      assert.equal(buf.toString('ascii', 1, 4), 'PNG');
      const [w, h] = icon.sizes.split('x').map(Number);
      assert.equal(buf.readUInt32BE(16), w);
      assert.equal(buf.readUInt32BE(20), h);
    }
  }
  assert.ok(html.includes('<link rel="manifest" href="manifest.webmanifest">'));
});

test('the logo in the page and the tab icon are the same drawing', () => {
  const { ICON_PATH } = require('../build.js');
  assert.ok(read('src/view.js').includes(ICON_PATH));
  assert.ok(html.includes(encodeURIComponent(ICON_PATH)));
});

test('the page is phone-ready and works as one file', () => {
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,/);
  assert.match(html, /<meta name="app-version" content="1\.0\.0">/);
  assert.match(html, /<html lang="en">/);
});

test('CI runs the tests and checks that index.html was rebuilt', () => {
  const wf = read('.github/workflows/test.yml');
  assert.match(wf, /npm test/);
  assert.match(wf, /npm run check/);
});
