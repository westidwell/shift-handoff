# Contributing

Thanks for helping. Bug fixes and new free features are welcome.

Features listed in PRO.md are reserved for the Pro edition, so pull requests that add them will be closed with a pointer to PRO.md.

## Ground rules

- **No network calls.** The free page never talks to a server: no analytics, no fonts or scripts from other sites, no "phone home". The page's Content-Security-Policy blocks network calls, and a test checks for them.
- **No dependencies.** Everything runs on plain Node (18 or newer) and a browser. If you think something needs a package, open an issue first.
- **Data stays on the device.** Anything new that stores data uses the same state object, so backup, restore and CSV keep working.
- **Phone first.** Check new screens at phone width, with big enough tap targets.
- **Plain words.** Labels and messages should read the way a person on shift would say them.

## How the code is laid out

| File | What it does |
| --- | --- |
| `src/engine.js` | The log itself: add, move, acknowledge, sort, due times, summary, CSV, backup. Pure functions, no DOM. |
| `src/view.js` | Turns the state into HTML strings. Pure functions, no DOM. |
| `src/app.js` | Wires it to the browser: storage, taps, forms, downloads. |
| `src/sample.js` | The made-up sample log. |
| `src/pro.js` | Stubs for the planned Pro features. |
| `src/style.css`, `src/template.html` | Look and page shell. |
| `src/sw.js` | Service worker for offline use. |
| `build.js` | Folds `src/` into `index.html` and stamps `sw.js`. |

## Making a change

1. Edit files in `src/` (never `index.html` or `sw.js` directly; they are built).
2. Run `npm run build`.
3. Run `npm test`. It runs offline and needs no install.
4. Open `index.html` in a browser, or run `npm start` and open http://localhost:8080, and try your change on a narrow window.
5. Commit `src/` together with the rebuilt `index.html` and `sw.js`. CI fails if they are out of step.

Please add or update a test in `tests/` for anything the engine does.

## Reporting a bug

Say what you did, what you expected, what happened, and which browser and phone. If you can, attach a backup file with the private parts removed (More, Back up).
