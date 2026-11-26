#!/usr/bin/env node
/*
 * Folds src/ into one self-contained index.html, and stamps sw.js with a
 * version so phones pick up new builds.
 *
 *   node build.js           write index.html and sw.js
 *   node build.js --check   fail if index.html or sw.js is out of date
 *
 * No dependencies. The page's Content-Security-Policy is built here: it allows
 * only the exact inline scripts below (by hash) and blocks all network calls.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const SCRIPTS = ['src/pro.js', 'src/engine.js', 'src/sample.js', 'src/view.js', 'src/app.js'];

// The tab icon, kept here as text so the build never depends on image files.
// It is the same drawing as icons/icon.svg and the logo in src/view.js.
const ICON_PATH = 'M14 22h30m-8-8 8 8-8 8M50 42H20m8-8-8 8 8 8';
const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f2a93b"/>' +
  '<path d="' + ICON_PATH + '" fill="none" stroke="#14161b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

function sha256(text, encoding) {
  return crypto.createHash('sha256').update(text, 'utf8').digest(encoding);
}

function build() {
  const pkg = JSON.parse(read('package.json'));
  const template = read('src/template.html');
  const css = read('src/style.css').trimEnd();
  const favicon = 'data:image/svg+xml,' + encodeURIComponent(FAVICON_SVG);

  const scripts = SCRIPTS.map(function (rel) {
    const code = read(rel).trimEnd();
    if (/<\/script/i.test(code) || /<!--/.test(code)) {
      throw new Error(rel + ' must not contain "</script" or "<!--" because it is inlined into index.html');
    }
    return '\n' + code + '\n';
  });

  const csp = [
    "default-src 'none'",
    "script-src 'self' " + scripts.map(function (s) { return "'sha256-" + sha256(s, 'base64') + "'"; }).join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "worker-src 'self'",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'"
  ].join('; ');

  const html = template
    .replace('@@CSP@@', function () { return csp; })
    .replace('@@VERSION@@', function () { return pkg.version; })
    .replace('@@FAVICON@@', function () { return favicon.replace(/"/g, '%22'); })
    .replace('<!-- @css -->', function () { return '<style>\n' + css + '\n</style>'; })
    .replace('<!-- @js -->', function () {
      return scripts.map(function (s) { return '<script>' + s + '</script>'; }).join('\n');
    });

  if (/@@[A-Z]+@@|<!-- @(css|js) -->/.test(html)) throw new Error('A placeholder in src/template.html was not filled');

  const sw = read('src/sw.js').replace('__BUILD__', pkg.version + '-' + sha256(html, 'hex').slice(0, 10));
  return { 'index.html': html, 'sw.js': sw };
}

function main() {
  const check = process.argv.indexOf('--check') >= 0;
  const out = build();
  let stale = [];
  Object.keys(out).forEach(function (rel) {
    const file = path.join(ROOT, rel);
    if (check) {
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (current !== out[rel]) stale.push(rel);
    } else {
      fs.writeFileSync(file, out[rel]);
      console.log('wrote ' + rel + ' (' + Buffer.byteLength(out[rel]) + ' bytes)');
    }
  });
  if (check) {
    if (stale.length) {
      console.error('Out of date: ' + stale.join(', ') + '. Run "npm run build" and commit the result.');
      process.exit(1);
    }
    console.log('index.html and sw.js are up to date.');
  }
}

if (require.main === module) main();
module.exports = { build: build, SCRIPTS: SCRIPTS, ICON_PATH: ICON_PATH };
