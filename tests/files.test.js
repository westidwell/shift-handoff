'use strict';
// Summary text, CSV export/import and JSON backup/restore.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const S = require('../src/sample.js');

const T = new Date(2026, 10, 26, 6, 10, 0);
const at = (minutes) => new Date(T.getTime() + minutes * 60000);

// ----------------------------------------------------------------- summary

test('summary text has every section, in order, with the right counts', () => {
  const text = E.summaryText(S.makeSample(T), T);
  const heads = ['SHIFT HANDOFF: Pinecone Community Radio', 'DO FIRST', 'ALSO OPEN (2)', 'WAITING ON OTHERS (2)', 'DONE THIS SHIFT (4)', 'HANDED OVER, NOT ACKNOWLEDGED YET (3)'];
  let last = -1;
  heads.forEach((h) => {
    const i = text.indexOf(h);
    assert.ok(i > last, 'expected "' + h + '" after the previous heading');
    last = i;
  });
  assert.match(text, /^Overnight shift, Theo, since Wed Nov 25, 10:20 pm$/m);
  assert.match(text, /^Made Thu Nov 26, 6:10 am$/m);
  assert.match(text, /^5 open, 3 waiting, 4 done this shift$/m);
  assert.ok(text.endsWith('\n'));
});

test('summary text: do-first order, chase lines, grouped waiting, done times', () => {
  const lines = E.summaryText(S.makeSample(T), T).split('\n');
  const first = lines.slice(lines.indexOf('DO FIRST') + 1, lines.indexOf('DO FIRST') + 5);
  assert.match(first[0], /^1\. Call back the listener .*\(overdue 40 min\)$/);
  assert.match(first[1], /^2\. Chase: \[low\] Spare key .*\(waiting on Building manager, overdue 3 h\)$/);
  assert.match(first[2], /^3\. \[HIGH\] Weekly emergency alert test .*\(due in 25 min\)$/);
  assert.match(first[3], /^4\. \[HIGH\] Sponsor spot .*\(owner Nadia, due in 55 min\)$/);
  assert.ok(lines.includes('On Gus:'));
  assert.ok(lines.some((l) => /^ {2}- Studio A headphone amp.*\(owner Theo\)$/.test(l)));
  assert.ok(lines.includes('- 2:17 am  Silence alarm went off. Automation skipped a damaged file; restarted the playout computer and we were back on air in two minutes. File pulled from rotation. (Theo)'));
  // Lowest-urgency item still shows, and nothing appears in two sections.
  const coffee = lines.filter((l) => l.includes('coffee maker'));
  assert.equal(coffee.length, 1);
});

test('summary text for an empty log says so plainly', () => {
  const text = E.summaryText(E.emptyState(), T);
  assert.match(text, /No shift running/);
  assert.match(text, /- Nothing urgent\./);
  assert.match(text, /- Nothing else open\./);
  assert.match(text, /- Nothing waiting\./);
  assert.match(text, /- Nothing logged as done yet\./);
  assert.doesNotMatch(text, /NOT ACKNOWLEDGED/);
});

test('summary puts multi-line entries on one line', () => {
  let s = E.startShift(E.emptyState(), { by: 'Ana' }, at(-60));
  s = E.addEntry(s, { text: 'Line one\nLine two', priority: 'high' }, at(-30));
  assert.match(E.summaryText(s, T), /\[HIGH\] Line one \/ Line two/);
});

test('summary uses the 24 hour clock when set', () => {
  const s = E.updateSettings(S.makeSample(T), { clock: '24h' });
  const text = E.summaryText(s, T);
  assert.match(text, /since Wed Nov 25, 22:20/);
  assert.match(text, /- 02:17 {2}Silence alarm/);
});

test('summaryModel never lists an item twice', () => {
  const m = E.summaryModel(S.makeSample(T), T);
  const ids = [].concat(m.doFirst, m.alsoOpen, m.done, ...m.waiting.map((g) => g.entries)).map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(m.counts.open, 5);
  assert.equal(m.counts.waiting, 3);
});

test('done this shift falls back to the last 24 hours when no shift is running', () => {
  let s = E.addEntry(E.emptyState(), { text: 'old', status: 'done' }, at(-2000), { id: 'old' });
  s = E.addEntry(s, { text: 'recent', status: 'done' }, at(-60), { id: 'recent' });
  assert.deepEqual(E.doneInShift(s, T).map((e) => e.id), ['recent']);
});

// --------------------------------------------------------------------- CSV

test('CSV has a header row, a BOM for spreadsheets, and CRLF line endings', () => {
  const csv = E.toCSV(S.makeSample(T));
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], E.CSV_COLUMNS.join(','));
  assert.equal(lines.length, 13 + 2); // header + 13 entries + trailing empty
});

test('CSV quotes commas, quotes and newlines', () => {
  let s = E.addEntry(E.emptyState(), { text: 'Say "hi", then\nleave' }, T, { id: 'q1' });
  const row = E.toCSV(s).slice(1).split('\r\n')[1];
  assert.ok(row.includes('"Say ""hi"", then\nleave"'));
});

test('CSV guards cells that a spreadsheet would run as a formula', () => {
  let s = E.addEntry(E.emptyState(), { text: '=HYPERLINK("x")', owner: '@ops' }, T, { id: 'f1' });
  const csv = E.toCSV(s);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes(",'@ops,"));
});

