/*
 * Shift Handoff: the page.
 *
 * Wires the engine and the views to the browser: saves to localStorage,
 * handles taps and forms, downloads backups. It makes no network requests.
 */
(function () {
  'use strict';

  const E = window.ShiftEngine;
  const V = window.ShiftView;
  const S = window.ShiftSample;

  const KEY = 'shift-handoff:v1';
  const UI_KEY = 'shift-handoff:ui';
  const VIEWS = ['board', 'summary', 'more'];
  const COLS = ['open', 'waiting', 'done'];

  const $ = function (id) { return document.getElementById(id); };
  const versionMeta = document.querySelector('meta[name="app-version"]');
  const VERSION = versionMeta ? versionMeta.getAttribute('content') : '';

  let state = E.emptyState();
  let ui = { view: 'board', col: 'open', showAllDone: false };
  let saveOk = true;
  let undoState = null;
  let toastTimer = null;
  let installEvent = null;

  // ------------------------------------------------------------- storage

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (err) {
      saveOk = false; // storage is blocked (private window, strict settings)
    }
    state = E.emptyState();
    if (raw) {
      try {
        state = E.normalizeState(JSON.parse(raw));
      } catch (err) {
        // Keep unreadable data to one side instead of overwriting it.
        try { localStorage.setItem(KEY + ':unreadable', raw); } catch (e2) { /* nothing more to do */ }
      }
    }
    try {
      const saved = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
      if (VIEWS.indexOf(saved.view) >= 0) ui.view = saved.view;
      if (COLS.indexOf(saved.col) >= 0) ui.col = saved.col;
    } catch (err) { /* a remembered tab is only a convenience */ }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      saveOk = true;
    } catch (err) {
      saveOk = false;
    }
  }

  function saveUi() {
    try { localStorage.setItem(UI_KEY, JSON.stringify({ view: ui.view, col: ui.col })); } catch (err) { /* fine */ }
  }

  // ------------------------------------------------------------ rendering

  function render() {
    const now = new Date();
    $('top').innerHTML = V.header(state, ui, { saveOk: saveOk }, now);
    let html;
    if (ui.view === 'summary') html = V.summary(state, ui, now, { canShare: typeof navigator.share === 'function' });
    else if (ui.view === 'more') html = V.more(state, ui, { canInstall: !!installEvent, version: VERSION });
    else html = V.board(state, ui, now);
    $('app').innerHTML = html;
    $('fab').hidden = ui.view !== 'board';
    document.title = state.settings.place === E.DEFAULT_SETTINGS.place ? 'Shift Handoff' : state.settings.place + ' · Shift Handoff';
  }

  /** Apply a change: save it, redraw, and offer Undo when asked. */
  function commit(next, message, undoable) {
    const before = state;
    state = next;
    save();
    render();
    if (message) toast(message, undoable ? before : null);
  }

  function attempt(fn) {
    try {
      fn();
    } catch (err) {
      openSheet('message', { title: 'That did not work', text: err && err.message ? err.message : String(err) });
    }
  }

  // ---------------------------------------------------------------- toast

  function toast(message, before) {
    const el = $('toast');
    undoState = before || null;
    el.innerHTML = '<span></span>' + (undoState ? '<button type="button" class="link" data-act="undo">Undo</button>' : '');
    el.firstChild.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
      undoState = null;
    }, undoState ? 7000 : 3500);
  }

  // ---------------------------------------------------------------- sheet

  function openSheet(kind, ctx) {
    const dlg = $('sheet');
    $('sheetBody').innerHTML = V.sheet(kind, state, ctx);
    if (typeof dlg.showModal === 'function') {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
    const first = $('sheetBody').querySelector('textarea:not([readonly]), input:not([type="radio"]):not([type="datetime-local"])');
    if (first) first.focus();
    else {
      const btn = $('sheetBody').querySelector('button, a');
      if (btn) btn.focus();
    }
  }

  function closeSheet() {
    const dlg = $('sheet');
    if (typeof dlg.close === 'function' && dlg.open) dlg.close();
    else dlg.removeAttribute('open');
    $('sheetBody').innerHTML = '';
  }

  function formError(form, message) {
    const el = form.querySelector('.form-error');
    if (el) el.textContent = message;
  }

  // ------------------------------------------------------------ files

  function download(name, text, type) {
    const blob = new Blob([text], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function pickFile(accept, onText) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () { attempt(function () { onText(String(reader.result)); }); };
      reader.onerror = function () { openSheet('message', { title: 'Could not read that file', text: 'Try again, or pick a different file.' }); };
      reader.readAsText(file);
    });
    input.click();
  }

  function copyText(text) {
    const fallback = function () { openSheet('copy', { text: text }); };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(function () { toast('Summary copied'); }, fallback);
    } else {
      fallback();
    }
  }

  // -------------------------------------------------------------- actions

  function go(view) {
    ui.view = view;
    saveUi();
    render();
    window.scrollTo(0, 0);
  }

  function focusEntry(id) {
    const e = state.entries.find(function (x) { return x.id === id; });
    if (!e) return;
    ui.col = e.status;
    ui.view = 'board';
    saveUi();
    render();
    const el = document.getElementById('entry-' + id);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('flash');
      setTimeout(function () { el.classList.remove('flash'); }, 1600);
    }
  }

  const actions = {
    nav: function (d) { if (VIEWS.indexOf(d.view) >= 0) go(d.view); },
    col: function (d) { if (COLS.indexOf(d.col) >= 0) { ui.col = d.col; saveUi(); render(); } },
    add: function () { openSheet('entry', {}); },
    edit: function (d) { openSheet('entry', { id: d.id }); },
    focus: function (d) { focusEntry(d.id); },
    move: function (d) {
      if (d.to === 'waiting') { openSheet('waiting', { id: d.id }); return; }
      commit(E.moveEntry(state, d.id, d.to, new Date()), d.to === 'done' ? 'Marked done' : 'Moved to Open', true);
    },
    ack: function (d) { commit(E.acknowledge(state, d.id, new Date()), 'Got it', true); },
    ackAll: function () { commit(E.acknowledgeAll(state, new Date()), 'Got it, all of them', true); },
    delete: function (d) { closeSheet(); commit(E.removeEntry(state, d.id), 'Deleted', true); },
    undo: function () {
      if (!undoState) return;
      state = undoState;
      undoState = null;
      save();
      render();
      $('toast').classList.remove('show');
    },
    close: function () { closeSheet(); },
    allDone: function () { ui.showAllDone = true; render(); },
    handover: function () { openSheet('handover', {}); },
    endShift: function () { commit(E.endShift(state, new Date()), 'Shift ended', true); },
    print: function () { window.print(); },
    copy: function () { copyText(E.summaryText(state, new Date())); },
    share: function () {
      const text = E.summaryText(state, new Date());
      navigator.share({ title: 'Shift handoff: ' + state.settings.place, text: text }).catch(function () { /* closed the share sheet */ });
    },
    setting: function (d) {
      const patch = {};
      patch[d.key] = d.key === 'soonMinutes' ? Number(d.value) : d.value;
      commit(E.updateSettings(state, patch));
    },
    backup: function () {
      const now = new Date();
      download('shift-handoff-backup-' + E.dateStamp(now) + '.json', E.toBackup(state, now), 'application/json');
      toast('Backup saved to your downloads');
    },
    restore: function () {
      pickFile('.json,application/json', function (text) {
        commit(E.fromBackup(text), 'Backup restored', true);
      });
    },
    csv: function () {
      download('shift-handoff-' + E.dateStamp(new Date()) + '.csv', E.toCSV(state), 'text/csv;charset=utf-8');
      toast('CSV saved to your downloads');
    },
    importCsv: function () {
      pickFile('.csv,text/csv', function (text) {
        const r = E.importCSV(state, text, new Date());
        commit(r.state, 'Added ' + r.added + (r.added === 1 ? ' entry' : ' entries') + (r.skipped ? ', skipped ' + r.skipped + ' already here' : ''), true);
      });
    },
    sample: function () {
      ui.col = 'open';
      commit(S.makeSample(new Date()), 'Loaded the sample log', true);
    },
    erase: function () { openSheet('erase', {}); },
    eraseYes: function () { closeSheet(); commit(E.emptyState(), 'Erased', true); },
    pro: function (d, el) {
      // Inside a form, show the message in place so nothing typed is lost.
      const form = el && typeof el.closest === 'function' ? el.closest('form') : null;
      const holder = form ? form.querySelector('.pro-inline') : null;
      if (holder) {
        holder.innerHTML = V.proInline(d.feature);
        return;
      }
      openSheet('pro', { feature: d.feature });
    },
    install: function () {
      if (!installEvent) return;
      installEvent.prompt();
      installEvent = null;
      render();
    }
  };

  function onClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (!fn) return;
    ev.preventDefault();
    attempt(function () { fn(el.dataset, el); });
  }

  // --------------------------------------------------------------- forms

  function readDue(form, now) {
    const mode = (form.querySelector('input[name="dueQuick"]:checked') || {}).value || 'none';
    if (mode === 'none') return null;
    if (mode === 'pick') return E.fromLocalInput(form.elements.dueAt.value);
    return E.addMinutes(now, Number(mode)).toISOString();
  }

  function radioValue(form, name, fallback) {
    const el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : fallback;
  }

  function submitEntry(form) {
    const now = new Date();
    const id = form.dataset.id;
    const f = form.elements;
    const mode = (form.querySelector('input[name="dueQuick"]:checked') || {}).value;
    if (mode === 'pick' && !E.fromLocalInput(f.dueAt.value)) {
      formError(form, 'Pick a date and time, or choose No time.');
      return;
    }
    const input = {
      text: f.text.value,
      status: radioValue(form, 'status', 'open'),
      priority: radioValue(form, 'priority', 'normal'),
      owner: f.owner.value,
      waitingOn: f.waitingOn.value,
      due: readDue(form, now)
    };
    if (!id) {
      const merged = E.mergeQuick(input, E.quickParse(input.text, now));
      commit(E.addEntry(state, merged, now), merged.status === 'done' ? 'Logged as done' : 'Added to ' + merged.status, true);
      closeSheet();
      return;
    }
    const current = E.getEntry(state, id);
    let next = state;
    if (input.status !== current.status) next = E.moveEntry(next, id, input.status, now, { waitingOn: input.waitingOn });
    const patch = { text: input.text, priority: input.priority, owner: input.owner, due: input.due };
    if (input.status === 'waiting') patch.waitingOn = input.waitingOn;
    next = E.updateEntry(next, id, patch, now);
    commit(next, 'Saved', true);
    closeSheet();
  }

  function onSubmit(ev) {
    const form = ev.target;
    if (!form.dataset || !form.dataset.form) return;
    ev.preventDefault();
    try {
      if (form.dataset.form === 'entry') submitEntry(form);
      else if (form.dataset.form === 'waiting') {
        commit(E.moveEntry(state, form.dataset.id, 'waiting', new Date(), { waitingOn: form.elements.waitingOn.value }), 'Moved to Waiting', true);
        closeSheet();
      } else if (form.dataset.form === 'start') {
        const was = state.shift;
        const next = E.startShift(state, { by: form.elements.by.value, name: form.elements.name.value }, new Date());
        closeSheet();
        ui.view = 'board';
        ui.col = 'open';
        saveUi();
        commit(next, was ? 'Handed over. Welcome, ' + next.shift.by : 'Shift started', true);
        window.scrollTo(0, 0);
      }
    } catch (err) {
      formError(form, err && err.message ? err.message : String(err));
    }
  }

  function onChange(ev) {
    const t = ev.target;
    const form = t.form;
    if (form && form.dataset.form === 'entry') {
      if (t.name === 'status') form.dataset.status = t.value;
      if (t.name === 'dueQuick') {
        form.dataset.due = t.value;
        if (t.value === 'pick' && !form.elements.dueAt.value) {
          form.elements.dueAt.value = E.toLocalInput(E.addMinutes(new Date(), 60));
        }
      }
      formError(form, '');
    }
    if (t.dataset && t.dataset.setting === 'place') {
      commit(E.updateSettings(state, { place: t.value }), 'Name saved');
    }
  }

  function onKey(ev) {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && ev.target.form && ev.target.form.dataset.form) {
      ev.preventDefault();
      if (typeof ev.target.form.requestSubmit === 'function') ev.target.form.requestSubmit();
      else ev.target.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  }

  // ---------------------------------------------------------------- start

  function typing() {
    const a = document.activeElement;
    return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  function start() {
    load();
    render();
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    $('sheet').addEventListener('click', function (ev) {
      if (ev.target === $('sheet')) closeSheet();
    });
    $('sheet').addEventListener('close', function () { $('sheetBody').innerHTML = ''; });

    // Keep due times fresh without disturbing anyone mid-typing.
    setInterval(function () {
      if (document.hidden || $('sheet').open || typing()) return;
      render();
    }, 30000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !$('sheet').open && !typing()) render();
    });

    // Two tabs on the same device stay in step.
    window.addEventListener('storage', function (ev) {
      if (ev.key !== KEY) return;
      load();
      if (!$('sheet').open && !typing()) render();
    });

    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();
      installEvent = ev;
      if (ui.view === 'more') render();
    });

    // Offline support. Only works when the page is served over http(s).
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* no offline copy, still works */ });
      });
    }
  }

  window.ShiftApp = { render: render, state: function () { return state; }, actions: actions };
  start();
}());
