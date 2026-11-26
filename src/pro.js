/*
 * Shift Handoff: Pro stubs.
 *
 * The features below are reserved for the Pro edition, which is not open yet.
 * Each one has a stub here so that if you go looking for it in the code, you
 * find out straight away that it is planned for Pro, and where to read about it.
 *
 * Nothing in this file talks to a server, checks a licence, or records what
 * anyone does. The stubs only throw a message.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShiftPro = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Where Pro is described. Change the link or the price here and nowhere else. */
  const PRO_URL = 'https://github.com/westidwell/shift-handoff/blob/main/PRO.md';
  const PRO_PRICE = '$1/month';

  /** The Pro list, in the order PRO.md shows it. `fn` is the stub below. */
  const PRO_FEATURES = Object.freeze([
    {
      id: 'teamLog',
      fn: 'startTeamLog',
      name: 'Team live log',
      line: 'One log shared live across every phone and screen on the team, so everyone sees the same Open, Waiting and Done.'
    },
    {
      id: 'signIn',
      fn: 'signIn',
      name: 'Sign-in per person',
      line: 'Each person signs in, so every entry, move and "I\'ve got it" carries a name you can trust.'
    },
    {
      id: 'reminders',
      fn: 'scheduleReminders',
      name: 'Stuck-item nudge',
      line: 'A nudge to the owner, then to the next shift, when an item sits open or waiting longer than you allow.'
    },
    {
      id: 'media',
      fn: 'attachMedia',
      name: 'Photo or voice note',
      line: 'Snap the broken part or leave a short voice note right on the entry.'
    },
    {
      id: 'weeklyDigest',
      fn: 'weeklyDigest',
      name: 'Weekly digest',
      line: 'A Monday recap of what got done, what keeps coming back and what sat the longest.'
    },
    {
      id: 'spreadsheetExport',
      fn: 'exportSpreadsheet',
      name: 'Spreadsheet export',
      line: 'A formatted .xlsx workbook with one tab per shift, made on demand or on a schedule.'
    },
    {
      id: 'aiSummary',
      fn: 'aiShiftSummary',
      name: 'AI shift summary',
      line: 'A short plain-English handover written from the log, ready to read out at shift change.'
    }
  ].map(Object.freeze));

  /** The one message every stub and every locked button shows. */
  function proMessage(featureName) {
    return featureName + ' is part of Pro (' + PRO_PRICE + ', not open yet): see PRO.md';
  }

  class ProFeatureError extends Error {
    constructor(feature) {
      super(proMessage(feature.name));
      this.name = 'ProFeatureError';
      this.feature = feature.id;
      this.featureName = feature.name;
      this.url = PRO_URL;
      this.price = PRO_PRICE;
    }
  }

  function feature(id) {
    const f = PRO_FEATURES.find(function (x) { return x.id === id; });
    if (!f) throw new Error('Unknown Pro feature: ' + id);
    return f;
  }

  function reserved(id) {
    return new ProFeatureError(feature(id));
  }

  /**
   * Team live log (planned for Pro).
   * One log for the whole team, kept in sync live on every phone and the
   * shared screen, so a change on one device shows up on all of them.
   * The free version keeps the log on one device (see the README).
   * @throws {ProFeatureError} always.
   */
  function startTeamLog(options) { throw reserved('teamLog'); }

  /**
   * Sign-in per person (planned for Pro).
   * Each person signs in with their own account, so every entry, move and
   * acknowledgement is tied to a real person instead of a typed name.
   * The free version asks for a name when a shift starts.
   * @throws {ProFeatureError} always.
   */
  function signIn(person) { throw reserved('signIn'); }

  /**
   * Stuck-item nudge (planned for Pro).
   * Watches how long items sit Open or Waiting and nudges the owner, then the
   * next shift, once an item passes the limit you set.
   * The free version shows each item's age on its card.
   * @throws {ProFeatureError} always.
   */
  function scheduleReminders(state, rules) { throw reserved('reminders'); }

  /**
   * Photo or voice note (planned for Pro).
   * Attaches a photo or a short voice recording to an entry, so the next
   * person can see the broken part or hear the details.
   * @throws {ProFeatureError} always.
   */
  function attachMedia(entryId, file) { throw reserved('media'); }

  /**
   * Weekly digest (planned for Pro).
   * Builds a once-a-week recap from every shift: what got done, what keeps
   * coming back, and what sat the longest.
   * The free version prints a summary for one shift at a time.
   * @throws {ProFeatureError} always.
   */
  function weeklyDigest(state, weekOf) { throw reserved('weeklyDigest'); }

  /**
   * Spreadsheet export (planned for Pro).
   * Writes a formatted .xlsx workbook with one tab per shift.
   * The free version exports a plain CSV file that any spreadsheet opens.
   * @throws {ProFeatureError} always.
   */
  function exportSpreadsheet(state) { throw reserved('spreadsheetExport'); }

  /**
   * AI shift summary (planned for Pro).
   * Writes a short plain-English handover from the log, ready to read out at
   * shift change. The free version builds a structured summary without AI.
   * @throws {ProFeatureError} always.
   */
  function aiShiftSummary(state) { throw reserved('aiSummary'); }

  /**
   * What the page shows when someone taps a locked button: it calls the stub
   * and returns the same message the stub throws, plus the link.
   */
  function explain(id) {
    const f = feature(id);
    try {
      api[f.fn]();
    } catch (err) {
      if (err instanceof ProFeatureError) {
        return { id: f.id, name: f.name, line: f.line, message: err.message, url: err.url };
      }
      throw err;
    }
    return null;
  }

  const api = {
    PRO_URL: PRO_URL,
    PRO_PRICE: PRO_PRICE,
    PRO_FEATURES: PRO_FEATURES,
    ProFeatureError: ProFeatureError,
    proMessage: proMessage,
    feature: feature,
    explain: explain,
    startTeamLog: startTeamLog,
    signIn: signIn,
    scheduleReminders: scheduleReminders,
    attachMedia: attachMedia,
    weeklyDigest: weeklyDigest,
    exportSpreadsheet: exportSpreadsheet,
    aiShiftSummary: aiShiftSummary
  };
  return api;
}));
