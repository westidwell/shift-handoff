'use strict';
// Smoke test: run the scripts exactly as they sit in index.html, against a
// small stand-in for the browser, then drive the page's own tap and form
// handlers. No real browser is needed, and nothing touches the network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [];
html.replace(/<script>([\s\S]*?)<\/script>/g, (all, code) => { scripts.push(code); return all; });

function makeEl(id) {
  const el = {
    id: id, innerHTML: '', hidden: false, open: false, dataset: {}, attrs: {}, listeners: {},
    classList: {
      set: new Set(),
      add(c) { this.set.add(c); },
      remove(c) { this.set.delete(c); },
      contains(c) { return this.set.has(c); }
    },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    querySelector() { return null; },
    focus() {}, click() {}, remove() {}, scrollIntoView() {},
    showModal() { this.open = true; },
    close() { this.open = false; },
    setAttribute(k, v) { this.attrs[k] = v; if (k === 'open') this.open = true; },
    removeAttribute(k) { delete this.attrs[k]; if (k === 'open') this.open = false; },
    get firstChild() { return { textContent: '' }; }
  };
  return el;
}

function boot(stored) {
  const els = {};
  ['top', 'app', 'fab', 'sheet', 'sheetBody', 'toast'].forEach((id) => { els[id] = makeEl(id); });
  const docListeners = {};
  const store = new Map(Object.entries(stored || {}));
  const network = [];
  const sandbox = {
    console: console,
    document: {
      title: '', hidden: false, activeElement: null,
      body: { appendChild() {} },
      getElementById: (id) => els[id] || null,
      querySelector: (sel) => (sel.includes('app-version') ? { getAttribute: () => '1.0.0' } : null),
      createElement: () => makeEl('created'),
      addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); }
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); }
    },
    navigator: {},
    location: { protocol: 'file:' },
    setInterval: () => 0,
    setTimeout: () => 0,
    clearTimeout: () => {},
    addEventListener: () => {},
    scrollTo: () => {},
    print: () => {},
    fetch: (...args) => { network.push(args); throw new Error('network used'); },
    XMLHttpRequest: function () { network.push('xhr'); throw new Error('network used'); }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  scripts.forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index.html#script' + (i + 1) }));
  const app = sandbox.ShiftApp;
  const E = sandbox.ShiftEngine;

  function tap(dataset, el) {
    let prevented = false;
    const target = Object.assign({ dataset: dataset }, el || {});
    docListeners.click[0]({ target: { closest: () => target }, preventDefault() { prevented = true; } });
    return prevented;
  }
  function submit(kind, fields, radios, dataset) {
    const err = { textContent: '' };
    const form = {
      dataset: Object.assign({ form: kind }, dataset || {}),
      elements: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v }])),
      querySelector(sel) {
        if (sel === '.form-error') return err;
        const m = /input\[name="(\w+)"\]:checked/.exec(sel);
        if (m && radios && radios[m[1]] !== undefined) return { value: radios[m[1]] };
        return null;
      }
    };
    docListeners.submit[0]({ target: form, preventDefault() {} });
    return err.textContent;
  }
  return { els, store, network, app, E, tap, submit, state: () => app.state() };
}

const entryRadios = (o) => Object.assign({ status: 'open', priority: 'normal', dueQuick: 'none' }, o || {});
const entryFields = (o) => Object.assign({ text: '', owner: '', waitingOn: '', dueAt: '' }, o || {});

test('the built page starts, shows the start card, and has no network access', () => {
  assert.equal(scripts.length, 5);
  const p = boot();
  assert.ok(p.app, 'window.ShiftApp is set');
  assert.ok(p.els.app.innerHTML.includes('Start your shift'));
  assert.ok(p.els.top.innerHTML.includes('Shift handoff'));
  assert.equal(p.els.fab.hidden, false);
  assert.deepEqual(p.network, []);
});

test('start a shift, add with shorthand, and everything is saved', () => {
  const p = boot();
  assert.equal(p.submit('start', { by: '', name: '' }), 'Who is starting the shift?');
  assert.equal(p.submit('start', { by: 'Nadia', name: 'Morning' }), '');
  assert.equal(p.state().shift.by, 'Nadia');
  assert.ok(!p.els.app.innerHTML.includes('Start your shift'));

  assert.equal(p.submit('entry', entryFields({ text: '' }), entryRadios()), 'Write what the next person needs to know.');
  assert.equal(p.submit('entry', entryFields({ text: 'Order more cups @Gus ! in 30m' }), entryRadios()), '');
  const e = p.state().entries[0];
  assert.equal(e.text, 'Order more cups');
  assert.equal(e.owner, 'Gus');
  assert.equal(e.priority, 'high');
  assert.ok(e.due);
  assert.equal(p.submit('entry', entryFields({ text: 'Needs a who' }), entryRadios({ status: 'waiting' })), 'Say who or what it is waiting on.');
  assert.equal(p.submit('entry', entryFields({ text: 'Pick needs a time' }), entryRadios({ dueQuick: 'pick' })), 'Pick a date and time, or choose No time.');

  const saved = JSON.parse(p.store.get('shift-handoff:v1'));
  assert.equal(saved.entries.length, 1);
  assert.equal(saved.shift.by, 'Nadia');
  assert.deepEqual(p.network, []);
});

