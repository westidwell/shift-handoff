'use strict';
// Engine tests: adding, moving, acknowledging, sorting, due times, shorthand, shifts.
// All times are built from local date parts, so the tests pass in any time zone.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

const T = new Date(2026, 10, 26, 6, 0, 0); // Thu Nov 26 2026, 6:00 am local
const at = (minutes) => new Date(T.getTime() + minutes * 60000);

function withShift(by, startMinutes) {
  return E.startShift(E.emptyState(), { by: by || 'Nadia', name: 'Morning' }, at(startMinutes || 0), { id: 'shift-a' });
}

function add(state, input, minutes, id) {
  return E.addEntry(state, input, at(minutes || 0), { id: id });
}

test('a new state is empty and well formed', () => {
  const s = E.emptyState();
  assert.equal(s.format, 1);
  assert.deepEqual(s.entries, []);
  assert.deepEqual(s.shifts, []);
  assert.equal(s.shift, null);
  assert.deepEqual(s.settings, { place: 'Shift handoff', clock: '12h', soonMinutes: 60 });
});

test('addEntry fills defaults, trims text and records who added it', () => {
  let s = withShift('Nadia');
  s = add(s, { text: '  Restock the cups  ' }, 5, 'a1');
  const e = E.getEntry(s, 'a1');
  assert.equal(e.text, 'Restock the cups');
  assert.equal(e.status, 'open');
  assert.equal(e.priority, 'normal');
  assert.equal(e.createdBy, 'Nadia');
  assert.equal(e.createdAt, at(5).toISOString());
  assert.equal(e.due, null);
  assert.equal(e.ack, null);
  assert.equal(e.history.length, 1);
  assert.equal(e.history[0].did, 'added');
});

test('addEntry does not change the state it was given', () => {
  const s = withShift('Nadia');
  const before = JSON.stringify(s);
  add(s, { text: 'Something' }, 0, 'a1');
  assert.equal(JSON.stringify(s), before);
});

test('addEntry rejects empty text, bad status, bad priority, waiting with no one, and duplicate ids', () => {
  const s = withShift('Nadia');
  assert.throws(() => add(s, { text: '   ' }), /next person/);
  assert.throws(() => add(s, { text: 'x', status: 'later' }), /Unknown status/);
  assert.throws(() => add(s, { text: 'x', priority: 'urgent' }), /Unknown priority/);
  assert.throws(() => add(s, { text: 'x', status: 'waiting' }), /waiting on/);
  const s2 = add(s, { text: 'x' }, 0, 'dup');
  assert.throws(() => add(s2, { text: 'y' }, 0, 'dup'), /already exists/);
});

test('logging something that happened puts it straight into Done', () => {
  const s = add(withShift('Theo'), { text: 'Alarm went off, reset it', status: 'done' }, 10, 'h1');
  const e = E.getEntry(s, 'h1');
  assert.equal(e.status, 'done');
  assert.equal(e.doneAt, at(10).toISOString());
  assert.equal(e.doneBy, 'Theo');
  assert.equal(e.history[0].did, 'logged');
});

test('text is capped at the maximum length', () => {
  const s = add(withShift(), { text: 'x'.repeat(5000) }, 0, 'long');
  assert.equal(E.getEntry(s, 'long').text.length, E.MAX_TEXT);
});

test('moveEntry: open to waiting needs who, then to done and back to open', () => {
  let s = add(withShift('Nadia'), { text: 'Fix the amp' }, 0, 'm1');
  assert.throws(() => E.moveEntry(s, 'm1', 'waiting', at(1)), /waiting on/);
  s = E.moveEntry(s, 'm1', 'waiting', at(1), { waitingOn: 'Gus' });
  let e = E.getEntry(s, 'm1');
  assert.equal(e.status, 'waiting');
  assert.equal(e.waitingOn, 'Gus');

  s = E.moveEntry(s, 'm1', 'done', at(2));
  e = E.getEntry(s, 'm1');
  assert.equal(e.status, 'done');
  assert.equal(e.waitingOn, '');
  assert.equal(e.doneAt, at(2).toISOString());
  assert.equal(e.doneBy, 'Nadia');

  s = E.moveEntry(s, 'm1', 'open', at(3));
  e = E.getEntry(s, 'm1');
  assert.equal(e.status, 'open');
  assert.equal(e.doneAt, null);
  assert.equal(e.doneBy, '');
  assert.deepEqual(e.history.map((h) => h.note).slice(1), ['open to waiting (Gus)', 'waiting to done', 'done to open']);
});

