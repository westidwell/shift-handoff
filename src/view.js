/*
 * Shift Handoff: views.
 *
 * Pure functions that turn the state into HTML strings. They never touch the
 * DOM, so the Node tests can render every screen and check what is on it.
 * Everything that came from a person goes through esc() before it is shown.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./pro.js'));
  else root.ShiftView = factory(root.ShiftEngine, root.ShiftPro);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (E, P) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  function clip(text, max) {
    const s = String(text).replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1).trim() + '…' : s;
  }

  const BRAND = '<svg class="brand-icon" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#f2a93b"/>' +
    '<path d="M14 22h30m-8-8 8 8-8 8M50 42H20m8-8-8 8 8 8" fill="none" stroke="#14161b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const LOCK = '<svg class="lock" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.75 7V5.25a3.25 3.25 0 0 1 6.5 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<rect x="3" y="7" width="10" height="7.5" rx="1.75" fill="currentColor"/></svg>';

  const STATUS_LABEL = { open: 'Open', waiting: 'Waiting', done: 'Done' };
  const COLUMN_NOTE = { open: 'Still needs doing', waiting: 'Blocked on someone or something', done: 'What happened' };
  const EMPTY = {
    open: 'Nothing open. Tap Add to leave something for the next person.',
    waiting: 'Nothing is waiting on anyone.',
    done: 'Nothing done yet. Things you finish, and things that just happened, land here.'
  };
  const DONE_LIMIT = 20;

  function proButton(id, label, extraClass) {
    const f = P.feature(id);
    return '<button type="button" class="btn ghost locked' + (extraClass ? ' ' + extraClass : '') + '" data-act="pro" data-feature="' + esc(f.id) + '"' +
      ' aria-label="' + esc((label || f.name) + ' (Pro, not open yet)') + '">' + LOCK + '<span>' + esc(label || f.name) + '</span><span class="pro-tag">Pro</span></button>';
  }

  function datalist(id, items) {
    return '<datalist id="' + esc(id) + '">' + items.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>';
  }

  function chip(name, value, label, current) {
    return '<label class="chip"><input type="radio" name="' + esc(name) + '" value="' + esc(value) + '"' + (value === current ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }

  function priorityBadge(p) {
    if (p === 'high') return '<span class="badge high">High</span>';
    if (p === 'low') return '<span class="badge low">Low</span>';
    return '';
  }

  // ---------------------------------------------------------------- header

  function header(state, ui, info, now) {
    info = info || {};
    const st = state.settings;
    const shift = state.shift
      ? esc(state.shift.name) + ' shift · ' + esc(state.shift.by) + ' · since ' + esc(E.fmtWhen(state.shift.startedAt, now, st.clock))
      : 'No shift running';
    const c = E.counts(state);
    const tabs = [
      ['board', 'Board', c.open + c.waiting ? String(c.open + c.waiting) : ''],
      ['summary', 'Summary', ''],
      ['more', 'More', '']
    ].map(function (t) {
      return '<button type="button" class="tab" data-act="nav" data-view="' + t[0] + '"' + (ui.view === t[0] ? ' aria-current="page"' : '') + '>' +
        esc(t[1]) + (t[2] ? ' <span class="count">' + esc(t[2]) + '</span>' : '') + '</button>';
    }).join('');
    return '<div class="topbar">' +
      '<div class="brand">' + BRAND + '<div class="brand-text"><span class="place">' + esc(st.place) + '</span><span class="who">' + shift + '</span></div></div>' +
      '<span class="save' + (info.saveOk === false ? ' bad' : '') + '">' + (info.saveOk === false ? 'Not saved: this browser blocks storage' : 'Saved on this device') + '</span>' +
      '</div><nav class="views" aria-label="Views">' + tabs + '</nav>';
  }

  // ----------------------------------------------------------------- board

  function startForm(state, prefix, handover) {
    return '<form data-form="start" class="stack" autocomplete="off" novalidate>' +
      '<label class="f" for="' + prefix + '-by">Your name</label>' +
      '<input id="' + prefix + '-by" name="by" list="' + prefix + '-people" maxlength="60" placeholder="First name is fine" required>' +
      '<label class="f" for="' + prefix + '-name">Which shift?</label>' +
      '<input id="' + prefix + '-name" name="name" list="' + prefix + '-shifts" maxlength="40" placeholder="Morning, Day, Evening, Overnight">' +
      '<p class="form-error" role="alert"></p>' +
      '<div class="actions"><button class="btn" type="submit">' + (handover ? 'Take over the shift' : 'Start shift') + '</button>' +
      (handover ? '<button class="btn ghost" type="button" data-act="close">Cancel</button>' : '') +
      proButton('signIn', 'Sign in instead') + '</div>' +
      '<p class="pro-inline" role="status"></p>' +
      '</form>' + datalist(prefix + '-people', E.people(state)) + datalist(prefix + '-shifts', E.shiftNames(state));
  }

  function startCard(state) {
    return '<section class="card start" aria-labelledby="h-start">' +
      '<h1 id="h-start">Start your shift</h1>' +
      '<p class="lead">Put your name on the shift, so everything you add, move or acknowledge is marked as yours.</p>' +
      startForm(state, 'st', false) +
      '<p class="muted small">First time here? <button type="button" class="link" data-act="sample">Load a sample log</button> from a made-up community radio station and click around.</p>' +
      '</section>';
  }

  function handoverBanner(h) {
    const who = h.from ? esc(h.from) + ' handed over ' : 'You were handed ';
    return '<section class="banner handover" aria-labelledby="h-hand">' +
      '<div class="banner-text"><strong id="h-hand">' + who + h.handed + (h.handed === 1 ? ' item' : ' items') + '.</strong> ' +
      h.acked + ' of ' + h.handed + ' acknowledged. Tap “I’ve got it” on each one, or take them all at once.</div>' +
      '<progress max="' + h.handed + '" value="' + h.acked + '" aria-label="Acknowledged">' + h.acked + ' of ' + h.handed + '</progress>' +
      '<button type="button" class="btn" data-act="ackAll">Got it, all ' + h.left + '</button>' +
      '</section>';
  }

  function doFirstCard(items, state, now) {
    const st = state.settings;
    return '<section class="card first" aria-labelledby="h-first"><h2 id="h-first">Do first</h2><ol class="first-list">' +
      items.map(function (e) {
        const due = E.dueText(e, now, st);
        const meta = [];
        if (e.status === 'waiting') meta.push('chase ' + (e.waitingOn || 'it'));
        if (due) meta.push(due);
        if (e.owner) meta.push(e.owner);
        return '<li><button type="button" class="first-item" data-act="focus" data-id="' + esc(e.id) + '">' +
          priorityBadge(e.priority) + '<span class="first-text">' + esc(clip(e.text, 120)) + '</span>' +
          (meta.length ? '<span class="first-meta due-' + E.dueState(e, now, st.soonMinutes) + '">' + esc(meta.join(' · ')) + '</span>' : '') +
          '</button></li>';
      }).join('') + '</ol></section>';
  }

  function entryCard(e, state, now) {
    const st = state.settings;
    const ds = E.dueState(e, now, st.soonMinutes);
    const due = E.dueText(e, now, st);
    const needs = E.needsAck(e, state);
    const acked = E.isAcked(e, state);
    const top = [priorityBadge(e.priority)];
    if (e.status === 'waiting') top.push('<span class="pill wait">Waiting on ' + esc(e.waitingOn || 'someone') + '</span>');
    if (due) top.push('<span class="pill due due-' + ds + '">' + esc(due.charAt(0).toUpperCase() + due.slice(1)) + '</span>');
    if (needs) top.push('<span class="pill new">Handed to you</span>');
    const meta = [];
    if (e.owner) meta.push('Owner: ' + esc(e.owner));
    meta.push('Added by ' + esc(e.createdBy || 'someone') + ', ' + esc(E.fmtWhen(e.createdAt, now, st.clock)));
    if (e.status === 'done') meta.push('Done by ' + esc(e.doneBy || 'someone') + ', ' + esc(E.fmtWhen(e.doneAt, now, st.clock)));
    else {
      const age = E.ageText(e, now);
      if (age) meta.push(esc(age.charAt(0).toUpperCase() + age.slice(1)));
    }
    const actions = [];
    if (needs) actions.push('<button type="button" class="btn got" data-act="ack" data-id="' + esc(e.id) + '">I’ve got it</button>');
    if (e.status === 'open') {
      actions.push(moveBtn(e, 'waiting', 'Waiting'), moveBtn(e, 'done', 'Done'));
    } else if (e.status === 'waiting') {
      actions.push(moveBtn(e, 'open', 'Back to open'), moveBtn(e, 'done', 'Done'));
    } else {
      actions.push(moveBtn(e, 'open', 'Reopen'));
    }
    actions.push('<button type="button" class="btn ghost small" data-act="edit" data-id="' + esc(e.id) + '">Edit</button>');
    return '<article class="entry pri-' + e.priority + ' due-' + ds + (needs ? ' needs-ack' : '') + '" id="entry-' + esc(e.id) + '" data-id="' + esc(e.id) + '">' +
      (top.join('') ? '<div class="entry-top">' + top.join('') + '</div>' : '') +
      '<p class="text">' + esc(e.text) + '</p>' +
      '<p class="meta">' + meta.join(' · ') + '</p>' +
      (acked ? '<p class="ack">Got it: ' + esc(e.ack.by) + ', ' + esc(E.fmtTime(e.ack.at, st.clock)) + '</p>' : '') +
      '<div class="actions">' + actions.join('') + '</div>' +
      '</article>';
  }

  function moveBtn(e, to, label) {
    return '<button type="button" class="btn ghost small" data-act="move" data-id="' + esc(e.id) + '" data-to="' + to + '"' +
      ' aria-label="' + esc(label + ': ' + clip(e.text, 60)) + '">' + esc(label) + '</button>';
  }

  function column(status, state, ui, now) {
    let items = E.listStatus(state, status, now);
    const total = items.length;
    let more = '';
    if (status === 'done' && !ui.showAllDone && total > DONE_LIMIT) {
      items = items.slice(0, DONE_LIMIT);
      more = '<button type="button" class="btn ghost small wide" data-act="allDone">Show all ' + total + ' done</button>';
    }
    return '<section class="col" data-col="' + status + '" aria-labelledby="h-col-' + status + '">' +
      '<h2 id="h-col-' + status + '">' + STATUS_LABEL[status] + ' <span class="count">' + total + '</span></h2>' +
      '<p class="col-note">' + COLUMN_NOTE[status] + '</p>' +
      (items.length ? items.map(function (e) { return entryCard(e, state, now); }).join('') : '<p class="empty">' + EMPTY[status] + '</p>') +
      more + '</section>';
  }

  function colTabs(current, c) {
    return '<div class="coltabs" role="group" aria-label="Show column">' +
      ['open', 'waiting', 'done'].map(function (s) {
        return '<button type="button" class="tab" data-act="col" data-col="' + s + '" aria-pressed="' + (s === current) + '">' +
          STATUS_LABEL[s] + ' <span class="count">' + c[s] + '</span></button>';
      }).join('') + '</div>';
  }

  function board(state, ui, now) {
    const out = [];
    if (!state.shift) out.push(startCard(state));
    else {
      const h = E.handoverStatus(state);
      if (h.left > 0) out.push(handoverBanner(h));
    }
    const first = E.doFirst(state, now, 5);
    if (first.length) out.push(doFirstCard(first, state, now));
    out.push(colTabs(ui.col, E.counts(state)));
    out.push('<div class="board" data-show="' + esc(ui.col) + '">' +
      ['open', 'waiting', 'done'].map(function (s) { return column(s, state, ui, now); }).join('') + '</div>');
    return out.join('');
  }

  // --------------------------------------------------------------- summary

  function summaryItem(e, now, st, grouped) {
    const bits = [];
    if (e.status === 'waiting' && !grouped) bits.push('waiting on ' + (e.waitingOn || 'someone'));
    if (e.owner) bits.push('owner ' + e.owner);
    const due = E.dueText(e, now, st);
    return '<li>' + priorityBadge(e.priority) + '<span class="s-text">' + esc(e.text) + '</span>' +
      (bits.length ? ' <span class="s-meta">' + esc(bits.join(', ')) + '</span>' : '') +
      (due ? ' <span class="s-meta due-' + E.dueState(e, now, st.soonMinutes) + '">' + esc(due) + '</span>' : '') + '</li>';
  }

  function stat(n, label) {
    return '<div class="stat"><b>' + n + '</b><span>' + esc(label) + '</span></div>';
  }

  function summary(state, ui, now, info) {
    info = info || {};
    const st = state.settings;
    const m = E.summaryModel(state, now);
    const waitingCount = m.waiting.reduce(function (n, g) { return n + g.entries.length; }, 0);
    const parts = [];
    parts.push('<section class="summary print-area" aria-labelledby="h-sum">');
    parts.push('<h1 id="h-sum">End-of-shift summary</h1>');
    parts.push('<p class="lead"><strong>' + esc(m.place) + '</strong><br>' +
      (m.shift ? esc(m.shift.name) + ' shift, ' + esc(m.shift.by) + ', since ' + esc(E.fmtStamp(m.shift.startedAt, st.clock)) : 'No shift running') +
      '<br>Made ' + esc(E.fmtStamp(now, st.clock)) + '</p>');
    parts.push('<div class="stats">' + stat(m.counts.open, 'open') + stat(m.counts.waiting, 'waiting') +
      stat(m.counts.doneThisShift, 'done this shift') + stat(m.counts.notAcked, 'not acknowledged') + '</div>');

    parts.push('<h2>Do first</h2>');
    parts.push(m.doFirst.length
      ? '<ol class="s-list">' + m.doFirst.map(function (e) { return summaryItem(e, now, st, false); }).join('') + '</ol>'
      : '<p class="empty">Nothing urgent.</p>');

    parts.push('<h2>Also open <span class="count">' + m.alsoOpen.length + '</span></h2>');
    parts.push(m.alsoOpen.length
      ? '<ul class="s-list">' + m.alsoOpen.map(function (e) { return summaryItem(e, now, st, false); }).join('') + '</ul>'
      : '<p class="empty">Nothing else open.</p>');

    parts.push('<h2>Waiting on others <span class="count">' + waitingCount + '</span></h2>');
    parts.push(waitingCount
      ? m.waiting.map(function (g) {
        return '<h3>On ' + esc(g.who) + '</h3><ul class="s-list">' + g.entries.map(function (e) { return summaryItem(e, now, st, true); }).join('') + '</ul>';
      }).join('')
      : '<p class="empty">Nothing waiting.</p>');

    parts.push('<h2>Done this shift <span class="count">' + m.done.length + '</span></h2>');
    parts.push(m.done.length
      ? '<ul class="s-list done-list">' + m.done.map(function (e) {
        return '<li><span class="s-time">' + esc(E.fmtTime(e.doneAt, st.clock)) + '</span><span class="s-text">' + esc(e.text) + '</span>' +
          (e.doneBy ? ' <span class="s-meta">' + esc(e.doneBy) + '</span>' : '') + '</li>';
      }).join('') + '</ul>'
      : '<p class="empty">Nothing logged as done yet.</p>');

    if (m.notAcked.length) {
      parts.push('<h2>Handed over, not acknowledged yet <span class="count">' + m.notAcked.length + '</span></h2>');
      parts.push('<ul class="s-list">' + m.notAcked.map(function (e) { return summaryItem(e, now, st, false); }).join('') + '</ul>');
    }
    parts.push('</section>');

    parts.push('<div class="actions no-print">' +
      '<button type="button" class="btn" data-act="print">Print</button>' +
      '<button type="button" class="btn ghost" data-act="copy">Copy as text</button>' +
      (info.canShare ? '<button type="button" class="btn ghost" data-act="share">Share</button>' : '') +
      '<button type="button" class="btn ghost" data-act="handover">Hand over to the next person</button>' +
      (state.shift ? '<button type="button" class="btn ghost" data-act="endShift">End shift, nobody next</button>' : '') +
      '</div>');

    parts.push('<section class="card no-print" aria-labelledby="h-sum-pro"><h2 id="h-sum-pro">More in Pro</h2>' +
      '<p class="muted small">Planned for the Pro edition, which is not open yet.</p><div class="actions">' +
      proButton('aiSummary') + proButton('weeklyDigest') + proButton('spreadsheetExport') + proButton('reminders') +
      '</div></section>');

    if (state.shifts.length) {
      parts.push('<section class="card no-print" aria-labelledby="h-past"><h2 id="h-past">Recent handovers</h2><ul class="past">' +
        state.shifts.slice(0, 10).map(function (s) {
          return '<li><strong>' + esc(s.name) + '</strong>, ' + esc(s.by) + (s.handedTo ? ' to ' + esc(s.handedTo) : '') +
            '<br><span class="muted small">' + esc(E.fmtStamp(s.startedAt, st.clock)) + ' to ' + esc(E.fmtStamp(s.endedAt, st.clock)) +
            ' · left ' + s.counts.open + ' open, ' + s.counts.waiting + ' waiting · ' + s.counts.done + ' done</span></li>';
        }).join('') + '</ul></section>');
    }
    return parts.join('');
  }

  // ------------------------------------------------------------------ more

  function settingChip(key, value, label, current) {
    return '<button type="button" class="tab" data-act="setting" data-key="' + esc(key) + '" data-value="' + esc(value) + '" aria-pressed="' + (String(value) === String(current)) + '">' + esc(label) + '</button>';
  }

  function more(state, ui, info) {
    info = info || {};
    const st = state.settings;
    return '<h1>More</h1>' +
      '<section class="card" aria-labelledby="h-log"><h2 id="h-log">This log</h2>' +
      '<label class="f" for="m-place">Name of the log</label>' +
      '<input id="m-place" data-setting="place" maxlength="80" value="' + esc(st.place) + '">' +
      '<p class="hint">Shows at the top of the page and on the printed summary.</p>' +
      '<p class="f">Clock</p><div class="row-chips">' + settingChip('clock', '12h', '2:30 pm', st.clock) + settingChip('clock', '24h', '14:30', st.clock) + '</div>' +
      '<p class="f">Count as “due soon” when it is due within</p><div class="row-chips">' +
      settingChip('soonMinutes', 30, '30 min', st.soonMinutes) + settingChip('soonMinutes', 60, '1 hour', st.soonMinutes) + settingChip('soonMinutes', 120, '2 hours', st.soonMinutes) +
      '</div></section>' +

      '<section class="card" aria-labelledby="h-data"><h2 id="h-data">Your data</h2>' +
      '<p class="muted">Everything stays in this browser, on this device. Nothing is sent anywhere. Make a backup now and then, and before you clear your browser.</p>' +
      '<div class="actions">' +
      '<button type="button" class="btn" data-act="backup">Back up (.json)</button>' +
      '<button type="button" class="btn ghost" data-act="restore">Restore a backup</button>' +
      '<button type="button" class="btn ghost" data-act="csv">Export CSV</button>' +
      '<button type="button" class="btn ghost" data-act="importCsv">Import CSV</button>' +
      proButton('spreadsheetExport', 'Spreadsheet (.xlsx)') +
      '</div><div class="actions">' +
      '<button type="button" class="btn ghost" data-act="sample">Load the sample log</button>' +
      '<button type="button" class="btn ghost danger-text" data-act="erase">Erase everything</button>' +
      '</div></section>' +

      '<section class="card" aria-labelledby="h-install"><h2 id="h-install">Put it on your home screen</h2>' +
      (info.canInstall ? '<div class="actions"><button type="button" class="btn" data-act="install">Install</button></div>' : '') +
      '<p class="muted">iPhone or iPad: Share, then Add to Home Screen. Android: the browser menu, then Install app or Add to Home screen. ' +
      'It opens full screen and keeps working with no signal.</p></section>' +

      '<section class="card" aria-labelledby="h-pro"><h2 id="h-pro">Pro (not open yet)</h2>' +
      '<p class="muted">These are planned for a Pro edition at ' + esc(P.PRO_PRICE) + '. They are shown here locked so you know what is coming.</p>' +
      '<ul class="pro-list">' + P.PRO_FEATURES.map(function (f) {
        return '<li>' + proButton(f.id) + '<span class="muted small">' + esc(f.line) + '</span></li>';
      }).join('') + '</ul>' +
      '<p><a href="' + esc(P.PRO_URL) + '" target="_blank" rel="noopener noreferrer">Read PRO.md</a></p></section>' +

      '<section class="card" aria-labelledby="h-about"><h2 id="h-about">About</h2>' +
      '<p>Shift Handoff' + (info.version ? ' ' + esc(info.version) : '') + '. Free and open source under the MIT licence. ' +
      'No account, no tracking, no network calls: the page’s own security policy blocks them.</p>' +
      '<p class="muted small">Shortcuts when adding: <code>@Name</code> sets the owner, <code>!</code> marks it high priority, ' +
      '<code>by 7am</code> or <code>in 30m</code> sets a due time, <code>waiting on Gus</code> files it under Waiting. Ctrl+Enter saves.</p></section>';
  }

  // ---------------------------------------------------------------- sheets

  function historyBlock(e, st) {
    if (!e.history.length) return '';
    return '<details class="history"><summary>History (' + e.history.length + ')</summary><ul>' +
      e.history.slice().reverse().map(function (h) {
        return '<li><span class="s-time">' + esc(E.fmtStamp(h.at, st.clock)) + '</span> ' + esc(h.by || 'someone') + ' ' + esc(h.did) +
          (h.note ? ': ' + esc(h.note) : '') + '</li>';
      }).join('') + '</ul></details>';
  }

  function entryForm(state, ctx) {
    const st = state.settings;
    const e = ctx && ctx.id ? E.getEntry(state, ctx.id) : null;
    const status = e ? e.status : 'open';
    const pri = e ? e.priority : 'normal';
    const dueMode = e && e.due ? 'pick' : 'none';
    return '<form data-form="entry" data-id="' + (e ? esc(e.id) : '') + '" data-status="' + status + '" data-due="' + dueMode + '" novalidate>' +
      '<h2>' + (e ? 'Edit entry' : 'Add to the log') + '</h2>' +
      '<label class="f" for="e-text">What does the next person need to know?</label>' +
      '<textarea id="e-text" name="text" rows="4" maxlength="' + E.MAX_TEXT + '" placeholder="Silence alarm went off, restarted the playout computer, fine since">' + esc(e ? e.text : '') + '</textarea>' +
      (e ? '' : '<p class="hint">Shortcuts: <code>@Nadia</code> owner, <code>!</code> high, <code>by 7am</code> or <code>in 30m</code> due, <code>waiting on Gus</code>.</p>') +
      '<fieldset class="chips"><legend>Put it in</legend>' +
      chip('status', 'open', 'Open', status) + chip('status', 'waiting', 'Waiting', status) + chip('status', 'done', e ? 'Done' : 'Happened (done)', status) +
      '</fieldset>' +
      '<div class="when-waiting"><label class="f" for="e-wait">Waiting on who or what?</label>' +
      '<input id="e-wait" name="waitingOn" list="e-people" maxlength="60" placeholder="A person, a supplier, a part" value="' + esc(e ? e.waitingOn : '') + '"></div>' +
      '<label class="f" for="e-owner">Owner <span class="muted">(optional)</span></label>' +
      '<input id="e-owner" name="owner" list="e-people" maxlength="60" placeholder="Who should handle it?" value="' + esc(e ? e.owner : '') + '">' +
      '<fieldset class="chips"><legend>Priority</legend>' +
      chip('priority', 'high', 'High', pri) + chip('priority', 'normal', 'Normal', pri) + chip('priority', 'low', 'Low', pri) +
      '</fieldset>' +
      '<fieldset class="chips"><legend>Due</legend>' +
      chip('dueQuick', 'none', 'No time', dueMode) + chip('dueQuick', '30', 'In 30 min', dueMode) + chip('dueQuick', '60', 'In 1 h', dueMode) +
      chip('dueQuick', '120', 'In 2 h', dueMode) + chip('dueQuick', 'pick', 'Pick a time', dueMode) +
      '<input type="datetime-local" name="dueAt" class="when-pick" aria-label="Due date and time" value="' + esc(E.toLocalInput(e && e.due)) + '">' +
      '</fieldset>' +
      '<div class="attach"><span class="f">Attach</span>' + proButton('media', 'Photo') + proButton('media', 'Voice note') + '</div>' +
      '<p class="pro-inline" role="status"></p>' +
      '<p class="form-error" role="alert"></p>' +
      '<div class="actions"><button class="btn" type="submit">Save</button>' +
      '<button class="btn ghost" type="button" data-act="close">Cancel</button>' +
      (e ? '<button class="btn ghost danger-text" type="button" data-act="delete" data-id="' + esc(e.id) + '">Delete</button>' : '') +
      '</div>' + (e ? historyBlock(e, st) : '') +
      '</form>' + datalist('e-people', E.people(state));
  }

  function waitingForm(state, ctx) {
    const e = E.getEntry(state, ctx.id);
    return '<form data-form="waiting" data-id="' + esc(e.id) + '" novalidate>' +
      '<h2>Waiting on who or what?</h2>' +
      '<p class="muted">' + esc(clip(e.text, 140)) + '</p>' +
      '<label class="f" for="w-on">Waiting on</label>' +
      '<input id="w-on" name="waitingOn" list="w-people" maxlength="60" placeholder="Gus, the supplier, a part" value="' + esc(e.waitingOn) + '">' +
      '<p class="form-error" role="alert"></p>' +
      '<div class="actions"><button class="btn" type="submit">Move to Waiting</button><button class="btn ghost" type="button" data-act="close">Cancel</button></div>' +
      '</form>' + datalist('w-people', E.people(state));
  }

  function handoverSheet(state) {
    const s = state.shift;
    return '<h2>Hand over to the next person</h2>' +
      '<p class="muted">' + (s
        ? 'This closes ' + esc(s.by) + '’s ' + esc(s.name) + ' shift and keeps a record of it under Recent handovers. '
        : '') + 'The next person starts their shift here, then taps “I’ve got it” on what they were handed.</p>' +
      startForm(state, 'ho', true);
  }

  /** The Pro message shown inside a form, so a draft is not lost. */
  function proInline(id) {
    const info = P.explain(id);
    return LOCK + ' ' + esc(info.message) + ' <a href="' + esc(info.url) + '" target="_blank" rel="noopener noreferrer">Read PRO.md</a>';
  }

  function proSheet(ctx) {
    const info = P.explain(ctx.feature);
    return '<div class="pro-sheet"><h2>' + LOCK + ' ' + esc(info.name) + '</h2>' +
      '<p>' + esc(info.line) + '</p>' +
      '<p class="pro-msg">' + esc(info.message) + '</p>' +
      '<div class="actions"><a class="btn" href="' + esc(info.url) + '" target="_blank" rel="noopener noreferrer">Read PRO.md</a>' +
      '<button class="btn ghost" type="button" data-act="close">Close</button></div></div>';
  }

  function eraseSheet() {
    return '<h2>Erase everything on this device?</h2>' +
      '<p>This removes every entry and shift from this browser. Make a backup first if you might want any of it back.</p>' +
      '<div class="actions"><button class="btn danger" type="button" data-act="eraseYes">Erase everything</button>' +
      '<button class="btn ghost" type="button" data-act="backup">Back up first</button>' +
      '<button class="btn ghost" type="button" data-act="close">Cancel</button></div>';
  }

  function copySheet(ctx) {
    return '<h2>Copy the summary</h2>' +
      '<p class="muted">This browser would not copy it for us. Select the text below and copy it.</p>' +
      '<textarea class="copybox" readonly rows="14" aria-label="Summary text">' + esc(ctx.text) + '</textarea>' +
      '<div class="actions"><button class="btn" type="button" data-act="close">Done</button></div>';
  }

  function messageSheet(ctx) {
    return '<h2>' + esc(ctx.title) + '</h2><p>' + esc(ctx.text) + '</p>' +
      '<div class="actions"><button class="btn" type="button" data-act="close">OK</button></div>';
  }

  function sheet(kind, state, ctx) {
    ctx = ctx || {};
    switch (kind) {
      case 'entry': return entryForm(state, ctx);
      case 'waiting': return waitingForm(state, ctx);
      case 'handover': return handoverSheet(state);
      case 'pro': return proSheet(ctx);
      case 'erase': return eraseSheet();
      case 'copy': return copySheet(ctx);
      case 'message': return messageSheet(ctx);
      default: throw new Error('Unknown sheet: ' + kind);
    }
  }

  return {
    esc: esc,
    clip: clip,
    proButton: proButton,
    proInline: proInline,
    header: header,
    board: board,
    entryCard: entryCard,
    summary: summary,
    more: more,
    sheet: sheet
  };
}));