test('sample, acknowledge, move, undo, waiting, edit and handover all work through the page', () => {
  const p = boot();
  p.tap({ act: 'sample' });
  assert.equal(p.state().settings.place, 'Pinecone Community Radio');
  assert.ok(p.els.app.innerHTML.includes('Marisol handed over 6 items.'));

  p.tap({ act: 'ack', id: 'sample-03' });
  assert.equal(p.E.isAcked(p.E.getEntry(p.state(), 'sample-03'), p.state()), true);

  p.tap({ act: 'move', id: 'sample-01', to: 'done' });
  assert.equal(p.E.getEntry(p.state(), 'sample-01').status, 'done');
  p.tap({ act: 'undo' });
  assert.equal(p.E.getEntry(p.state(), 'sample-01').status, 'open');

  p.tap({ act: 'move', id: 'sample-05', to: 'waiting' });
  assert.equal(p.els.sheet.open, true);
  assert.ok(p.els.sheetBody.innerHTML.includes('Waiting on who or what?'));
  p.submit('waiting', { waitingOn: 'Repair shop' }, {}, { id: 'sample-05' });
  assert.equal(p.E.getEntry(p.state(), 'sample-05').waitingOn, 'Repair shop');
  assert.equal(p.els.sheet.open, false);

  p.tap({ act: 'edit', id: 'sample-04' });
  assert.ok(p.els.sheetBody.innerHTML.includes('Edit entry'));
  p.submit('entry', entryFields({ text: 'Called the listener back', owner: 'Theo' }), entryRadios({ status: 'done' }), { id: 'sample-04' });
  const edited = p.E.getEntry(p.state(), 'sample-04');
  assert.equal(edited.text, 'Called the listener back');
  assert.equal(edited.status, 'done');

  p.tap({ act: 'ackAll' });
  assert.equal(p.E.handoverStatus(p.state()).left, 0);

  p.tap({ act: 'handover' });
  p.submit('start', { by: 'Nadia', name: 'Morning drive' });
  assert.equal(p.state().shift.by, 'Nadia');
  assert.equal(p.state().shifts[0].by, 'Theo');
  assert.equal(p.state().shifts[0].handedTo, 'Nadia');
  assert.ok(p.els.app.innerHTML.includes('Theo handed over'));
  assert.deepEqual(p.network, []);
});

test('views, settings, Pro buttons and erase work through the page', () => {
  const p = boot();
  p.tap({ act: 'sample' });
  p.tap({ act: 'nav', view: 'summary' });
  assert.ok(p.els.app.innerHTML.includes('End-of-shift summary'));
  assert.equal(p.els.fab.hidden, true);
  p.tap({ act: 'nav', view: 'more' });
  assert.ok(p.els.app.innerHTML.includes('Your data'));
  assert.equal(JSON.parse(p.store.get('shift-handoff:ui')).view, 'more');

  p.tap({ act: 'setting', key: 'clock', value: '24h' });
  assert.equal(p.state().settings.clock, '24h');
  p.tap({ act: 'setting', key: 'soonMinutes', value: '120' });
  assert.equal(p.state().settings.soonMinutes, 120);

  p.tap({ act: 'pro', feature: 'teamLog' });
  assert.ok(p.els.sheetBody.innerHTML.includes('Team live log is part of Pro ($1/month, not open yet): see PRO.md'));
  p.tap({ act: 'close' });
  assert.equal(p.els.sheet.open, false);

  // Inside a form the message shows in place, so a half-typed entry survives.
  const holder = { innerHTML: '' };
  const form = { querySelector: (sel) => (sel === '.pro-inline' ? holder : null) };
  p.tap({ act: 'pro', feature: 'media' }, { closest: (sel) => (sel === 'form' ? form : null) });
  assert.ok(holder.innerHTML.includes('Photo or voice note is part of Pro ($1/month, not open yet): see PRO.md'));
  assert.ok(holder.innerHTML.includes('Read PRO.md'));
  assert.equal(p.els.sheet.open, false);

  p.tap({ act: 'erase' });
  p.tap({ act: 'eraseYes' });
  assert.equal(p.state().entries.length, 0);
  p.tap({ act: 'undo' });
  assert.equal(p.state().entries.length, 13);
});

test('errors from a tap show a message instead of breaking the page', () => {
  const p = boot();
  p.tap({ act: 'ack', id: 'does-not-exist' });
  assert.equal(p.els.sheet.open, true);
  assert.ok(p.els.sheetBody.innerHTML.includes('That did not work'));
});

test('a saved log loads on start; unreadable data is set aside, not overwritten', () => {
  const p1 = boot();
  p1.tap({ act: 'sample' });
  const saved = p1.store.get('shift-handoff:v1');
  const p2 = boot({ 'shift-handoff:v1': saved });
  assert.equal(p2.state().entries.length, 13);
  assert.ok(p2.els.app.innerHTML.includes('Pinecone Community Radio') || p2.els.top.innerHTML.includes('Pinecone Community Radio'));

  const p3 = boot({ 'shift-handoff:v1': '{not json' });
  assert.equal(p3.state().entries.length, 0);
  assert.equal(p3.store.get('shift-handoff:v1:unreadable'), '{not json');
});
