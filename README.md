# bjj-belt-tracker

A mobile-first web app for tracking your own Brazilian jiu-jitsu progression: your current
belt and stripes, your promotion history, and your mat time between promotions.

Data is stored in the browser's `localStorage`. There is no backend and no account.

## Features

- Set and edit your current rank (white to black belt, 0 to 4 stripes).
- Log stripe and belt promotions, including back-dated ones. Out-of-order entries are rejected.
- See a timeline of promotions and the time spent at each belt and stripe.
- Log training sessions (date, duration, gi or no-gi, optional notes), and edit or delete them.
- Filter your sessions by gi or no-gi and search their notes and the techniques worked on. Long
  lists show the most recent 30 sessions, with more on request.
- See sessions and hours this week, since your last promotion, and all time.
- Install it to your phone's home screen and use it with no signal.
- Save a backup file and restore from one, to protect your history or move it to a new device.
- See your time in grade against the IBJJF minimum for your belt (2 years at blue, 18 months at
  purple, 1 year at brown) and the date you reach it.
- See training trends: sessions per week for the last 8 weeks, your weekly average and your
  streak of weeks with at least one session.
- Set a weekly goal of 1 to 7 sessions and see this week's progress and how often you reach it.
- Log competitions and their matches (win, loss or draw, and how each was decided), and see your
  overall record, how you win and lose, and your medals.
- Add a competition you have entered with a future date and see a countdown to it. Matches and a
  medal can be added from the day.
- Get a reminder on the Overview tab when your history has not been backed up for 30 days, or
  has never been backed up once it holds 10 records. It can be put off for 30 days.
- Keep a technique journal: your own list of techniques, each with a position and how far along
  you are (learning, drilling, or landing it in rolling). Tick the techniques you worked on when
  you log a session, and see how often and how recently you have trained each one.
- See what you are working on from the Overview tab, including techniques that have gone stale:
  still being learned or drilled, and not trained for 30 days.

## Backups

The Backup tab saves everything to a `.json` file (download, or the share sheet on phones).
Restoring shows what the file contains and what it will replace before anything changes, and
replaces the data on the device; it does not merge. Files that are not backups, come from a
newer version of the app, or contain an out-of-order promotion history are refused.

Backups are saved as format version 3. Version 2 added session notes, the weekly goal and
competitions; version 3 added techniques. Older files still restore.

## Techniques

The list is yours: the app ships no curriculum, so add the techniques your school teaches.
Names must be unique. Deleting a technique takes it off the sessions it was ticked on and leaves
the sessions in place. A technique that has never been ticked counts as untrained from the day
it was added.

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

- `src/domain/` holds the rules (ranks, promotion ordering, timeline, mat-time totals, trends,
  goals, competitions, techniques) as plain functions with their tests.
- `src/state/` loads and saves the data.
- `src/components/` holds the React UI.
- `pwa/` holds the service worker and the build step that generates its file list.
- `public/` holds the web app manifest and icons.