test('moveEntry to the same place is a no-op, and unknown ids or statuses throw', () => {
  const s = add(withShift(), { text: 'x' }, 0, 'n1');
  const same = E.moveEntry(s, 'n1', 'open', at(1));
  assert.equal(E.getEntry(same, 'n1').history.length, 1);
  assert.throws(() => E.moveEntry(s, 'nope', 'done', at(1)), /gone/);
  assert.throws(() => E.moveEntry(s, 'n1', 'archived', at(1)), /Unknown status/);
});

test('waiting to waiting with a new person updates who it waits on', () => {
  let s = add(withShift(), { text: 'Key', status: 'waiting', waitingOn: 'Landlord' }, 0, 'w1');
  s = E.moveEntry(s, 'w1', 'waiting', at(1), { waitingOn: 'Building manager' });
  assert.equal(E.getEntry(s, 'w1').waitingOn, 'Building manager');
});

test('updateEntry edits fields, logs what changed, and validates', () => {
  let s = add(withShift(), { text: 'Old text' }, 0, 'u1');
  s = E.updateEntry(s, 'u1', { text: 'New text', priority: 'high', owner: 'Priya', due: at(30) }, at(1));
  const e = E.getEntry(s, 'u1');
  assert.equal(e.text, 'New text');
  assert.equal(e.priority, 'high');
  assert.equal(e.owner, 'Priya');
  assert.equal(e.due, at(30).toISOString());
  assert.equal(e.history[e.history.length - 1].note, 'text, priority, owner, due time');
  assert.throws(() => E.updateEntry(s, 'u1', { text: '' }, at(2)), /next person/);
  assert.throws(() => E.updateEntry(s, 'u1', { priority: 'meh' }, at(2)), /Unknown priority/);
  const unchanged = E.updateEntry(s, 'u1', { text: 'New text' }, at(3));
  assert.equal(E.getEntry(unchanged, 'u1').history.length, e.history.length);
});

test('removeEntry deletes one entry and throws for a missing one', () => {
  let s = add(add(withShift(), { text: 'a' }, 0, 'r1'), { text: 'b' }, 0, 'r2');
  s = E.removeEntry(s, 'r1');
  assert.deepEqual(s.entries.map((e) => e.id), ['r2']);
  assert.throws(() => E.removeEntry(s, 'r1'), /gone/);
});

// ------------------------------------------------------------ acknowledgement

function handedOver() {
  // Theo's shift adds three things, then hands over to Nadia.
  let s = E.startShift(E.emptyState(), { by: 'Theo', name: 'Overnight' }, at(-480), { id: 'night' });
  s = add(s, { text: 'Call back the listener' }, -300, 'k1');
  s = add(s, { text: 'Amp crackles', status: 'waiting', waitingOn: 'Gus' }, -200, 'k2');
  s = add(s, { text: 'Locked up', status: 'done' }, -100, 'k3');
  s = E.startShift(s, { by: 'Nadia', name: 'Morning' }, at(0), { id: 'morning' });
  return s;
}

test('starting a new shift closes the old one with a record of the handover', () => {
  const s = handedOver();
  assert.equal(s.shift.by, 'Nadia');
  assert.equal(s.shift.id, 'morning');
  assert.equal(s.shifts.length, 1);
  const rec = s.shifts[0];
  assert.equal(rec.by, 'Theo');
  assert.equal(rec.handedTo, 'Nadia');
  assert.equal(rec.endedAt, at(0).toISOString());
  assert.deepEqual(rec.counts, { open: 1, waiting: 1, done: 1, notAcked: 0 });
  assert.throws(() => E.startShift(s, { by: '  ' }, at(1)), /Who is starting/);
});