test('CSV parser handles quotes, CRLF and LF, a BOM, and a missing final newline', () => {
  const rows = E.parseCSV('﻿a,b,c\r\n"1,2","say ""x""",3\n4,"multi\nline",\n7,8,9');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1,2', 'say "x"', '3'], ['4', 'multi\nline', ''], ['7', '8', '9']]);
  assert.deepEqual(E.parseCSV(''), []);
});

test('CSV round trip keeps every exported field', () => {
  let s = S.makeSample(T);
  s = E.addEntry(s, { text: "=1+1, \"quoted\"\nand a second line", owner: '-Dash', priority: 'low', due: at(45) }, at(1), { id: 'tricky' });
  s = E.addEntry(s, { text: "'=already guarded" }, at(2), { id: 'tricky2' });
  const back = E.entriesFromCSV(E.toCSV(s), T);
  const flat = (e) => [e.id, e.status, e.priority, e.text, e.owner, e.waitingOn, e.due, e.createdAt, e.createdBy,
    e.ack ? e.ack.by : '', e.ack ? e.ack.at : '', e.doneAt, e.doneBy];
  assert.deepEqual(back.map(flat), s.entries.map(flat));
});

test('CSV import adds new rows, skips ids already in the log, and accepts a hand-made file', () => {
  const s = S.makeSample(T);
  const r = E.importCSV(s, E.toCSV(s), T);
  assert.equal(r.added, 0);
  assert.equal(r.skipped, 13);
  const hand = E.importCSV(E.emptyState(), 'Text,Status,Priority,Owner\nOrder more cups,open,HIGH,Ana\nBlank,,,\n,open,,\n', T);
  assert.equal(hand.added, 2);
  assert.equal(hand.state.entries[0].text, 'Order more cups');
  assert.equal(hand.state.entries[0].priority, 'high');
  assert.equal(hand.state.entries[0].owner, 'Ana');
  assert.equal(hand.state.entries[1].status, 'open');
  assert.throws(() => E.importCSV(E.emptyState(), 'name,owner\nx,y\n', T), /no "text" column/);
  assert.throws(() => E.importCSV(E.emptyState(), '', T), /empty/);
});

// ------------------------------------------------------------------ backup

test('backup round trip gives back exactly the same state', () => {
  let s = S.makeSample(T);
  s = E.acknowledge(s, 'sample-03', at(1));
  s = E.updateSettings(s, { clock: '24h', soonMinutes: 30 });
  const json = E.toBackup(s, T);
  const obj = JSON.parse(json);
  assert.equal(obj.app, 'shift-handoff');
  assert.equal(obj.format, 1);
  assert.equal(obj.exportedAt, T.toISOString());
  assert.deepEqual(E.fromBackup(json, T), s);
});

test('normalizeState is idempotent and repairs damaged data', () => {
  const s = S.makeSample(T);
  assert.deepEqual(E.normalizeState(s, T), s);
  const fixed = E.normalizeState({
    settings: { clock: 'nope' },
    shift: { by: '' },
    shifts: [{ by: 'Ana', startedAt: 'not a date' }, { by: 'Bo', startedAt: at(-60).toISOString(), counts: { open: -4 } }],
    entries: [
      null, 'text', { text: '' },
      { id: 'x1', text: 'fine', status: 'weird', priority: 'weird', due: 'garbage', createdAt: at(-5).toISOString() },
      { id: 'x1', text: 'duplicate id' },
      { id: 'x2', text: 'done with no doneAt', status: 'done', updatedAt: at(-3).toISOString() }
    ]
  }, T);
  assert.equal(fixed.settings.clock, '12h');
  assert.equal(fixed.shift, null);
  assert.equal(fixed.shifts.length, 1);
  assert.equal(fixed.shifts[0].counts.open, 0);
  assert.deepEqual(fixed.entries.map((e) => e.id), ['x1', 'x2']);
  assert.equal(fixed.entries[0].status, 'open');
  assert.equal(fixed.entries[0].priority, 'normal');
  assert.equal(fixed.entries[0].due, null);
  assert.equal(fixed.entries[1].doneAt, at(-3).toISOString());
});

test('restore refuses files that are not our backups', () => {
  assert.throws(() => E.fromBackup('not json', T), /not valid JSON/);
  assert.throws(() => E.fromBackup('{"app":"something-else","format":1,"data":{}}', T), /not a Shift Handoff backup/);
  assert.throws(() => E.fromBackup('{"app":"shift-handoff","format":1}', T), /not a Shift Handoff backup/);
  assert.throws(() => E.fromBackup('{"app":"shift-handoff","format":99,"data":{}}', T), /newer version/);
  assert.deepEqual(E.fromBackup('﻿{"app":"shift-handoff","format":1,"data":{}}', T), E.emptyState());
});

// ------------------------------------------------------------------ sample

test('the sample log shows all three columns, a handover in progress and a do-first list', () => {
  const s = S.makeSample(T);
  assert.deepEqual(E.counts(s), { open: 5, waiting: 3, done: 5 });
  assert.equal(s.settings.place, 'Pinecone Community Radio');
  assert.deepEqual(E.handoverStatus(s), { handed: 6, acked: 3, left: 3, from: 'Marisol' });
  assert.deepEqual(E.doFirst(s, T).map((e) => e.id), ['sample-04', 'sample-08', 'sample-01', 'sample-02']);
  assert.deepEqual(E.normalizeState(s, T), s);
});
