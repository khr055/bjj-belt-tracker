# bjj-belt-tracker

A mobile-first React + TypeScript PWA for tracking one person's Brazilian jiu-jitsu progress.
Data lives in the browser's `localStorage`; there is no backend and no account. `README.md`
describes every feature and the rules behind it, and is kept current with the code.

## Commands

| Command             | Use                                                        |
| ------------------- | ---------------------------------------------------------- |
| `npm install`       | Once per checkout. Needs Node 20 or later.                 |
| `npm test`          | Run the whole test suite (Vitest, jsdom).                  |
| `npm run typecheck` | Type-check without building.                               |
| `npm run build`     | Type-check, test and build. Run this before every commit.  |
| `npm run dev`       | Dev server on port 5173. The service worker is not active. |
| `npm run preview`   | Serve the production build, with the service worker.       |

## Layout

- `src/domain/`: the rules, as plain functions with a `*.test.ts` beside each file. No React,
  no `window`, no `localStorage`. `types.ts` holds the stored data shape (`AppData`).
- `src/state/`: loading and saving (`storage.ts`) and the `useAppState` hook, the only place
  that changes data.
- `src/components/`: the React UI. Components get data and callbacks as props and call domain
  functions for anything worth testing.
- `src/App.test.tsx`: end-to-end tests that drive the whole app through the rendered UI.
- `pwa/`: the service worker and the build step that generates its file list.

## Conventions

- **Dates** are calendar days as `YYYY-MM-DD` strings, compared as strings. Use the helpers in
  `src/domain/dates.ts`; never do date arithmetic on `Date` objects in components. Functions take
  `today` as a parameter and do not read the clock, so tests can fix the date.
- **Changes to data** are domain functions `(data, input, ...) => Result<AppData>` that validate
  and return new data, or an error message written for the user. They never mutate.
- **Optional fields are left out, not set to `undefined`, `''` or `[]`.** Tests compare stored
  objects exactly.
- **Stored data is untrusted.** Everything read from `localStorage` or a backup file goes through
  `src/domain/parse.ts`, which drops what cannot be right and never throws.
- **Adding a stored field:** make it optional or give it a default in `parse.ts`, so existing
  data and old backup files still load. Then raise `BACKUP_VERSION` in `backup.ts`, add a test
  that an older-version backup restores, and update the Backups section of `README.md`.
- **Ranks:** `stripes` means stripes on a coloured belt (0 to 4) and degrees on a black belt
  (0 to 6). Use `maxStripes`, `formatRank` and `rankValue` from `rank.ts`.
- **Tests:** a domain change needs a domain test; a user-visible change also needs a test in
  `App.test.tsx` that finds elements by role and accessible name. Never skip or weaken a test to
  get a green build.
- **UI:** mobile first, at 390px wide with no horizontal scroll. Every control has an accessible
  name; lists, groups and regions are labelled, because the tests and screen readers rely on it.
  Reuse the classes in `src/styles.css` before adding new ones.
- **Comments** say why, in plain sentences. User-facing text is plain English with no
  jargon beyond the sport's own terms.
- **README:** a user-visible change updates the feature list and the section for that area.

## Database

- The schema and its access rules are in `supabase/migrations/`, mirroring `src/domain/types.ts`.
  A change to a stored field changes both, and the limits in the two must agree.
- Every table has row-level security. A new table needs policies, explicit grants and a case in
  `supabase/tests/access.test.sql`, including what must be refused. Run `npm run test:db`.
- Never put a secret (a database password or a service-role key) in the repo or in a `VITE_`
  variable: those are built into the app that everyone downloads.

## Working with several agents

**Off for now, to save tokens (the owner's decision, 12 November 2026).** Do the work in one
session: do not start subagents, parallel worktree sessions or separate review agents unless the
owner asks for one in that conversation. Review your own change before it reaches `main`: read
the whole diff again as a reviewer would, and say plainly that it has had no independent review.

- A change is done when `npm run build` passes and it has been driven in a browser at phone
  width against `npm run preview`, not when the tests alone pass.
- When several agents are in use again: one agent writes and a different one, given the diff and
  not the author's reasoning, reviews before `main`. Parallel work is one branch and worktree per
  feature, and two agents never edit the same files at once. `types.ts`, `parse.ts`, `backup.ts`,
  `App.tsx` and `App.test.tsx` are shared by almost every feature, so features that add stored
  fields are done one after another.
