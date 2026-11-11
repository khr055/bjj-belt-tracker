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
| `npm run build`     | Type-check and build into `dist/`     |

## Layout

- `src/domain/` holds the rules (ranks, promotion ordering, timeline, mat-time totals) as plain
  functions with their tests.
- `src/state/` loads and saves the data.
- `src/components/` holds the React UI.