test('carried-in open and waiting items need an acknowledgement; done ones do not', () => {
  const s = handedOver();
  assert.equal(E.needsAck(E.getEntry(s, 'k1'), s), true);
  assert.equal(E.needsAck(E.getEntry(s, 'k2'), s), true);
  assert.equal(E.needsAck(E.getEntry(s, 'k3'), s), false);
  assert.deepEqual(E.handoverStatus(s), { handed: 2, acked: 0, left: 2, from: 'Theo' });
});

test('"I\'ve got it" records who and when, fills an empty owner, and is idempotent', () => {
  let s = handedOver();
  s = E.acknowledge(s, 'k1', at(2));
  const e = E.getEntry(s, 'k1');
  assert.deepEqual(e.ack, { by: 'Nadia', at: at(2).toISOString(), shiftId: 'morning' });
  assert.equal(e.owner, 'Nadia');
  assert.equal(E.isAcked(e, s), true);
  assert.equal(E.needsAck(e, s), false);
  const again = E.acknowledge(s, 'k1', at(9));
  assert.equal(E.getEntry(again, 'k1').ack.at, at(2).toISOString());
  assert.deepEqual(E.handoverStatus(s), { handed: 2, acked: 1, left: 1, from: 'Theo' });
});

test('acknowledging keeps an owner that was already set', () => {
  let s = E.startShift(E.emptyState(), { by: 'Theo' }, at(-60), { id: 's1' });
  s = add(s, { text: 'Guest at 9', owner: 'Priya' }, -30, 'o1');
  s = E.startShift(s, { by: 'Nadia' }, at(0), { id: 's2' });
  s = E.acknowledge(s, 'o1', at(1));
  assert.equal(E.getEntry(s, 'o1').owner, 'Priya');
  assert.equal(E.getEntry(s, 'o1').ack.by, 'Nadia');
});

test('acknowledge refuses done items and needs a running shift', () => {
  const s = handedOver();
  assert.throws(() => E.acknowledge(s, 'k3', at(1)), /already done/);
  const noShift = E.endShift(s, at(1));
  assert.throws(() => E.acknowledge(noShift, 'k1', at(2)), /Start a shift/);
});

test('acknowledgeAll takes everything that was handed over', () => {
  const s = E.acknowledgeAll(handedOver(), at(3));
  assert.deepEqual(E.handoverStatus(s), { handed: 2, acked: 2, left: 0, from: 'Theo' });
  assert.equal(s.entries.filter((e) => E.needsAck(e, s)).length, 0);
});

test('acknowledgements belong to a shift: the next shift has to acknowledge again', () => {
  let s = E.acknowledgeAll(handedOver(), at(3));
  s = E.startShift(s, { by: 'Priya', name: 'Day' }, at(480), { id: 'day' });
  assert.equal(E.needsAck(E.getEntry(s, 'k1'), s), true);
  assert.deepEqual(E.handoverStatus(s), { handed: 2, acked: 0, left: 2, from: 'Nadia' });
});

test('items added during your own shift never need acknowledging', () => {
  const s = add(handedOver(), { text: 'Mine' }, 5, 'mine');
  assert.equal(E.needsAck(E.getEntry(s, 'mine'), s), false);
});

test('moving or editing a handed-over item counts as picking it up', () => {
  let s = handedOver();
  s = E.moveEntry(s, 'k1', 'done', at(4));
  s = E.updateEntry(s, 'k2', { text: 'Amp crackles on channel 3' }, at(5));
  assert.equal(E.getEntry(s, 'k1').ack.by, 'Nadia');
  assert.equal(E.isAcked(E.getEntry(s, 'k2'), s), true);
  assert.equal(E.handoverStatus(s).left, 0);
});

test('endShift with no shift running changes nothing', () => {
  const s = E.emptyState();
  assert.deepEqual(E.endShift(s, at(0)), s);
});

// ----------------------------------------------------------------- sorting

