# bjj-belt-tracker

A mobile-first web app for tracking your own Brazilian jiu-jitsu progression: your current
belt and stripes, your promotion history, and your mat time between promotions.

Data is stored in the browser's `localStorage`. There is no backend and no account.

## Features

- Set and edit your current rank (white to black belt, 0 to 4 stripes).
- Log stripe and belt promotions, including back-dated ones. Out-of-order entries are rejected.
- See a timeline of promotions and the time spent at each belt and stripe.
- Log training sessions (date, duration, gi or no-gi), and edit or delete them.
- See sessions and hours since your last promotion, and all time.
- Install it to your phone's home screen and use it with no signal.
- Save a backup file and restore from one, to protect your history or move it to a new device.
- See your time in grade against the IBJJF minimum for your belt (2 years at blue, 18 months at
  purple, 1 year at brown) and the date you reach it.

## Backups

The Backup tab saves everything to a `.json` file (download, or the share sheet on phones).
Restoring shows what the file contains and what it will replace before anything changes, and
replaces the data on the device; it does not merge. Files that are not backups, come from a
newer version of the app, or contain an out-of-order promotion history are refused.

## Offline and updates

The production build ships a service worker that caches the whole app, so after the first
visit it opens without a connection. A new deploy downloads in the background and appears the
next time the app is opened. The service worker is not used by `npm run dev`; to try it locally,
run `npm run build` and then `npm run preview`.

## Development

Requires Node 20 or later.

```bash
npm install
npm run dev
```

| Command             | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Start the dev server on port 5173     |
| `npm test`          | Run the test suite                    |
| `npm run typecheck` | Type-check without building           |
| `npm run build`     | Type-check, test and build into `dist/` |
| `npm run preview`   | Serve the built app from `dist/`      |
| `npm run icons`     | Regenerate the app icons in `public/` |

## Layout

- `src/domain/` holds the rules (ranks, promotion ordering, timeline, mat-time totals) as plain
  functions with their tests.
- `src/state/` loads and saves the data.
- `src/components/` holds the React UI.
- `pwa/` holds the service worker and the build step that generates its file list.
- `public/` holds the web app manifest and icons.
