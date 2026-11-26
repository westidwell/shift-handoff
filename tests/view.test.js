'use strict';
// Views: what each screen shows, and that nothing typed by a person can inject HTML.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const V = require('../src/view.js');
const S = require('../src/sample.js');

const T = new Date(2026, 10, 26, 6, 10, 0);
const UI = { view: 'board', col: 'open', showAllDone: false };

test('esc() makes text safe to put in HTML', () => {
  assert.equal(V.esc('<img src=x onerror="go()"> & \'q\''), '&lt;img src=x onerror=&quot;go()&quot;&gt; &amp; &#39;q&#39;');
  assert.equal(V.esc(null), '');
});

test('nothing a person types reaches the page as HTML', () => {
  const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  let s = E.updateSettings(E.emptyState(), { place: evil });
  s = E.startShift(s, { by: evil, name: evil }, T);
  s = E.addEntry(s, { text: evil, owner: evil, status: 'waiting', waitingOn: evil, priority: 'high', due: T }, T, { id: 'x" data-pwn="1' });
  const html = [
    V.header(s, UI, {}, T), V.board(s, UI, T), V.summary(s, UI, T, {}), V.more(s, UI, {}),
    V.sheet('entry', s, { id: 'x" data-pwn="1' }), V.sheet('waiting', s, { id: 'x" data-pwn="1' }), V.sheet('handover', s, {}),
    V.sheet('copy', s, { text: evil }), V.sheet('message', s, { title: evil, text: evil })
  ].join('\n');
  assert.ok(!html.includes('<script'), 'no script tag');
  assert.ok(!html.includes('<img'), 'no img tag');
  assert.ok(!html.includes('data-pwn="1"'), 'no attribute break-out');
  assert.ok(html.includes('x&quot; data-pwn=&quot;1'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('no inline event handlers anywhere (the page policy would block them)', () => {
  const s = S.makeSample(T);
  const html = V.board(s, UI, T) + V.summary(s, UI, T, { canShare: true }) + V.more(s, UI, { canInstall: true }) +
    V.sheet('entry', s, { id: 'sample-01' }) + V.sheet('handover', s, {});
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test('the header names the log and the running shift, and marks the current view', () => {
  const s = S.makeSample(T);
  const h = V.header(s, { view: 'summary' }, { saveOk: true }, T);
  assert.ok(h.includes('Pinecone Community Radio'));
  assert.ok(h.includes('Overnight shift · Theo · since yesterday 10:20 pm'));
  assert.ok(h.includes('data-view="summary" aria-current="page"'));
  assert.ok(h.includes('Saved on this device'));
  assert.ok(V.header(s, UI, { saveOk: false }, T).includes('Not saved'));
});

test('the board shows the handover banner, do-first list, columns and the right buttons', () => {
  const s = S.makeSample(T);
  const html = V.board(s, UI, T);
  assert.ok(html.includes('Marisol handed over 6 items.'));
  assert.ok(html.includes('3 of 6 acknowledged'));
  assert.ok(html.includes('data-act="ackAll">Got it, all 3<'));
  assert.ok(html.includes('id="h-first">Do first<'));
  assert.equal((html.match(/class="first-item"/g) || []).length, 4);
  for (const st of ['open', 'waiting', 'done']) assert.ok(html.includes('data-col="' + st + '"'));
  // Not-yet-acknowledged items get the big button; acknowledged ones say who has them.
  assert.ok(html.includes('data-act="ack" data-id="sample-03"'));
  assert.ok(!html.includes('data-act="ack" data-id="sample-02"'));
  assert.ok(html.includes('Got it: Theo, 10:30 pm'));
  // Each status gets its own moves.
  assert.ok(html.includes('data-act="move" data-id="sample-01" data-to="waiting"'));
  assert.ok(html.includes('data-act="move" data-id="sample-06" data-to="open"'));
  assert.ok(html.includes('data-act="move" data-id="sample-09" data-to="open"'));
  assert.ok(html.includes('Overdue 40 min'));
  assert.ok(html.includes('Waiting on Building manager'));
});

test('with no shift running the board asks you to start one and offers the sample', () => {
  const html = V.board(E.emptyState(), UI, T);
  assert.ok(html.includes('Start your shift'));
  assert.ok(html.includes('data-form="start"'));
  assert.ok(html.includes('data-act="sample"'));
  assert.ok(html.includes('Nothing open.'));
});

test('the done column is trimmed until you ask for all of it', () => {
  let s = E.startShift(E.emptyState(), { by: 'Ana' }, T);
  for (let i = 0; i < 25; i++) s = E.addEntry(s, { text: 'done ' + i, status: 'done' }, new Date(T.getTime() + i * 60000));
  const short = V.board(s, UI, T);
  assert.ok(short.includes('Show all 25 done'));
  assert.equal((short.match(/class="entry /g) || []).length, 20);
  const all = V.board(s, Object.assign({}, UI, { showAllDone: true }), T);
  assert.equal((all.match(/class="entry /g) || []).length, 25);
});

test('the summary view matches the summary text and offers print, copy and handover', () => {
  const s = S.makeSample(T);
  const html = V.summary(s, { view: 'summary' }, T, { canShare: true });
  for (const h of ['End-of-shift summary', 'Do first', 'Also open', 'Waiting on others', 'Done this shift', 'Handed over, not acknowledged yet', 'Recent handovers']) {
    assert.ok(html.includes(h), 'summary should show ' + h);
  }
  assert.ok(html.includes('<h3>On Gus</h3>'));
  assert.ok(html.includes('data-act="print"'));
  assert.ok(html.includes('data-act="copy"'));
  assert.ok(html.includes('data-act="share"'));
  assert.ok(html.includes('data-act="handover"'));
  assert.ok(html.includes('class="summary print-area"'));
  assert.ok(!V.summary(s, { view: 'summary' }, T, {}).includes('data-act="share"'));
});

test('the add form has the shortcut hint and empty fields; the edit form is filled in and has Delete', () => {
  const s = S.makeSample(T);
  const add = V.sheet('entry', s, {});
  assert.ok(add.includes('Add to the log'));
  assert.ok(add.includes('<code>@Nadia</code>'));
  assert.ok(add.includes('data-status="open"'));
  assert.ok(!add.includes('data-act="delete"'));
  const edit = V.sheet('entry', s, { id: 'sample-07' });
  assert.ok(edit.includes('Edit entry'));
  assert.ok(edit.includes('data-status="waiting"'));
  assert.ok(edit.includes('data-due="pick"'));
  assert.ok(edit.includes('value="Programming committee"'));
  assert.ok(edit.includes('value="' + E.toLocalInput(E.getEntry(s, 'sample-07').due) + '"'));
  assert.ok(edit.includes('data-act="delete" data-id="sample-07"'));
  assert.ok(edit.includes('History (1)'));
});

test('the More view shows settings, data tools, install help and the Pro list', () => {
  const s = S.makeSample(T);
  const html = V.more(s, { view: 'more' }, { canInstall: true, version: '1.0.0' });
  assert.ok(html.includes('data-key="clock" data-value="12h" aria-pressed="true"'));
  assert.ok(html.includes('data-key="soonMinutes" data-value="60" aria-pressed="true"'));
  for (const act of ['backup', 'restore', 'csv', 'importCsv', 'sample', 'erase', 'install']) {
    assert.ok(html.includes('data-act="' + act + '"'), 'More should offer ' + act);
  }
  assert.ok(html.includes('Shift Handoff 1.0.0'));
  assert.ok(html.includes('Pro (not open yet)'));
});

test('unknown sheets are an error', () => {
  assert.throws(() => V.sheet('nope', E.emptyState(), {}), /Unknown sheet/);
});
