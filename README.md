# bjj-belt-tracker

A mobile-first web app for tracking your own Brazilian jiu-jitsu progression: your current
belt and stripes, your promotion history, and your mat time between promotions.

Data is stored in the browser's `localStorage`. There is no backend and no account.

## Features

- Set and edit your current rank (white to black belt, 0 to 4 stripes, and 0 to 6 degrees on a
  black belt).
- Log stripe and belt promotions, including back-dated ones. Out-of-order entries are rejected.
- See a timeline of promotions and the time spent at each belt and stripe.
- See the sessions and hours you logged at each belt and each stripe on the timeline.
- Log training sessions (date, duration, gi or no-gi, optional notes), and edit or delete them.
- Say what kind of session it was (class, open mat, drilling or private lesson) and how many
  rounds you rolled.
- Record what you were caught with in rolling, and see on the Overview tab which submissions
  catch you most.
- Filter your sessions by gi or no-gi and search their notes, their kind, the techniques worked
  on or landed, and what you were caught with. Long lists show the most recent 30 sessions, with
  more on request.
- See sessions, hours and rounds rolled this week, since your last promotion, and all time.
- Install it to your phone's home screen and use it with no signal.
- Save a backup file and restore from one, to protect your history or move it to a new device.
  A backup can also be added to what is on a device, for logging on more than one.
- See your time in grade against the IBJJF minimum for your belt (2 years at blue, 18 months at
  purple, 1 year at brown) and the date you reach it. At black belt, see it against the minimum
  for your next degree.
- See training trends: sessions, hours or rounds per week for the last 8 weeks, your weekly
  average and your streak of weeks with at least one session.
- Set a weekly goal of 1 to 7 sessions and see this week's progress and how often you reach it.
- Log time off (injury, illness, travel or other) so those weeks don't break your streak or count
  against your weekly average and goal.
- Log competitions and their matches (win, loss or draw, and how each was decided), and see your
  overall record, how you win and lose, and your medals. A win by submission can name the
  technique from your journal, which then shows the matches it has won.
- Add a competition you have entered with a future date and see a countdown to it. Matches and a
  medal can be added from the day.
- Get a reminder on the Overview tab when your history has not been backed up for 30 days, or
  has never been backed up once it holds 10 records. It can be put off for 30 days.
- Keep a technique journal: your own list of techniques, each with a position and how far along
  you are (learning, drilling, or landing it in rolling), and an optional link such as an
  instructional video. Tick the techniques you worked on when you log a session, and see how
  often and how recently you have trained each one.
- Tick the techniques you landed in rolling when you log a session, and see how often and how
  recently each one has landed.
- See what you are working on from the Overview tab, including techniques that have gone stale:
  still being learned or drilled, and not trained for 30 days, not counting time off.

## Backups

The Backup tab saves everything to a `.json` file (download, or the share sheet on phones).
Restoring shows what the file contains before anything changes. On a device that already has
data there are two choices: add the backup to what is there, or replace what is there with it.
Files that are not backups, come from a newer version of the app, or contain an out-of-order
promotion history are refused.

### Adding a backup to a device

Adding is for logging on more than one device: back up on one, add the file on the other. It
keeps everything on the device and brings in what the device is missing.

- Records are matched by their id. One that is on both stays as the device has it, so a change
  made to it on the other device does not come across. Records hold no time of last change, so
  the app cannot tell which copy is newer.
- Nothing is ever removed, so a record you deleted on this device comes back if the backup still
  has it.
- A technique with the same name is the same technique, and a promotion to a rank the device
  already has is the same promotion, even where each device made its own.
- A competition on both keeps the device's details and gains any matches it is missing.
- The rank is the higher of the two. The weekly goal is the device's, or the backup's if the
  device has none.
- The same session logged separately on both devices is two sessions: there is nothing to say
  they are the same one.
- If the promotions in the backup cannot sit in one history with the device's, adding is not
  offered.

Backups are saved as format version 7. Version 2 added session notes, the weekly goal and
competitions; version 3 added techniques; version 4 added the day each technique reached its
stage; version 5 added the kind of session, rounds rolled and the techniques landed in rolling;
version 6 added time off, black belt degrees above the 4th, and competition wins linked to a
journal technique; version 7 added what a session was caught with and a link on a technique.
Older files still restore.

## Techniques

The list is yours: the app ships no curriculum, so add the techniques your school teaches.
Names must be unique. Deleting a technique takes it off the sessions it was ticked on and leaves
the sessions in place. A technique that has never been ticked counts as untrained from the day
it was added. A link must be a web address; it opens in a new tab.

Each technique shows the day it reached its current stage. A button moves it to the next stage
in one tap, dated that day; editing it to a different stage does the same. Once a technique is
landing in rolling, it also shows how many sessions it had been trained in by then. Techniques
saved before stages were dated count from the day they were added. The Sessions button on a
technique lists the sessions it was ticked on, newest first.

Landing a technique in a roll is recorded on the session, separately from working on it, and
counts as training it that day. It does not change the technique's stage: moving it to landing
in rolling stays your call, with the sessions it landed in shown beside it as evidence.

A win by submission in competition can name a technique from the journal in place of typing
the submission in. Only wins can: the journal is your own techniques, so a submission you lost
to is typed in. The match follows the technique if you rename it, and keeps its name as plain
words if you delete it.

## Time off

Add a period on the Training tab with its first day, its last day and a reason. Leave the last
day blank while you are still off; it then runs up to today. A week counts as time off when any
day of it was.

- **Streak:** a week off with no session neither adds to the streak nor ends it. A week off that
  you trained in anyway counts like any other.
- **Weekly average and goal record:** weeks off are left out, whether or not you trained.
- **Chart:** weeks off are shaded.

Time off can be entered ahead of time; it is shown as planned until it starts. If you log a
session after open-ended time off began, the app points it out and offers to end the time off on
the day before that session, since until it ends every week counts as off.

- **Stale techniques:** the 30-day clock is paused on the days you were off, counted by the day
  and not by the week. A technique flagged as stale says how many days off were left out.
- **This week's goal:** the Overview says the goal is not counted in a week with time off.

Time off does not change your time in grade or your mat time.

## Black belt degrees

A black belt holds degrees in place of stripes, up to the 6th. Stripes do not carry over into
degrees: choosing black belt starts at no degrees. Time in grade is measured from
the day the current degree was awarded, against the IBJJF minimums: 3 years each before the 1st,
2nd and 3rd degrees, and 5 years each before the 4th, 5th and 6th. Log the promotion to your
current degree on the timeline to see it. The 7th degree and above (coral and red belts) are not
tracked.

## Sessions

What you were caught with is recorded by name, not from the journal: those are the other
person's submissions. Names you have used before are offered as one tap, and a name typed in
another case counts as the same one. The Overview lists the five that have caught you in the
most sessions.

The kind of session and the rounds rolled are optional. Sessions logged before kinds were
recorded have none until you edit them and choose one. Rounds left blank are not recorded, which
is different from 0 (no rolling); round totals add up only the sessions that record them.

On the timeline, a session on the day of a promotion counts towards the new rank. Mat time is
shown only for a belt or stripe with at least one session logged, since time from before you
started logging was still trained.

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
