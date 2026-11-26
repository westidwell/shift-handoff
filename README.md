# Shift Handoff

A free, one-page log for handing work from one shift to the next.

Shift Handoff shows the next person what is still open, what is waiting on whom, what happened, and what they must do first. Entries take a few seconds to add on a phone, sort themselves into Open, Waiting and Done, and the incoming person taps "I've got it" on each one so nothing gets dropped at shift change. It is a single HTML file: no account, no server, and your log never leaves the device.

## Try it

**In under a minute:** download [`index.html`](index.html), open it in any browser, and tap **Load a sample log**. That's the whole app.

**On your own computer, with offline mode and "install":**

```sh
git clone https://github.com/westidwell/shift-handoff.git
cd shift-handoff
npm start
```

Then open http://localhost:8080. Needs Node 18 or newer and nothing else (there are no packages to install).

**On a phone or the shared screen at work:** fork this repo, turn on GitHub Pages (Settings, Pages, deploy from the `main` branch), open the link on the phone, then **Add to Home Screen**. It opens full screen and keeps working with no signal. Any static web host works the same way.

## The example: a community radio station

The sample log is a made-up volunteer station, Pinecone Community Radio, near the end of its overnight shift. Theo was handed six items by the late-show volunteer and has picked up three. A silence alarm went off at 2 am, a sponsor spot has to air within the hour, a headphone amp is waiting on the volunteer engineer, and the key to the transmitter shed is overdue from the building manager. Every name in it is invented.

It works the same for a hotel front desk, a food bank, a maintenance crew, a support desk, a family looking after a relative in turns: anywhere one person hands the day to the next.

Here is the end-of-shift summary the page prints (or copies as text) for that sample:

```text
SHIFT HANDOFF: Pinecone Community Radio
Overnight shift, Theo, since Wed Nov 25, 10:20 pm
Made Thu Nov 26, 6:10 am
5 open, 3 waiting, 4 done this shift

DO FIRST
1. Call back the listener asking where the Sunday jazz playlist went. Their number is on the yellow sticky note by the studio phone. (overdue 40 min)
2. Chase: [low] Spare key for the transmitter shed. Building manager said it would be in the drop box by now. (waiting on Building manager, overdue 3 h)
3. [HIGH] Weekly emergency alert test ran on automation overnight. Initial the paper log by the board and write in the time it aired. (due in 25 min)
4. [HIGH] Sponsor spot for the Owl & Kettle Bakery has to air within the hour. It is in the carts folder as OWL-KETTLE-NOV. (owner Nadia, due in 55 min)

ALSO OPEN (2)
- Gardening hour guest comes in this morning. Studio B needs the second mic plugged back in and a glass of water on the desk. (owner Priya, due today 8:40 am)
- [low] Green room coffee maker is leaking. Towel under it for now, please do not use it.

WAITING ON OTHERS (2)
On Gus:
  - Studio A headphone amp, channel 3 crackles. Gus is bringing a spare on Saturday. Use channels 1 and 2 until then. (owner Theo)
On Programming committee:
  - Holiday schedule swap for Dec 24 needs a yes before it goes on the lobby board. (due tomorrow 12:10 pm)

DONE THIS SHIFT (4)
- 10:35 pm  Locked the front door and checked the back gate after the late show crew left. (Theo)
- 1:30 am  Recorded three new station IDs with the volunteer tagline. Saved in the IDs folder, ready for the morning. (Theo)
- 2:17 am  Silence alarm went off. Automation skipped a damaged file; restarted the playout computer and we were back on air in two minutes. File pulled from rotation. (Theo)
- 4:40 am  Printed the December volunteer sign-in sheet. It is on the clipboard by the door. (Theo)

HANDED OVER, NOT ACKNOWLEDGED YET (3)
- [low] Spare key for the transmitter shed. Building manager said it would be in the drop box by now. (waiting on Building manager, overdue 3 h)
- Gardening hour guest comes in this morning. Studio B needs the second mic plugged back in and a glass of water on the desk. (owner Priya, due today 8:40 am)
- Holiday schedule swap for Dec 24 needs a yes before it goes on the lobby board. (waiting on Programming committee, due tomorrow 12:10 pm)
```

