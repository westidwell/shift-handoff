/*
 * Shift Handoff engine.
 *
 * Plain functions over a plain object. No DOM, no network, no clock of its own:
 * every function that needs the time takes `now`. Functions that change the
 * log return a new state and leave the old one alone, which is what makes
 * "Undo" a one-liner in the page.
 *
 * The page and the Node tests load this same file.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShiftEngine = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const APP_ID = 'shift-handoff';
  const FORMAT = 1;
  const STATUSES = ['open', 'waiting', 'done'];
  const PRIORITIES = ['high', 'normal', 'low'];
  const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };
  const CLOCKS = ['12h', '24h'];
  const MAX_TEXT = 2000;
  const MAX_NAME = 60;
  const MAX_HISTORY = 50;
  const MAX_SHIFTS = 200;
  const MINUTE = 60000;
  const DAY_MS = 86400000;
  const DEFAULT_SETTINGS = Object.freeze({ place: 'Shift handoff', clock: '12h', soonMinutes: 60 });
  const SHIFT_NAMES = ['Morning', 'Day', 'Evening', 'Overnight'];

  // ---------------------------------------------------------------- helpers

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function str(v, max) {
    if (v === null || v === undefined) return '';
    let s = String(v).replace(/\r\n?/g, '\n').trim();
    if (max && s.length > max) s = s.slice(0, max).trim();
    return s;
  }

  function cleanName(v) { return str(v, MAX_NAME).replace(/\s+/g, ' '); }

  function toDate(v) {
    if (v === null || v === undefined || v === '') return null;
    const d = v instanceof Date ? new Date(v.getTime()) : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function isoOrNull(v) {
    const d = toDate(v);
    return d ? d.toISOString() : null;
  }

  function ms(v) {
    const d = toDate(v);
    return d ? d.getTime() : NaN;
  }

  function nowDate(now) {
    const d = toDate(now === undefined ? new Date() : now);
    if (!d) throw new Error('That is not a valid time.');
    return d;
  }

  /** `now` plus a number of minutes, rounded down to the whole minute. */
  function addMinutes(now, minutes) {
    const d = new Date(nowDate(now).getTime() + minutes * MINUTE);
    d.setSeconds(0, 0);
    return d;
  }

  let idCounter = 0;
  function uid(now) {
    let rand = '';
    const c = typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function' ? crypto : null;
    if (c) {
      const a = new Uint32Array(2);
      c.getRandomValues(a);
      rand = a[0].toString(36) + a[1].toString(36);
    } else {
      rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    idCounter = (idCounter + 1) % 1296;
    return nowDate(now).getTime().toString(36) + '-' + idCounter.toString(36) + rand.slice(0, 8);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ---------------------------------------------------------- normalising

  function normalizeSettings(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const place = str(s.place, 80) || DEFAULT_SETTINGS.place;
    const clock = CLOCKS.indexOf(s.clock) >= 0 ? s.clock : DEFAULT_SETTINGS.clock;
    let soon = Math.round(Number(s.soonMinutes));
    if (!isFinite(soon) || soon < 5 || soon > 720) soon = DEFAULT_SETTINGS.soonMinutes;
    return { place: place, clock: clock, soonMinutes: soon };
  }

  function normalizeAck(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const by = cleanName(raw.by);
    const at = isoOrNull(raw.at);
    if (!by || !at) return null;
    const shiftId = str(raw.shiftId, 80);
    return { by: by, at: at, shiftId: shiftId || null };
  }

  function normalizeHistory(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    raw.forEach(function (h) {
      if (!h || typeof h !== 'object') return;
      const at = isoOrNull(h.at);
      const did = str(h.did, 30);
      if (!at || !did) return;
      out.push({ at: at, by: cleanName(h.by), did: did, note: str(h.note, 200) });
    });
    return out.slice(-MAX_HISTORY);
  }

  /** Clean up one entry. Returns null when there is nothing worth keeping. */
  function normalizeEntry(raw, now) {
    if (!raw || typeof raw !== 'object') return null;
    const text = str(raw.text, MAX_TEXT);
    if (!text) return null;
    const status = STATUSES.indexOf(raw.status) >= 0 ? raw.status : 'open';
    const priority = PRIORITIES.indexOf(raw.priority) >= 0 ? raw.priority : 'normal';
    const createdAt = isoOrNull(raw.createdAt) || isoOrNull(raw.updatedAt) || isoOrNull(raw.doneAt) || nowDate(now).toISOString();
    const updatedAt = isoOrNull(raw.updatedAt) || createdAt;
    return {
      id: str(raw.id, 80) || uid(now),
      text: text,
      status: status,
      priority: priority,
      owner: cleanName(raw.owner),
      waitingOn: status === 'waiting' ? cleanName(raw.waitingOn) : '',
      due: isoOrNull(raw.due),
      createdAt: createdAt,
      createdBy: cleanName(raw.createdBy),
      updatedAt: updatedAt,
      ack: normalizeAck(raw.ack),
      doneAt: status === 'done' ? (isoOrNull(raw.doneAt) || updatedAt) : null,
      doneBy: status === 'done' ? cleanName(raw.doneBy) : '',
      history: normalizeHistory(raw.history)
    };
  }

  function normalizeShift(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const by = cleanName(raw.by);
    const startedAt = isoOrNull(raw.startedAt);
    if (!by || !startedAt) return null;
    return {
      id: str(raw.id, 80) || 'shift-' + ms(startedAt).toString(36),
      name: str(raw.name, 40) || 'Shift',
      by: by,
      startedAt: startedAt
    };
  }

  function count(v) {
    const n = Math.round(Number(v));
    return isFinite(n) && n > 0 ? n : 0;
  }

  function normalizeShiftRecord(raw) {
    const s = normalizeShift(raw);
    if (!s) return null;
    const c = raw.counts && typeof raw.counts === 'object' ? raw.counts : {};
    s.endedAt = isoOrNull(raw.endedAt) || s.startedAt;
    s.handedTo = cleanName(raw.handedTo);
    s.counts = { open: count(c.open), waiting: count(c.waiting), done: count(c.done), notAcked: count(c.notAcked) };
    return s;
  }

  /**
   * Turn anything (a fresh object, something read from storage, a restored
   * backup) into a well-formed state. Safe to call twice.
   */
  function normalizeState(raw, now) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const seen = Object.create(null);
    const entries = [];
    (Array.isArray(s.entries) ? s.entries : []).forEach(function (r) {
      const e = normalizeEntry(r, now);
      if (!e || seen[e.id]) return;
      seen[e.id] = true;
      entries.push(e);
    });
    const shifts = (Array.isArray(s.shifts) ? s.shifts : [])
      .map(normalizeShiftRecord)
      .filter(Boolean)
      .slice(0, MAX_SHIFTS);
    return {
      format: FORMAT,
      settings: normalizeSettings(s.settings),
      shift: normalizeShift(s.shift),
      shifts: shifts,
      entries: entries
    };
  }

  function emptyState(settings) {
    return normalizeState({ settings: settings || {} });
  }

  function updateSettings(state, patch) {
    const next = clone(state);
    next.settings = normalizeSettings(Object.assign({}, state.settings, patch || {}));
    return next;
  }

  // ------------------------------------------------------------ lookups

  function indexOfEntry(state, id) {
    for (let i = 0; i < state.entries.length; i++) if (state.entries[i].id === id) return i;
    return -1;
  }

  function getEntry(state, id) {
    const i = indexOfEntry(state, id);
    if (i < 0) throw new Error('That entry is gone. It may have been deleted.');
    return state.entries[i];
  }

  function actor(state, by) {
    const b = cleanName(by);
    if (b) return b;
    return state.shift ? state.shift.by : '';
  }

  function log(e, at, by, did, note) {
    e.history.push({ at: at, by: by, did: did, note: note || '' });
    if (e.history.length > MAX_HISTORY) e.history.splice(0, e.history.length - MAX_HISTORY);
  }

  /** True when the current shift has said "I've got it" to this entry. */
  function isAcked(e, state) {
    return !!(state.shift && e.ack && e.ack.shiftId === state.shift.id);
  }

  /** True when the entry was already in the log before the current shift began. */
  function carriedIn(e, state) {
    return !!state.shift && ms(e.createdAt) < ms(state.shift.startedAt);
  }

  /** Open or waiting, handed over from an earlier shift, and not yet acknowledged. */
  function needsAck(e, state) {
    return (e.status === 'open' || e.status === 'waiting') && carriedIn(e, state) && !isAcked(e, state);
  }

  /** How the handover is going for the current shift. */
  function handoverStatus(state) {
    if (!state.shift) return { handed: 0, acked: 0, left: 0, from: '' };
    const handed = state.entries.filter(function (e) {
      return (e.status === 'open' || e.status === 'waiting') && carriedIn(e, state);
    });
    const acked = handed.filter(function (e) { return isAcked(e, state); }).length;
    const last = state.shifts[0];
    const from = last && last.handedTo && last.handedTo.toLowerCase() === state.shift.by.toLowerCase() ? last.by : '';
    return { handed: handed.length, acked: acked, left: handed.length - acked, from: from };
  }

  // Touching an item you were handed counts as picking it up.
  function implicitAck(state, e, at, by) {
    if (by && needsAck(e, state)) {
      e.ack = { by: by, at: at, shiftId: state.shift.id };
      if (!e.owner) e.owner = by;
    }
  }

  // ------------------------------------------------------------ changes

  function addEntry(state, input, now, opts) {
    opts = opts || {};
    input = input || {};
    const t = nowDate(now);
    const at = t.toISOString();
    const text = str(input.text, MAX_TEXT);
    if (!text) throw new Error('Write what the next person needs to know.');
    const status = input.status || 'open';
    if (STATUSES.indexOf(status) < 0) throw new Error('Unknown status: ' + status);
    const priority = input.priority || 'normal';
    if (PRIORITIES.indexOf(priority) < 0) throw new Error('Unknown priority: ' + priority);
    const waitingOn = status === 'waiting' ? cleanName(input.waitingOn) : '';
    if (status === 'waiting' && !waitingOn) throw new Error('Say who or what it is waiting on.');
    const by = actor(state, input.by);
    const next = clone(state);
    const e = {
      id: opts.id || uid(t),
      text: text,
      status: status,
      priority: priority,
      owner: cleanName(input.owner),
      waitingOn: waitingOn,
      due: isoOrNull(input.due),
      createdAt: at,
      createdBy: by,
      updatedAt: at,
      ack: null,
      doneAt: status === 'done' ? at : null,
      doneBy: status === 'done' ? by : '',
      history: []
    };
    if (indexOfEntry(next, e.id) >= 0) throw new Error('An entry with that id already exists.');
    log(e, at, by, status === 'done' ? 'logged' : 'added', status === 'waiting' ? 'waiting on ' + waitingOn : '');
    next.entries.push(e);
    return next;
  }

  /** Change text, owner, priority, due time or who it is waiting on. */
  function updateEntry(state, id, patch, now, by) {
    patch = patch || {};
    const t = nowDate(now);
    const at = t.toISOString();
    const next = clone(state);
    const e = getEntry(next, id);
    const who = actor(next, by);
    const changed = [];
    if ('text' in patch) {
      const text = str(patch.text, MAX_TEXT);
      if (!text) throw new Error('Write what the next person needs to know.');
      if (text !== e.text) { e.text = text; changed.push('text'); }
    }
    if ('priority' in patch) {
      if (PRIORITIES.indexOf(patch.priority) < 0) throw new Error('Unknown priority: ' + patch.priority);
      if (patch.priority !== e.priority) { e.priority = patch.priority; changed.push('priority'); }
    }
    if ('owner' in patch) {
      const owner = cleanName(patch.owner);
      if (owner !== e.owner) { e.owner = owner; changed.push('owner'); }
    }
    if ('due' in patch) {
      const due = isoOrNull(patch.due);
      if (due !== e.due) { e.due = due; changed.push('due time'); }
    }
    if ('waitingOn' in patch && e.status === 'waiting') {
      const w = cleanName(patch.waitingOn);
      if (!w) throw new Error('Say who or what it is waiting on.');
      if (w !== e.waitingOn) { e.waitingOn = w; changed.push('waiting on'); }
    }
    if (!changed.length) return next;
    e.updatedAt = at;
    log(e, at, who, 'edited', changed.join(', '));
    implicitAck(next, e, at, who);
    return next;
  }

  /** Move an entry to Open, Waiting or Done. Waiting needs to know on whom. */
  function moveEntry(state, id, to, now, opts) {
    opts = opts || {};
    if (STATUSES.indexOf(to) < 0) throw new Error('Unknown status: ' + to);
    const t = nowDate(now);
    const at = t.toISOString();
    const next = clone(state);
    const e = getEntry(next, id);
    const by = actor(next, opts.by);
    const from = e.status;
    let waitingOn = '';
    if (to === 'waiting') {
      waitingOn = cleanName(opts.waitingOn) || e.waitingOn;
      if (!waitingOn) throw new Error('Say who or what it is waiting on.');
    }
    if (from === to && waitingOn === e.waitingOn) return next;
    implicitAck(next, e, at, by);
    e.status = to;
    e.waitingOn = waitingOn;
    if (to === 'done') {
      e.doneAt = at;
      e.doneBy = by;
    } else {
      e.doneAt = null;
      e.doneBy = '';
    }
    e.updatedAt = at;
    log(e, at, by, 'moved', from + ' to ' + to + (waitingOn ? ' (' + waitingOn + ')' : ''));
    return next;
  }

  /** The incoming person's one-tap "I've got it". */
  function acknowledge(state, id, now, by) {
    const t = nowDate(now);
    const at = t.toISOString();
    if (!state.shift) throw new Error('Start a shift first, so it is clear who has it.');
    const next = clone(state);
    const e = getEntry(next, id);
    if (e.status === 'done') throw new Error('That one is already done.');
    if (isAcked(e, next)) return next;
    const who = actor(next, by);
    e.ack = { by: who, at: at, shiftId: next.shift.id };
    if (!e.owner) e.owner = who;
    log(e, at, who, 'acknowledged', '');
    return next;
  }

  /** "I've got it" for everything handed over that is still waiting for one. */
  function acknowledgeAll(state, now, by) {
    if (!state.shift) throw new Error('Start a shift first, so it is clear who has it.');
    let next = state;
    state.entries.forEach(function (e) {
      if (needsAck(e, state)) next = acknowledge(next, e.id, now, by);
    });
    return next === state ? clone(state) : next;
  }

  function removeEntry(state, id) {
    const next = clone(state);
    const i = indexOfEntry(next, id);
    if (i < 0) throw new Error('That entry is gone. It may have been deleted.');
    next.entries.splice(i, 1);
    return next;
  }

  // ------------------------------------------------------------- shifts

  /** Close the current shift and keep a short record of how it ended. */
  function endShift(state, now, opts) {
    opts = opts || {};
    if (!state.shift) return clone(state);
    const t = nowDate(now);
    const m = summaryModel(state, t);
    const next = clone(state);
    next.shifts.unshift({
      id: state.shift.id,
      name: state.shift.name,
      by: state.shift.by,
      startedAt: state.shift.startedAt,
      endedAt: t.toISOString(),
      handedTo: cleanName(opts.handedTo),
      counts: {
        open: m.counts.open,
        waiting: m.counts.waiting,
        done: m.counts.doneThisShift,
        notAcked: m.counts.notAcked
      }
    });
    next.shifts = next.shifts.slice(0, MAX_SHIFTS);
    next.shift = null;
    return next;
  }

  /** Start a shift. If one is running, it is closed and handed to the new person. */
  function startShift(state, input, now, opts) {
    input = input || {};
    opts = opts || {};
    const t = nowDate(now);
    const by = cleanName(input.by);
    if (!by) throw new Error('Who is starting the shift?');
    const next = state.shift ? endShift(state, t, { handedTo: by }) : clone(state);
    next.shift = {
      id: opts.id || 'shift-' + uid(t),
      name: str(input.name, 40) || 'Shift',
      by: by,
      startedAt: t.toISOString()
    };
    return next;
  }

  // ------------------------------------------------------- time and dues

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtTime(v, clock) {
    const d = toDate(v);
    if (!d) return '';
    const h = d.getHours();
    const mm = pad(d.getMinutes());
    if (clock === '24h') return pad(h) + ':' + mm;
    return (h % 12 || 12) + ':' + mm + ' ' + (h < 12 ? 'am' : 'pm');
  }

  function startOfDay(d) {
    const x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function dayDiff(a, b) {
    return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
  }

  function fmtDay(v, now) {
    const d = toDate(v);
    if (!d) return '';
    const diff = dayDiff(d, nowDate(now));
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff === -1) return 'yesterday';
    if (diff > 1 && diff < 7) return DAYS[d.getDay()];
    return MONTHS[d.getMonth()] + ' ' + d.getDate();
  }

  /** "today 2:30 pm", "tomorrow 7:00 am", "Fri 9:00 am", "Dec 3 9:00 am". */
  function fmtWhen(v, now, clock) {
    const d = toDate(v);
    if (!d) return '';
    return fmtDay(d, now) + ' ' + fmtTime(d, clock);
  }

  /** "Thu Nov 26, 6:05 am": a full stamp for the printed summary. */
  function fmtStamp(v, clock) {
    const d = toDate(v);
    if (!d) return '';
    return DAYS[d.getDay()] + ' ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + fmtTime(d, clock);
  }

  /** "5 min", "1 h 20 min", "2 h", "3 days". */
  function fmtSpan(minutes) {
    const m = Math.max(0, Math.round(minutes));
    if (m < 60) return m + ' min';
    if (m < 48 * 60) {
      const h = Math.floor(m / 60);
      const r = m % 60;
      return h + ' h' + (r ? ' ' + r + ' min' : '');
    }
    return Math.round(m / 1440) + ' days';
  }

  function dateStamp(now) {
    const d = nowDate(now);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** 'overdue', 'soon' (within the "due soon" window), 'later' or 'none'. */
  function dueState(e, now, soonMinutes) {
    if (!e.due || e.status === 'done') return 'none';
    const diff = ms(e.due) - nowDate(now).getTime();
    if (isNaN(diff)) return 'none';
    if (diff < 0) return 'overdue';
    const soon = soonMinutes === undefined || soonMinutes === null ? DEFAULT_SETTINGS.soonMinutes : soonMinutes;
    if (diff <= soon * MINUTE) return 'soon';
    return 'later';
  }

  function dueText(e, now, settings) {
    settings = settings || DEFAULT_SETTINGS;
    const s = dueState(e, now, settings.soonMinutes);
    if (s === 'none') return '';
    const diff = (ms(e.due) - nowDate(now).getTime()) / MINUTE;
    if (s === 'overdue') return 'overdue ' + fmtSpan(Math.max(1, -diff));
    if (s === 'soon') return diff < 1 ? 'due now' : 'due in ' + fmtSpan(diff);
    return 'due ' + fmtWhen(e.due, now, settings.clock);
  }

  /** How long an open or waiting item has been sitting: "open 9 h". */
  function ageText(e, now) {
    if (e.status === 'done') return '';
    const mins = (nowDate(now).getTime() - ms(e.createdAt)) / MINUTE;
    if (!(mins >= 1)) return '';
    return e.status + ' ' + fmtSpan(mins);
  }

  /** Parse "9am", "9:30 pm", "14:30", "noon", "midnight". Bare "9" is too vague and returns null. */
  function parseClock(s) {
    const t = String(s === null || s === undefined ? '' : s).trim().toLowerCase().replace(/\./g, '');
    if (t === 'noon') return { h: 12, m: 0 };
    if (t === 'midnight') return { h: 0, m: 0 };
    const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(t);
    if (!m) return null;
    let h = Number(m[1]);
    const mi = m[2] ? Number(m[2]) : 0;
    if (mi > 59) return null;
    if (m[3]) {
      if (h < 1 || h > 12) return null;
      h = h % 12 + (m[3].charAt(0) === 'p' ? 12 : 0);
    } else {
      if (!m[2] || h > 23) return null;
    }
    return { h: h, m: mi };
  }

  /** The next time the clock reads h:m, today or tomorrow. */
  function nextAt(now, h, m) {
    const t = nowDate(now);
    const d = new Date(t.getTime());
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= t.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }

  /** "2026-11-26T14:30" (what a datetime-local input holds) <-> ISO. */
  function toLocalInput(v) {
    const d = toDate(v);
    if (!d) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fromLocalInput(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // ----------------------------------------------------- quick shorthand

  /**
   * Read the shortcuts people type on a phone:
   *   @Name            owner
   *   !  or  !high     high priority (also !low, !normal)
   *   by 7am / by 14:30 / by noon      due at the next such time
   *   in 30m / in 2h                   due that long from now
   *   waiting on Gus / waiting for the landlord   files it under Waiting
   * The shortcut words are taken out of the text.
   */
  function quickParse(raw, now) {
    const t0 = nowDate(now);
    const out = { text: '', owner: '', priority: null, status: null, waitingOn: '', due: null };
    const original = str(raw, MAX_TEXT);
    if (!original) return out;
    let s = original;

    s = s.replace(/(^|[ \t])(?:waiting|wait)[ \t]+(?:on|for)[ \t]+@?((?:(?:the|a|an)[ \t]+)?[A-Za-z0-9][\w'&-]*)/i, function (all, pre, who) {
      out.status = 'waiting';
      out.waitingOn = cleanName(who.replace(/_/g, ' '));
      return pre;
    });

    s = s.replace(/(^|[ \t])@([A-Za-z][\w'-]*)/, function (all, pre, who) {
      out.owner = cleanName(who.replace(/_/g, ' '));
      return pre;
    });

    s = s.replace(/(^|[ \t])!(high|urgent|low|normal)\b/i, function (all, pre, p) {
      p = p.toLowerCase();
      out.priority = p === 'urgent' ? 'high' : p;
      return pre;
    });
    if (!out.priority) {
      s = s.replace(/(^|[ \t])!{1,3}(?=[ \t]|$)/, function (all, pre) {
        out.priority = 'high';
        return pre;
      });
    }

    s = s.replace(/(^|[ \t])by[ \t]+(noon|midnight|\d{1,2}(?::\d{2})?[ \t]*(?:a\.m\.|p\.m\.|am|pm|a|p)?)(?=$|[\s.,;!?)])/i, function (all, pre, when) {
      if (out.due) return all;
      const c = parseClock(when);
      if (!c) return all;
      out.due = nextAt(t0, c.h, c.m).toISOString();
      return pre;
    });
    if (!out.due) {
      s = s.replace(/(^|[ \t])in[ \t]+(\d{1,3})[ \t]*(minutes|minute|mins|min|m|hours|hour|hrs|hr|h)(?=$|[\s.,;!?)])/i, function (all, pre, n, unit) {
        const mins = /^h/i.test(unit) ? Number(n) * 60 : Number(n);
        if (!mins) return all;
        out.due = addMinutes(t0, mins).toISOString();
        return pre;
      });
    }

    s = s.replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+([.,;:!?])/g, '$1')
      .replace(/[,;:]+(?=[.!?,;:])/g, '')
      .replace(/^[ \t,;:.–—-]+/, '')
      .replace(/[ \t,;:–—-]+$/, '')
      .trim();
    out.text = s || original;
    return out;
  }

  /**
   * Combine the add form with the shorthand found in the text. Anything the
   * person picked on the form wins; the shorthand fills the gaps.
   */
  function mergeQuick(form, parsed) {
    form = form || {};
    parsed = parsed || {};
    const formStatus = form.status || 'open';
    const formPriority = form.priority || 'normal';
    return {
      text: parsed.text || str(form.text, MAX_TEXT),
      status: formStatus !== 'open' ? formStatus : (parsed.status || 'open'),
      priority: formPriority !== 'normal' ? formPriority : (parsed.priority || 'normal'),
      owner: cleanName(form.owner) || parsed.owner || '',
      waitingOn: cleanName(form.waitingOn) || parsed.waitingOn || '',
      due: isoOrNull(form.due) || parsed.due || null
    };
  }

  // -------------------------------------------------------------- sorting

  /** Overdue first, then priority, then due time, then oldest first. */
  function byUrgency(now) {
    const t = nowDate(now).getTime();
    return function (a, b) {
      const ad = ms(a.due);
      const bd = ms(b.due);
      const ao = !isNaN(ad) && ad < t ? 0 : 1;
      const bo = !isNaN(bd) && bd < t ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const ap = PRIORITY_RANK[a.priority];
      const bp = PRIORITY_RANK[b.priority];
      if (ap !== bp) return ap - bp;
      const ax = isNaN(ad) ? Infinity : ad;
      const bx = isNaN(bd) ? Infinity : bd;
      if (ax !== bx) return ax < bx ? -1 : 1;
      const ac = ms(a.createdAt);
      const bc = ms(b.createdAt);
      if (ac !== bc) return ac < bc ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    };
  }

  /** Most recently finished first. */
  function byDoneDesc(a, b) {
    const ad = ms(a.doneAt);
    const bd = ms(b.doneAt);
    if (ad !== bd) return ad > bd ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  function listStatus(state, status, now) {
    const items = state.entries.filter(function (e) { return e.status === status; });
    items.sort(status === 'done' ? byDoneDesc : byUrgency(now));
    return items;
  }

  /**
   * What the next person must do first: open items that are overdue, due
   * soon or high priority, plus waiting items that are overdue (time to chase).
   */
  function doFirst(state, now, limit) {
    const soon = state.settings.soonMinutes;
    const picks = state.entries.filter(function (e) {
      const d = dueState(e, now, soon);
      if (e.status === 'open') return d === 'overdue' || d === 'soon' || e.priority === 'high';
      if (e.status === 'waiting') return d === 'overdue';
      return false;
    });
    picks.sort(byUrgency(now));
    return limit ? picks.slice(0, limit) : picks;
  }

  /** Waiting items grouped by who or what they wait on, groups A to Z. */
  function waitingGroups(state, now, items) {
    const list = items || listStatus(state, 'waiting', now);
    const groups = [];
    const byKey = Object.create(null);
    list.forEach(function (e) {
      const who = e.waitingOn || 'Not set';
      const key = who.toLowerCase();
      if (!byKey[key]) {
        byKey[key] = { who: who, entries: [] };
        groups.push(byKey[key]);
      }
      byKey[key].entries.push(e);
    });
    groups.sort(function (a, b) {
      if (a.who === 'Not set') return 1;
      if (b.who === 'Not set') return -1;
      const x = a.who.toLowerCase();
      const y = b.who.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
    return groups;
  }

  function counts(state) {
    const c = { open: 0, waiting: 0, done: 0 };
    state.entries.forEach(function (e) { c[e.status] += 1; });
    return c;
  }

  /** Done during the current shift, oldest first. With no shift: the last 24 hours. */
  function doneInShift(state, now) {
    const t = nowDate(now).getTime();
    const from = state.shift ? ms(state.shift.startedAt) : t - DAY_MS;
    return state.entries
      .filter(function (e) { return e.status === 'done' && ms(e.doneAt) >= from; })
      .sort(function (a, b) { return byDoneDesc(b, a); });
  }

  function people(state) {
    const seen = Object.create(null);
    const out = [];
    function add(n) {
      n = cleanName(n);
      if (!n || seen[n.toLowerCase()]) return;
      seen[n.toLowerCase()] = true;
      out.push(n);
    }
    if (state.shift) add(state.shift.by);
    state.shifts.forEach(function (s) { add(s.by); add(s.handedTo); });
    state.entries.forEach(function (e) {
      add(e.owner); add(e.createdBy); add(e.waitingOn); add(e.doneBy);
      if (e.ack) add(e.ack.by);
    });
    return out.sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
  }

  function shiftNames(state) {
    const seen = Object.create(null);
    const out = [];
    [state.shift ? state.shift.name : ''].concat(state.shifts.map(function (s) { return s.name; }), SHIFT_NAMES)
      .forEach(function (n) {
        n = str(n, 40);
        if (!n || seen[n.toLowerCase()]) return;
        seen[n.toLowerCase()] = true;
        out.push(n);
      });
    return out;
  }

  // -------------------------------------------------------------- summary

  /** Everything the end-of-shift summary shows, with no item listed twice. */
  function summaryModel(state, now) {
    const t = nowDate(now);
    const first = doFirst(state, t, 0);
    const isFirst = Object.create(null);
    first.forEach(function (e) { isFirst[e.id] = true; });
    const open = listStatus(state, 'open', t);
    const waiting = listStatus(state, 'waiting', t);
    const alsoOpen = open.filter(function (e) { return !isFirst[e.id]; });
    const waitingRest = waiting.filter(function (e) { return !isFirst[e.id]; });
    const done = doneInShift(state, t);
    const notAcked = state.entries.filter(function (e) { return needsAck(e, state); }).sort(byUrgency(t));
    return {
      place: state.settings.place,
      clock: state.settings.clock,
      shift: state.shift ? clone(state.shift) : null,
      madeAt: t.toISOString(),
      doFirst: first,
      alsoOpen: alsoOpen,
      waiting: waitingGroups(state, t, waitingRest),
      done: done,
      notAcked: notAcked,
      counts: {
        open: open.length,
        waiting: waiting.length,
        doneThisShift: done.length,
        notAcked: notAcked.length
      }
    };
  }

  function oneLine(text) {
    return String(text).replace(/\s*\n+\s*/g, ' / ');
  }

  /** One entry as a line of the summary: "[HIGH] Text (owner Nadia, due in 25 min)". */
  function itemLine(e, now, settings, grouped) {
    const bits = [];
    if (e.status === 'waiting' && !grouped) bits.push('waiting on ' + (e.waitingOn || 'someone'));
    if (e.owner) bits.push('owner ' + e.owner);
    const due = dueText(e, now, settings);
    if (due) bits.push(due);
    const tag = e.priority === 'high' ? '[HIGH] ' : e.priority === 'low' ? '[low] ' : '';
    return tag + oneLine(e.text) + (bits.length ? ' (' + bits.join(', ') + ')' : '');
  }

  /** The end-of-shift summary as plain text, ready to print, paste or text. */
  function summaryText(state, now) {
    const t = nowDate(now);
    const m = summaryModel(state, t);
    const st = state.settings;
    const L = [];
    L.push('SHIFT HANDOFF: ' + m.place);
    if (m.shift) L.push(m.shift.name + ' shift, ' + m.shift.by + ', since ' + fmtStamp(m.shift.startedAt, st.clock));
    else L.push('No shift running');
    L.push('Made ' + fmtStamp(t, st.clock));
    L.push(m.counts.open + ' open, ' + m.counts.waiting + ' waiting, ' + m.counts.doneThisShift + ' done this shift');
    L.push('');

    L.push('DO FIRST');
    if (!m.doFirst.length) L.push('- Nothing urgent.');
    m.doFirst.forEach(function (e, i) {
      L.push((i + 1) + '. ' + (e.status === 'waiting' ? 'Chase: ' : '') + itemLine(e, t, st, false));
    });
    L.push('');

    L.push('ALSO OPEN (' + m.alsoOpen.length + ')');
    if (!m.alsoOpen.length) L.push('- Nothing else open.');
    m.alsoOpen.forEach(function (e) { L.push('- ' + itemLine(e, t, st, false)); });
    L.push('');

    const waitingCount = m.waiting.reduce(function (n, g) { return n + g.entries.length; }, 0);
    L.push('WAITING ON OTHERS (' + waitingCount + ')');
    if (!waitingCount) L.push('- Nothing waiting.');
    m.waiting.forEach(function (g) {
      L.push('On ' + g.who + ':');
      g.entries.forEach(function (e) { L.push('  - ' + itemLine(e, t, st, true)); });
    });
    L.push('');

    L.push('DONE THIS SHIFT (' + m.done.length + ')');
    if (!m.done.length) L.push('- Nothing logged as done yet.');
    m.done.forEach(function (e) {
      L.push('- ' + fmtTime(e.doneAt, st.clock) + '  ' + oneLine(e.text) + (e.doneBy ? ' (' + e.doneBy + ')' : ''));
    });

    if (m.notAcked.length) {
      L.push('');
      L.push('HANDED OVER, NOT ACKNOWLEDGED YET (' + m.notAcked.length + ')');
      m.notAcked.forEach(function (e) { L.push('- ' + itemLine(e, t, st, false)); });
    }
    return L.join('\n') + '\n';
  }

  // ------------------------------------------------------------------ CSV

  const CSV_COLUMNS = Object.freeze([
    'id', 'status', 'priority', 'text', 'owner', 'waiting_on', 'due',
    'created_at', 'created_by', 'acknowledged_by', 'acknowledged_at', 'done_at', 'done_by'
  ]);

  // A cell that starts with = + - @ could run as a formula in a spreadsheet.
  // A leading apostrophe stops that; the importer takes it off again.
  const RISKY = /^[=+\-@\t\r]/;
  const GUARDED = /^'(?=[=+\-@\t\r]|'[=+\-@\t\r])/;

  function csvCell(v) {
    let s = v === null || v === undefined ? '' : String(v);
    if (RISKY.test(s) || /^'[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function unguard(s) {
    return GUARDED.test(s) ? s.slice(1) : s;
  }

  function toCSV(state) {
    const rows = [CSV_COLUMNS.join(',')];
    state.entries.forEach(function (e) {
      rows.push([
        e.id, e.status, e.priority, e.text, e.owner, e.waitingOn, e.due || '',
        e.createdAt, e.createdBy, e.ack ? e.ack.by : '', e.ack ? e.ack.at : '', e.doneAt || '', e.doneBy
      ].map(csvCell).join(','));
    });
    return '﻿' + rows.join('\r\n') + '\r\n';
  }

  /** A small RFC 4180 reader: quoted cells, doubled quotes, CRLF or LF. */
  function parseCSV(text) {
    let s = String(text === null || text === undefined ? '' : text);
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    let started = false;
    let i = 0;
    while (i < s.length) {
      const c = s.charAt(i);
      if (quoted) {
        if (c === '"') {
          if (s.charAt(i + 1) === '"') { cell += '"'; i += 2; continue; }
          quoted = false;
          i += 1;
          continue;
        }
        cell += c;
        i += 1;
        continue;
      }
      if (c === '"' && !started) { quoted = true; started = true; i += 1; continue; }
      if (c === ',') { row.push(cell); cell = ''; started = false; i += 1; continue; }
      if (c === '\r' || c === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        started = false;
        i += c === '\r' && s.charAt(i + 1) === '\n' ? 2 : 1;
        continue;
      }
      cell += c;
      started = true;
      i += 1;
    }
    if (cell !== '' || started || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter(function (r) { return !(r.length === 1 && r[0] === ''); });
  }

  /** Read entries back from a CSV made by toCSV (or a hand-made one with a "text" column). */
  function entriesFromCSV(text, now) {
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('That CSV file is empty.');
    const head = rows[0].map(function (h) { return unguard(h).trim().toLowerCase().replace(/\s+/g, '_'); });
    if (head.indexOf('text') < 0) throw new Error('That CSV has no "text" column.');
    const out = [];
    rows.slice(1).forEach(function (r) {
      function get(k) {
        const i = head.indexOf(k);
        return i >= 0 && i < r.length ? unguard(r[i]) : '';
      }
      const ackBy = get('acknowledged_by');
      const ackAt = get('acknowledged_at');
      const e = normalizeEntry({
        id: get('id'),
        text: get('text'),
        status: get('status').trim().toLowerCase(),
        priority: get('priority').trim().toLowerCase(),
        owner: get('owner'),
        waitingOn: get('waiting_on'),
        due: get('due') || null,
        createdAt: get('created_at'),
        createdBy: get('created_by'),
        ack: ackBy && ackAt ? { by: ackBy, at: ackAt, shiftId: null } : null,
        doneAt: get('done_at'),
        doneBy: get('done_by')
      }, now);
      if (e) out.push(e);
    });
    return out;
  }

  /** Add entries from a CSV. Rows whose id is already in the log are skipped. */
  function importCSV(state, text, now) {
    const incoming = entriesFromCSV(text, now);
    const next = clone(state);
    let added = 0;
    let skipped = 0;
    incoming.forEach(function (e) {
      if (indexOfEntry(next, e.id) >= 0) { skipped += 1; return; }
      next.entries.push(e);
      added += 1;
    });
    return { state: next, added: added, skipped: skipped };
  }

  // --------------------------------------------------------------- backup

  function toBackup(state, now) {
    return JSON.stringify({
      app: APP_ID,
      format: FORMAT,
      exportedAt: nowDate(now).toISOString(),
      data: normalizeState(state, now)
    }, null, 2) + '\n';
  }

  function fromBackup(text, now) {
    let obj;
    try {
      obj = JSON.parse(String(text).replace(/^﻿/, ''));
    } catch (err) {
      throw new Error('That file is not a Shift Handoff backup (it is not valid JSON).');
    }
    if (!obj || typeof obj !== 'object' || obj.app !== APP_ID || !obj.data || typeof obj.data !== 'object') {
      throw new Error('That file is not a Shift Handoff backup.');
    }
    if (typeof obj.format !== 'number' || obj.format > FORMAT) {
      throw new Error('That backup was made by a newer version of this page. Update the page, then try again.');
    }
    return normalizeState(obj.data, now);
  }

  return {
    APP_ID: APP_ID,
    FORMAT: FORMAT,
    STATUSES: STATUSES,
    PRIORITIES: PRIORITIES,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    CSV_COLUMNS: CSV_COLUMNS,
    MAX_TEXT: MAX_TEXT,
    // state
    emptyState: emptyState,
    normalizeState: normalizeState,
    normalizeEntry: normalizeEntry,
    updateSettings: updateSettings,
    getEntry: getEntry,
    // changes
    addEntry: addEntry,
    updateEntry: updateEntry,
    moveEntry: moveEntry,
    acknowledge: acknowledge,
    acknowledgeAll: acknowledgeAll,
    removeEntry: removeEntry,
    startShift: startShift,
    endShift: endShift,
    // acknowledgement
    isAcked: isAcked,
    carriedIn: carriedIn,
    needsAck: needsAck,
    handoverStatus: handoverStatus,
    // time
    addMinutes: addMinutes,
    dueState: dueState,
    dueText: dueText,
    ageText: ageText,
    fmtTime: fmtTime,
    fmtDay: fmtDay,
    fmtWhen: fmtWhen,
    fmtStamp: fmtStamp,
    fmtSpan: fmtSpan,
    dateStamp: dateStamp,
    parseClock: parseClock,
    nextAt: nextAt,
    toLocalInput: toLocalInput,
    fromLocalInput: fromLocalInput,
    // shorthand
    quickParse: quickParse,
    mergeQuick: mergeQuick,
    // lists
    byUrgency: byUrgency,
    listStatus: listStatus,
    doFirst: doFirst,
    waitingGroups: waitingGroups,
    counts: counts,
    doneInShift: doneInShift,
    people: people,
    shiftNames: shiftNames,
    // summary
    summaryModel: summaryModel,
    summaryText: summaryText,
    itemLine: itemLine,
    // files
    toCSV: toCSV,
    parseCSV: parseCSV,
    entriesFromCSV: entriesFromCSV,
    importCSV: importCSV,
    toBackup: toBackup,
    fromBackup: fromBackup
  };
}));
