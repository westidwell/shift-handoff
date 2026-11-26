/*
 * Shift Handoff: sample log.
 *
 * A made-up volunteer station, "Pinecone Community Radio", partway through
 * its overnight shift. Every station, business and person here is invented.
 * Times are built around `now`, so the sample always looks current.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.ShiftSample = factory(root.ShiftEngine);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  const SAMPLE_PLACE = 'Pinecone Community Radio';

  function makeSample(now) {
    const t = now === undefined ? new Date() : new Date(new Date(now).getTime());
    const at = function (minutes) {
      const d = new Date(t.getTime() + minutes * 60000);
      d.setSeconds(0, 0);
      return d.toISOString();
    };
    const overnight = 'sample-shift-overnight';
    const overnightStart = at(-470);
    const lateStart = at(-830);
    const ack = function (minutes) { return { by: 'Theo', at: at(minutes), shiftId: overnight }; };

    const entries = [
      {
        id: 'sample-01', status: 'open', priority: 'high',
        text: 'Weekly emergency alert test ran on automation overnight. Initial the paper log by the board and write in the time it aired.',
        owner: '', due: at(25), createdAt: at(-200), createdBy: 'Theo'
      },
      {
        id: 'sample-02', status: 'open', priority: 'high',
        text: 'Sponsor spot for the Owl & Kettle Bakery has to air within the hour. It is in the carts folder as OWL-KETTLE-NOV.',
        owner: 'Nadia', due: at(55), createdAt: at(-600), createdBy: 'Marisol', ack: ack(-460)
      },
      {
        id: 'sample-03', status: 'open', priority: 'normal',
        text: 'Gardening hour guest comes in this morning. Studio B needs the second mic plugged back in and a glass of water on the desk.',
        owner: 'Priya', due: at(150), createdAt: at(-520), createdBy: 'Marisol'
      },
      {
        id: 'sample-04', status: 'open', priority: 'normal',
        text: 'Call back the listener asking where the Sunday jazz playlist went. Their number is on the yellow sticky note by the studio phone.',
        owner: '', due: at(-40), createdAt: at(-700), createdBy: 'Marisol', ack: ack(-458)
      },
      {
        id: 'sample-05', status: 'open', priority: 'low',
        text: 'Green room coffee maker is leaking. Towel under it for now, please do not use it.',
        owner: '', due: null, createdAt: at(-120), createdBy: 'Theo'
      },
      {
        id: 'sample-06', status: 'waiting', priority: 'normal', waitingOn: 'Gus',
        text: 'Studio A headphone amp, channel 3 crackles. Gus is bringing a spare on Saturday. Use channels 1 and 2 until then.',
        owner: 'Theo', due: null, createdAt: at(-900), createdBy: 'Marisol', ack: ack(-455)
      },
      {
        id: 'sample-07', status: 'waiting', priority: 'normal', waitingOn: 'Programming committee',
        text: 'Holiday schedule swap for Dec 24 needs a yes before it goes on the lobby board.',
        owner: '', due: at(60 * 30), createdAt: at(-1500), createdBy: 'Marisol'
      },
      {
        id: 'sample-08', status: 'waiting', priority: 'low', waitingOn: 'Building manager',
        text: 'Spare key for the transmitter shed. Building manager said it would be in the drop box by now.',
        owner: '', due: at(-180), createdAt: at(-3000), createdBy: 'Marisol'
      },
      {
        id: 'sample-09', status: 'done', priority: 'high',
        text: 'Silence alarm went off. Automation skipped a damaged file; restarted the playout computer and we were back on air in two minutes. File pulled from rotation.',
        createdAt: at(-235), createdBy: 'Theo', doneAt: at(-233), doneBy: 'Theo'
      },
      {
        id: 'sample-10', status: 'done', priority: 'normal',
        text: 'Recorded three new station IDs with the volunteer tagline. Saved in the IDs folder, ready for the morning.',
        createdAt: at(-300), createdBy: 'Theo', doneAt: at(-280), doneBy: 'Theo'
      },
      {
        id: 'sample-11', status: 'done', priority: 'normal',
        text: 'Locked the front door and checked the back gate after the late show crew left.',
        createdAt: at(-462), createdBy: 'Theo', doneAt: at(-455), doneBy: 'Theo'
      },
      {
        id: 'sample-12', status: 'done', priority: 'low',
        text: 'Printed the December volunteer sign-in sheet. It is on the clipboard by the door.',
        createdAt: at(-100), createdBy: 'Theo', doneAt: at(-90), doneBy: 'Theo'
      },
      {
        id: 'sample-13', status: 'done', priority: 'normal',
        text: 'Swapped the lobby speaker cable. Sound is clean again.',
        createdAt: at(-640), createdBy: 'Marisol', doneAt: at(-610), doneBy: 'Marisol'
      }
    ];

    entries.forEach(function (e) {
      e.updatedAt = e.doneAt || e.createdAt;
      e.history = [{ at: e.createdAt, by: e.createdBy, did: e.status === 'done' ? 'logged' : 'added', note: '' }];
      if (e.ack) e.history.push({ at: e.ack.at, by: e.ack.by, did: 'acknowledged', note: '' });
    });

    return E.normalizeState({
      settings: { place: SAMPLE_PLACE, clock: '12h', soonMinutes: 60 },
      shift: { id: overnight, name: 'Overnight', by: 'Theo', startedAt: overnightStart },
      shifts: [{
        id: 'sample-shift-late', name: 'Late show', by: 'Marisol',
        startedAt: lateStart, endedAt: overnightStart, handedTo: 'Theo',
        counts: { open: 4, waiting: 3, done: 2, notAcked: 0 }
      }],
      entries: entries
    }, t);
  }

  return { SAMPLE_PLACE: SAMPLE_PLACE, makeSample: makeSample };
}));