## What you can do

- **Add in seconds.** Type a line and save. Shortcuts in the text do the rest: `@Nadia` sets the owner, `!` marks it high priority, `by 7am` or `in 30m` sets a due time, `waiting on Gus` files it under Waiting.
- **Open, Waiting, Done.** One tap moves an item. Waiting items say who or what they are waiting on. Done is the record of what happened, including things you log as they happen.
- **Owner, due time and priority** on every item. Overdue and due-soon items are colored and float to the top.
- **Do first.** A short list at the top: anything overdue, due soon or marked high, plus waiting items that are overdue and need chasing.
- **"I've got it".** When a new shift starts, everything handed over shows a big button. One tap per item (or "Got it, all") records who took it and when. Moving or editing an item counts too.
- **End-of-shift summary.** Print it, copy it as text, or share it from your phone. Past handovers are kept with their counts.
- **Your data, your files.** Back up and restore as JSON, export and import CSV (safe to open in a spreadsheet). Undo after a move, edit, delete or restore.
- **Works offline and installs** to the home screen. Dark, phone-first, keyboard friendly (Ctrl+Enter saves).

## How it works

- `src/engine.js` is the log: plain functions that take the state and return a new one (add, move, acknowledge, sort, due times, summary, CSV, backup). It has no DOM, so the same file runs in the page and in the Node tests.
- `src/view.js` turns the state into HTML, escaping everything a person typed. `src/app.js` wires it to the browser and saves to `localStorage`.
- `build.js` folds `src/` into one `index.html` and writes a Content-Security-Policy that allows only those exact scripts and **blocks all network calls** (`connect-src 'none'`). That is how you can tell nothing is sent anywhere.
- `sw.js` caches the app's own files so it opens offline. `manifest.webmanifest` makes it installable.
- Sorting: overdue first, then priority, then due time, then oldest first. "Due soon" means within an hour (you can change it to 30 minutes or 2 hours).
- The free version keeps the log on one device or one browser. That suits a shared front-desk tablet or studio computer. To move a log, back it up and restore it on the other device.

Run the tests (offline, no install):

```sh
npm test
```

After changing anything in `src/`, rebuild with `npm run build`. CI checks that `index.html` was rebuilt.

## Free vs Pro

Pro is planned and **not open yet**. It is shown in the page as locked buttons so you know what is coming. See [PRO.md](PRO.md).

| | Free (this repo) | Pro (planned, $1/month, not open yet) |
| --- | --- | --- |
| Open / Waiting / Done log with owner, due time, priority | Yes | Yes |
| Do-first list, overdue and due-soon highlighting | Yes | Yes |
| One-tap "I've got it" at shift change | Yes | Yes |
| Printable end-of-shift summary, copy or share as text | Yes | Yes |
| Offline, installable, JSON backup and restore, CSV export and import | Yes | Yes |
| Team live log | One device or browser | Team live log on every phone at once |
| Sign-in per person | Type your name at shift start | Sign-in per person |
| Stuck-item nudge | Each item shows how long it has been sitting | Stuck-item nudge to the owner and the next shift |
| Photo or voice note | Not included | Photo or voice note on an entry |
| Weekly digest | One shift at a time | Weekly digest |
| Spreadsheet export | CSV | Spreadsheet export (.xlsx, a tab per shift) |
| AI shift summary | Structured summary, no AI | AI shift summary |

## Privacy

There is no account, no analytics and no tracking. The page makes no network requests, and its security policy would block them if it tried. Your log is stored in this browser's local storage on this device only. Clearing your browser data deletes it, so use **More, Back up** now and then.

## Contributing

Bug fixes and new free features are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Features listed in PRO.md are reserved for the Pro edition.

## License

MIT. See [LICENSE](LICENSE).