test('open items sort overdue first, then priority, then due time, then oldest', () => {
  let s = withShift('Nadia', -600);
  s = add(s, { text: 'low no due', priority: 'low' }, -500, 'low');
  s = add(s, { text: 'normal no due old' }, -400, 'n-old');
  s = add(s, { text: 'normal no due new' }, -300, 'n-new');
  s = add(s, { text: 'normal due later', due: at(120) }, -200, 'n-due');
  s = add(s, { text: 'high due later', priority: 'high', due: at(300) }, -100, 'h-due');
  s = add(s, { text: 'high no due', priority: 'high' }, -90, 'h-none');
  s = add(s, { text: 'low overdue', priority: 'low', due: at(-5) }, -80, 'l-over');
  s = add(s, { text: 'normal overdue a lot', due: at(-60) }, -70, 'n-over');
  const ids = E.listStatus(s, 'open', T).map((e) => e.id);
  assert.deepEqual(ids, ['n-over', 'l-over', 'h-due', 'h-none', 'n-due', 'n-old', 'n-new', 'low']);
});

test('done items sort newest first', () => {
  let s = withShift('Nadia', -600);
  s = add(s, { text: 'first', status: 'done' }, -300, 'd1');
  s = add(s, { text: 'second', status: 'done' }, -200, 'd2');
  s = add(s, { text: 'third', status: 'done' }, -100, 'd3');
  assert.deepEqual(E.listStatus(s, 'done', T).map((e) => e.id), ['d3', 'd2', 'd1']);
});

// -------------------------------------------------------------- due times

test('dueState: overdue, soon (inside the window), later, none', () => {
  const e = (due, status) => ({ due: due && due.toISOString(), status: status || 'open' });
  assert.equal(E.dueState(e(at(-1)), T, 60), 'overdue');
  assert.equal(E.dueState(e(at(0)), T, 60), 'soon');
  assert.equal(E.dueState(e(at(60)), T, 60), 'soon');
  assert.equal(E.dueState(e(at(61)), T, 60), 'later');
  assert.equal(E.dueState(e(at(45)), T, 30), 'later');
  assert.equal(E.dueState(e(null), T, 60), 'none');
  assert.equal(E.dueState(e(at(-30), 'done'), T, 60), 'none');
});

test('dueText reads like a person would say it', () => {
  const st = { clock: '12h', soonMinutes: 60 };
  const e = (m) => ({ due: at(m).toISOString(), status: 'open' });
  assert.equal(E.dueText(e(-40), T, st), 'overdue 40 min');
  assert.equal(E.dueText(e(-150), T, st), 'overdue 2 h 30 min');
  assert.equal(E.dueText(e(0), T, st), 'due now');
  assert.equal(E.dueText(e(25), T, st), 'due in 25 min');
  assert.equal(E.dueText(e(150), T, st), 'due today 8:30 am');
  assert.equal(E.dueText(e(24 * 60 + 30), T, st), 'due tomorrow 6:30 am');
  assert.equal(E.dueText(e(3 * 24 * 60), T, { clock: '24h', soonMinutes: 60 }), 'due Sun 06:00');
  assert.equal(E.dueText({ due: null, status: 'open' }, T, st), '');
});

test('time formatting: 12 and 24 hour clocks, days, stamps, spans', () => {
  assert.equal(E.fmtTime(new Date(2026, 10, 26, 0, 5), '12h'), '12:05 am');
  assert.equal(E.fmtTime(new Date(2026, 10, 26, 12, 0), '12h'), '12:00 pm');
  assert.equal(E.fmtTime(new Date(2026, 10, 26, 21, 7), '24h'), '21:07');
  assert.equal(E.fmtDay(at(-24 * 60), T), 'yesterday');
  assert.equal(E.fmtDay(new Date(2026, 11, 25, 9, 0), T), 'Dec 25');
  assert.equal(E.fmtStamp(T, '12h'), 'Thu Nov 26, 6:00 am');
  assert.equal(E.fmtSpan(59), '59 min');
  assert.equal(E.fmtSpan(60), '1 h');
  assert.equal(E.fmtSpan(61), '1 h 1 min');
  assert.equal(E.fmtSpan(3 * 1440), '3 days');
  assert.equal(E.dateStamp(T), '2026-11-26');
});

