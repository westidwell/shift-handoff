'use strict';
// Pro stubs: every planned Pro feature has a stub, a locked button and a line in PRO.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const P = require('../src/pro.js');
const V = require('../src/view.js');
const S = require('../src/sample.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('the Pro link and price live in one place', () => {
  assert.equal(P.PRO_URL, 'https://github.com/westidwell/shift-handoff/blob/main/PRO.md');
  assert.equal(P.PRO_PRICE, '$1/month');
  const src = read('src/pro.js');
  assert.equal(src.split('$1/month').length - 1, 1, 'the price should be written once in src/pro.js');
  for (const f of ['src/engine.js', 'src/view.js', 'src/app.js', 'src/sample.js']) {
    assert.ok(!read(f).includes('$1/month'), f + ' should use PRO_PRICE, not repeat the price');
    assert.ok(!read(f).includes('blob/main/PRO.md'), f + ' should use PRO_URL, not repeat the link');
  }
});

test('there are seven planned Pro features, each with a stub function', () => {
  assert.deepEqual(P.PRO_FEATURES.map((f) => f.id),
    ['teamLog', 'signIn', 'reminders', 'media', 'weeklyDigest', 'spreadsheetExport', 'aiSummary']);
  for (const f of P.PRO_FEATURES) {
    assert.equal(typeof P[f.fn], 'function', f.fn + ' should be a stub');
    assert.ok(f.name && f.line, f.id + ' needs a name and a line');
  }
});

test('every stub throws the same clear "not open yet" message with the link', () => {
  for (const f of P.PRO_FEATURES) {
    assert.throws(() => P[f.fn]({}), (err) => {
      assert.ok(err instanceof P.ProFeatureError);
      assert.equal(err.message, f.name + ' is part of Pro ($1/month, not open yet): see PRO.md');
      assert.equal(err.url, P.PRO_URL);
      assert.equal(err.feature, f.id);
      return true;
    });
  }
});

test('stub comments describe the feature as planned, never as already built', () => {
  const src = read('src/pro.js');
  assert.equal((src.match(/\(planned for Pro\)\./g) || []).length, P.PRO_FEATURES.length);
  assert.doesNotMatch(src, /already built|ships (today|now)|available now/i);
});

test('explain() gives a locked button the stub\'s own message', () => {
  const info = P.explain('aiSummary');
  assert.equal(info.message, 'AI shift summary is part of Pro ($1/month, not open yet): see PRO.md');
  assert.equal(info.url, P.PRO_URL);
  assert.throws(() => P.explain('teleport'), /Unknown Pro feature/);
});

test('the free page shows every Pro feature as a locked button', () => {
  const now = new Date(2026, 10, 26, 6, 10);
  const s = S.makeSample(now);
  const ui = { view: 'more', col: 'open', showAllDone: false };
  const html = V.more(s, ui, {}) + V.summary(s, ui, now, {}) + V.sheet('entry', s, {}) + V.board(require('../src/engine.js').emptyState(), ui, now);
  for (const f of P.PRO_FEATURES) {
    assert.ok(html.includes('data-act="pro" data-feature="' + f.id + '"'), f.id + ' should have a locked button');
  }
  const sheet = V.sheet('pro', s, { feature: 'teamLog' });
  assert.ok(sheet.includes('Team live log is part of Pro ($1/month, not open yet): see PRO.md'));
  assert.ok(sheet.includes('href="' + P.PRO_URL + '"'));
  assert.ok(sheet.includes('rel="noopener noreferrer"'));
});

test('PRO.md opens with the launch line and lists every feature with its line', () => {
  const md = read('PRO.md');
  assert.ok(md.includes('Pro is $1/month (launch price). It isn\'t open yet: star or watch this repo to hear when it opens.'));
  for (const f of P.PRO_FEATURES) {
    assert.ok(md.includes('**' + f.name + '**'), 'PRO.md should list ' + f.name);
    assert.ok(md.includes(f.line), 'PRO.md should describe ' + f.name + ' with the same line as the code');
  }
});

test('CONTRIBUTING.md and README.md point Pro features at PRO.md without claiming they exist', () => {
  const contributing = read('CONTRIBUTING.md');
  assert.ok(contributing.includes('Features listed in PRO.md are reserved for the Pro edition, so pull requests that add them will be closed with a pointer to PRO.md.'));
  const readme = read('README.md');
  for (const f of P.PRO_FEATURES) assert.ok(readme.includes(f.name), 'README Free vs Pro should mention ' + f.name);
  for (const doc of [contributing, readme, read('PRO.md')]) {
    assert.doesNotMatch(doc, /already built|ships (today|now)|available now/i);
  }
});