test('ageText shows how long an item has been sitting', () => {
  assert.equal(E.ageText({ status: 'open', createdAt: at(-540).toISOString() }, T), 'open 9 h');
  assert.equal(E.ageText({ status: 'waiting', createdAt: at(-3 * 1440).toISOString() }, T), 'waiting 3 days');
  assert.equal(E.ageText({ status: 'done', createdAt: at(-60).toISOString() }, T), '');
});

test('parseClock understands am/pm, 24 hour, noon and midnight, and refuses vague times', () => {
  assert.deepEqual(E.parseClock('9am'), { h: 9, m: 0 });
  assert.deepEqual(E.parseClock('9:15 PM'), { h: 21, m: 15 });
  assert.deepEqual(E.parseClock('12am'), { h: 0, m: 0 });
  assert.deepEqual(E.parseClock('12pm'), { h: 12, m: 0 });
  assert.deepEqual(E.parseClock('14:30'), { h: 14, m: 30 });
  assert.deepEqual(E.parseClock('7 p.m.'), { h: 19, m: 0 });
  assert.deepEqual(E.parseClock('noon'), { h: 12, m: 0 });
  assert.deepEqual(E.parseClock('midnight'), { h: 0, m: 0 });
  assert.equal(E.parseClock('9'), null);
  assert.equal(E.parseClock('25:00'), null);
  assert.equal(E.parseClock('13pm'), null);
  assert.equal(E.parseClock('9:75'), null);
});

test('nextAt rolls over to tomorrow once the time has passed', () => {
  assert.equal(E.nextAt(T, 9, 0).getTime(), new Date(2026, 10, 26, 9, 0).getTime());
  assert.equal(E.nextAt(T, 5, 30).getTime(), new Date(2026, 10, 27, 5, 30).getTime());
  assert.equal(E.nextAt(T, 6, 0).getTime(), new Date(2026, 10, 27, 6, 0).getTime());
});

test('datetime-local input values round trip in local time', () => {
  const iso = E.fromLocalInput('2026-11-26T14:30');
  assert.equal(iso, new Date(2026, 10, 26, 14, 30).toISOString());
  assert.equal(E.toLocalInput(iso), '2026-11-26T14:30');
  assert.equal(E.fromLocalInput(''), null);
  assert.equal(E.toLocalInput(null), '');
});

test('addMinutes rounds down to the whole minute', () => {
  const d = E.addMinutes(new Date(2026, 10, 26, 6, 0, 42), 30);
  assert.equal(d.getTime(), new Date(2026, 10, 26, 6, 30, 0).getTime());
});

// ------------------------------------------------------------- shorthand

test('quickParse picks out owner, priority, due time and waiting', () => {
  const p = E.quickParse('Initial the alert test log @Nadia ! by 7am', T);
  assert.equal(p.text, 'Initial the alert test log');
  assert.equal(p.owner, 'Nadia');
  assert.equal(p.priority, 'high');
  assert.equal(p.due, new Date(2026, 10, 26, 7, 0).toISOString());
  assert.equal(p.status, null);

  const w = E.quickParse('Spare amp, waiting on Gus. Use channels 1 and 2', T);
  assert.equal(w.status, 'waiting');
  assert.equal(w.waitingOn, 'Gus');
  assert.equal(w.text, 'Spare amp. Use channels 1 and 2');

  const the = E.quickParse('Shed key waiting for the landlord', T);
  assert.equal(the.waitingOn, 'the landlord');
  assert.equal(the.text, 'Shed key');
});

test('quickParse: "in 30m", "in 2 hours", !low, @first_last, and a time already passed today', () => {
  assert.equal(E.quickParse('Check the fridge in 30m', T).due, at(30).toISOString());
  assert.equal(E.quickParse('Swap tapes in 2 hours', T).due, at(120).toISOString());
  assert.equal(E.quickParse('Dust the shelf !low', T).priority, 'low');
  assert.equal(E.quickParse('Ask @Mary_Lou about it', T).owner, 'Mary Lou');
  assert.equal(E.quickParse('Open up by 5:30am', T).due, new Date(2026, 10, 27, 5, 30).toISOString());
});

test('quickParse leaves ordinary words alone', () => {
  const p = E.quickParse('Seat 10 people by 3 tables in the back! Wow', T);
  assert.equal(p.text, 'Seat 10 people by 3 tables in the back! Wow');
  assert.equal(p.due, null);
  assert.equal(p.priority, null);
  assert.equal(E.quickParse('email me at desk@', T).owner, '');
  assert.equal(E.quickParse('@Gus', T).text, '@Gus');
});

test('mergeQuick: form choices win, shorthand fills the gaps', () => {
  const parsed = E.quickParse('Fix the sign @Gus ! in 30m', T);
  const fromText = E.mergeQuick({ text: 'Fix the sign @Gus ! in 30m', status: 'open', priority: 'normal', owner: '', due: null }, parsed);
  assert.deepEqual(fromText, { text: 'Fix the sign', status: 'open', priority: 'high', owner: 'Gus', waitingOn: '', due: at(30).toISOString() });
  const formWins = E.mergeQuick({ text: 'x', status: 'done', priority: 'low', owner: 'Priya', due: at(90) }, parsed);
  assert.equal(formWins.status, 'done');
  assert.equal(formWins.priority, 'low');
  assert.equal(formWins.owner, 'Priya');
  assert.equal(formWins.due, at(90).toISOString());
});

// ----------------------------------------------------------- do first

test('doFirst: overdue, due soon and high-priority open items, plus overdue waiting items', () => {
  let s = withShift('Nadia', -600);
  s = add(s, { text: 'overdue', due: at(-10) }, -100, 'over');
  s = add(s, { text: 'soon', due: at(20) }, -100, 'soon');
  s = add(s, { text: 'high', priority: 'high' }, -100, 'high');
  s = add(s, { text: 'later', due: at(200) }, -100, 'later');
  s = add(s, { text: 'plain' }, -100, 'plain');
  s = add(s, { text: 'chase', status: 'waiting', waitingOn: 'Gus', due: at(-30) }, -100, 'chase');
  s = add(s, { text: 'wait ok', status: 'waiting', waitingOn: 'Gus', due: at(30) }, -100, 'waitok');
  s = add(s, { text: 'done high', status: 'done', priority: 'high' }, -100, 'dh');
  assert.deepEqual(E.doFirst(s, T).map((e) => e.id), ['chase', 'over', 'high', 'soon']);
  assert.deepEqual(E.doFirst(s, T, 2).map((e) => e.id), ['chase', 'over']);
});

test('waitingGroups groups by who, A to Z', () => {
  let s = withShift();
  s = add(s, { text: 'a', status: 'waiting', waitingOn: 'gus' }, 0, 'g1');
  s = add(s, { text: 'b', status: 'waiting', waitingOn: 'Board' }, 0, 'g2');
  s = add(s, { text: 'c', status: 'waiting', waitingOn: 'Gus' }, 0, 'g3');
  const g = E.waitingGroups(s, T);
  assert.deepEqual(g.map((x) => x.who), ['Board', 'gus']);
  assert.deepEqual(g[1].entries.map((e) => e.id), ['g1', 'g3']);
});

test('people and shift names feed the suggestion lists', () => {
  const s = handedOver();
  assert.deepEqual(E.people(s), ['Gus', 'Nadia', 'Theo']);
  assert.deepEqual(E.shiftNames(s).slice(0, 3), ['Morning', 'Overnight', 'Day']);
});

test('settings are kept within sensible limits', () => {
  let s = E.updateSettings(E.emptyState(), { place: '  Front desk  ', clock: '24h', soonMinutes: 30 });
  assert.deepEqual(s.settings, { place: 'Front desk', clock: '24h', soonMinutes: 30 });
  s = E.updateSettings(s, { clock: 'sundial', soonMinutes: 9999, place: '' });
  assert.deepEqual(s.settings, { place: 'Shift handoff', clock: '12h', soonMinutes: 60 });
});
