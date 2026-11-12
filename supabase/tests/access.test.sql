-- Who can see and change what. Run by scripts/test-db.sh against a throwaway database that has
-- supabase-stub.sql and the migrations loaded. Any failed expectation stops the run.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create schema tests;
grant usage on schema tests to authenticated, anon;

-- The cast: two academies. Ana owns the first, Cal coaches there, Sam and Sue are its students.
-- Olga owns the second, where Stu is a student. Dee ends up coaching in both. Nia has signed up
-- and joined nothing.
create table tests.people (name text primary key, id uuid not null);
grant select on tests.people to authenticated, anon;

create function tests.id(who text) returns uuid language sql stable as
  $$ select id from tests.people where name = who $$;

-- Become someone, as a request with their token would be. Null signs out.
create function tests.be(who text) returns void language plpgsql as $$
begin
  if who is null then
    perform set_config('role', 'anon', false);
    perform set_config('request.jwt.claim.sub', '', false);
  else
    perform set_config('role', 'authenticated', false);
    perform set_config('request.jwt.claim.sub', tests.id(who)::text, false);
  end if;
end $$;

create function tests.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
end $$;

-- Runs a statement that must be refused: by touching no rows, or by one of the errors a rule
-- gives (no privilege or a row-level policy, a broken constraint, a code that matches nothing).
-- Any other error is a mistake in the test, not a refusal, and fails it.
create function tests.refused(statement text, what text) returns void language plpgsql as $$
declare touched bigint;
begin
  begin
    execute statement;
    get diagnostics touched = row_count;
  exception when others then
    if sqlstate in ('42501', '23514', '23505', '23503', 'P0002') then return; end if;
    raise exception 'FAILED (unexpected error % %): %', sqlstate, sqlerrm, what;
  end;
  if touched > 0 then raise exception 'FAILED (was allowed): %', what; end if;
end $$;

-- Runs a statement that must be turned away outright as not allowed (42501), for the coach
-- views: coming back empty is not enough there, because a refusal must not look like an academy
-- where nobody trains.
create function tests.forbidden(statement text, what text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = '42501' then return; end if;
    raise exception 'FAILED (unexpected error % %): %', sqlstate, sqlerrm, what;
  end;
  raise exception 'FAILED (was allowed): %', what;
end $$;

-- Runs a statement that must go through and touch at least one row.
create function tests.allowed(statement text, what text) returns void language plpgsql as $$
declare touched bigint;
begin
  execute statement;
  get diagnostics touched = row_count;
  if touched = 0 then raise exception 'FAILED (touched nothing): %', what; end if;
exception when others then
  raise exception 'FAILED (%): %', sqlerrm, what;
end $$;

-- The names of the people a set of ids belongs to, in order, to compare with who should be there.
create function tests.names(ids uuid[]) returns text[] language sql stable as
  $$ select coalesce(array_agg(p.name order by p.name), '{}') from tests.people p where p.id = any (ids) $$;

-- Someone's current rank as the signed-in person sees it, or 'none'.
create function tests.rank_of(who text) returns text language sql stable as
  $$ select coalesce(belt || ' ' || stripes, 'none') from public.profiles where id = tests.id(who) $$;

create function tests.name_of(who text) returns text language sql stable as
  $$ select display_name from public.profiles where id = tests.id(who) $$;

-- ---------------------------------------------------------------------------------------------
-- Signing up makes a profile
-- ---------------------------------------------------------------------------------------------
with made as (
  insert into auth.users (email, raw_user_meta_data) values
    ('ana@example.test', '{"display_name": "Ana"}'),
    ('cal@example.test', '{"display_name": "  Cal  "}'),
    ('sam@example.test', '{"display_name": "Sam"}'),
    ('sue@example.test', '{"display_name": "Sue", "full_name": "Susan Other", "name": "Susie"}'),
    ('olga@example.test', '{}'),
    -- Signing in with Google gives a full name, or just a name, and no display name.
    ('dee@example.test', '{"full_name": "  Dee Dual ", "name": "Dee"}'),
    ('stu@example.test', '{"display_name": "", "full_name": "   ", "name": "Stu Name"}'),
    ('nia@example.test', jsonb_build_object('full_name', 'Nia ' || repeat('n', 100)))
  returning id, email
)
insert into tests.people select split_part(email, '@', 1), id from made;

select tests.expect((select count(*) = 8 from public.profiles), 'every sign-up gets a profile');
select tests.expect(tests.name_of('sam') = 'Sam', 'the profile takes the name given at sign-up');
select tests.expect(tests.name_of('cal') = 'Cal', 'with the spaces around it trimmed');
select tests.expect(tests.name_of('sue') = 'Sue', 'the name the app sends wins over the others');
select tests.expect(tests.name_of('dee') = 'Dee Dual', 'a Google sign-up takes the full name');
select tests.expect(tests.name_of('stu') = 'Stu Name', 'blank names are passed over for the next one');
select tests.expect(tests.name_of('nia') = 'Nia ' || repeat('n', 76), 'a long name is cut to 80 characters');
select tests.expect(tests.name_of('olga') = '', 'no name at all leaves it empty');

-- ---------------------------------------------------------------------------------------------
-- Academies: starting one, joining, roles
-- ---------------------------------------------------------------------------------------------
select tests.be(null);
select tests.refused($$ select public.create_academy('Nobody BJJ') $$, 'starting an academy while signed out');
select tests.refused($$ select * from public.profiles $$, 'reading profiles while signed out');
select tests.refused($$ select * from public.sessions $$, 'reading sessions while signed out');

select tests.be('ana');
select public.create_academy('  Ana BJJ ') as ana_academy \gset
select tests.expect((select name = 'Ana BJJ' from public.academies), 'the academy name is tidied');
select tests.expect(
  (select role = 'owner' from public.memberships where user_id = tests.id('ana')),
  'whoever starts an academy owns it');
select code as ana_code from public.academy_invites \gset

select tests.be('olga');
select public.create_academy('Olga Jiu-Jitsu') as olga_academy \gset
select code as olga_code from public.academy_invites \gset
select tests.expect((select count(*) = 1 from public.academies), 'an owner sees only their own academy');

select tests.be('cal'); select public.join_academy(:'ana_code');
select tests.be('sam'); select public.join_academy(upper(:'ana_code'));
select tests.be('sue'); select public.join_academy(:'ana_code');
select public.join_academy(:'ana_code');
select tests.be('stu'); select public.join_academy(:'olga_code');
select tests.refused($$ select public.join_academy('not-a-code') $$, 'joining with a code that matches nothing');

select tests.be('sue');
select tests.expect((select count(*) = 1 from public.memberships), 'joining twice is one membership, and a student sees only their own');
select tests.expect((select role = 'student' from public.memberships), 'people join as students');
select tests.expect((select count(*) = 0 from public.academy_invites), 'a student cannot read the joining code');
select tests.expect((select count(*) = 1 from public.academies), 'a member can read their academy');
select tests.refused(
  format($$ update public.memberships set role = 'coach' where user_id = %L $$, tests.id('sue')),
  'a student making themselves a coach');
select tests.refused(
  format($$ insert into public.memberships (academy_id, user_id, role) values (%L, %L, 'owner') $$, :'olga_academy', tests.id('sue')),
  'adding yourself to an academy without its code');
select tests.refused($$ update public.academies set name = 'Sue BJJ' $$, 'a student renaming the academy');
select tests.refused(format($$ select public.renew_invite(%L) $$, :'ana_academy'), 'a student changing the code');

select tests.be('ana');
select tests.allowed(
  format($$ update public.memberships set role = 'coach' where user_id = %L $$, tests.id('cal')),
  'an owner makes a member a coach');
select tests.expect((select count(*) = 4 from public.memberships), 'an owner sees everyone in their academy and nobody else');
select tests.refused(
  format($$ update public.memberships set role = 'coach' where user_id = %L $$, tests.id('stu')),
  'an owner changing a role in another academy');
select tests.refused(
  format($$ update public.memberships set user_id = %L where user_id = %L $$, tests.id('nia'), tests.id('sue')),
  'an owner handing a membership to someone else');
select tests.refused(
  format($$ update public.memberships set role = 'student' where user_id = %L $$, tests.id('ana')),
  'the only owner stepping down');
select tests.refused(
  format($$ delete from public.memberships where user_id = %L $$, tests.id('ana')),
  'the only owner leaving');

select tests.be('cal');
select tests.expect((select count(*) = 1 from public.academy_invites), 'a coach can read the code to hand it out');
select tests.refused(
  format($$ update public.memberships set role = 'owner' where user_id = %L $$, tests.id('cal')),
  'a coach making themselves an owner');
select tests.refused(format($$ select public.renew_invite(%L) $$, :'ana_academy'), 'a coach changing the code');

select tests.be('ana');
select public.renew_invite(:'ana_academy') as ana_code_now \gset
select tests.be('nia');
select tests.refused(format($$ select public.join_academy(%L) $$, :'ana_code'), 'joining with a code that has been replaced');

-- ---------------------------------------------------------------------------------------------
-- A student's own record: they check themselves in, and keep the rest of their journal
-- ---------------------------------------------------------------------------------------------
select tests.be('sam');
insert into public.techniques (user_id, name, position, status, added_on, status_since)
values (tests.id('sam'), 'Armbar', 'guard', 'drilling', '2026-01-01', '2026-01-01')
returning id as sam_armbar \gset
select tests.allowed($$ insert into public.sessions (user_id, date, duration_minutes, type, kind, rounds, notes, caught_with)
  values (auth.uid(), '2026-11-01', 90, 'gi', 'open-mat', 6, 'Felt slow', array['Triangle']) $$,
  'a student checks in by logging their own session');
select id as sam_session from public.sessions \gset
insert into public.session_techniques (session_id, technique_id, worked_on, landed)
values (:'sam_session', :'sam_armbar', true, true);
insert into public.competitions (user_id, date, name, type)
values (tests.id('sam'), '2026-10-17', 'Autumn Open', 'gi')
returning id as sam_competition \gset
insert into public.matches (competition_id, position, result, method, technique_id)
values (:'sam_competition', 1, 'win', 'submission', :'sam_armbar');
insert into public.time_off (user_id, start_date, end_date, reason, notes)
values (tests.id('sam'), '2026-09-01', '2026-09-20', 'injury', 'Left knee');

select tests.allowed($$ insert into public.sessions (user_id, date, duration_minutes, type) values (auth.uid(), '2026-11-05', 60, 'nogi') $$, 'a student logs another session');
select tests.allowed($$ update public.sessions set duration_minutes = 75 where date = '2026-11-05' $$, 'a student edits their own session');
select tests.expect((select duration_minutes = 75 from public.sessions where date = '2026-11-05'), 'and the edit is kept');
select tests.allowed($$ delete from public.sessions where date = '2026-11-05' $$, 'a student deletes their own session');
select tests.expect((select count(*) = 1 from public.sessions), 'which leaves the one they kept');

select tests.allowed($$ update public.profiles set display_name = 'Sam S', weekly_goal = 3 where id = auth.uid() $$, 'a student changes their own name and weekly goal');
select tests.expect((select display_name = 'Sam S' and weekly_goal = 3 from public.profiles where id = auth.uid()), 'and both are kept');

-- Rank is awarded by a coach, never claimed.
select tests.refused($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'white', 0, '2024-01-10') $$, 'a student logging their own promotion');
select tests.refused($$ update public.profiles set belt = 'black', stripes = 0 where id = auth.uid() $$, 'a student setting their own rank');
select tests.refused($$ update public.profiles set belt = 'white' where id = auth.uid() $$, 'a student setting their own belt');
select tests.refused($$ update public.profiles set stripes = 1 where id = auth.uid() $$, 'a student setting their own stripes');
select tests.expect(tests.rank_of('sam') = 'none', 'someone with no promotions has no rank');

select tests.refused($$ insert into public.techniques (user_id, name, position, status, added_on, status_since)
  values (auth.uid(), ' ARMBAR ', 'guard', 'learning', '2026-01-01', '2026-01-01') $$,
  'a second technique with the same name in another case');
select tests.refused($$ insert into public.sessions (user_id, date, duration_minutes, type) values (auth.uid(), '2026-11-02', 0, 'gi') $$, 'a session of no minutes');
select tests.refused($$ insert into public.sessions (user_id, date, duration_minutes, type, rounds) values (auth.uid(), '2026-11-02', 60, 'gi', 31) $$, 'more than 30 rounds');
select tests.refused($$ insert into public.sessions (user_id, date, duration_minutes, type, kind) values (auth.uid(), '2026-11-02', 60, 'gi', 'seminar') $$, 'a kind of session the app does not have');
select tests.refused($$ insert into public.time_off (user_id, start_date, end_date, reason) values (auth.uid(), '2026-09-10', '2026-09-01', 'travel') $$, 'time off that ends before it starts');
select tests.refused($$ update public.techniques set link = 'javascript:alert(1)' $$, 'a link that is not a web address');
select tests.refused(format($$ update public.profiles set id = %L where id = auth.uid() $$, tests.id('nia')), 'changing whose profile it is');
select tests.refused($$ insert into public.matches (competition_id, position, result, method) select id, 2, 'draw', 'points' from public.competitions $$, 'a draw with a method');
select tests.refused($$ insert into public.matches (competition_id, position, result, method, technique_id) select c.id, 2, 'loss', 'submission', t.id from public.competitions c, public.techniques t $$, 'a loss linked to the journal');

-- ---------------------------------------------------------------------------------------------
-- Only coaches and owners award rank, and the rank follows the promotions they record
-- ---------------------------------------------------------------------------------------------
select tests.be('cal');
-- The request claims Sam recorded it; the database knows better.
select tests.allowed(format($$ insert into public.promotions (user_id, belt, stripes, date, promoted_by, recorded_by) values (%L, 'white', 0, '2024-01-10', 'Coach Cal', %L) $$, tests.id('sam'), tests.id('sam')), 'a coach records a student''s promotion');
select tests.expect(tests.rank_of('sam') = 'white 0', 'which gives the student their rank');
select tests.expect((select recorded_by = tests.id('cal') from public.promotions), 'and says which coach entered it, whatever the request claimed');
select tests.allowed(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'blue', 0, '2026-11-10') $$, tests.id('sam')), 'a coach records a higher promotion');
select tests.expect(tests.rank_of('sam') = 'blue 0', 'which raises the rank');
select tests.allowed(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'white', 4, '2026-06-01') $$, tests.id('sam')), 'a coach back-dates a lower promotion');
select tests.expect(tests.rank_of('sam') = 'blue 0', 'which does not lower the rank');
-- The rank is the highest promotion, not the latest one.
select tests.allowed(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'white', 3, '2026-11-12') $$, tests.id('sam')), 'a coach enters a lower promotion with a later date');
select tests.expect(tests.rank_of('sam') = 'blue 0', 'which does not lower the rank either');
select tests.allowed(format($$ delete from public.promotions where user_id = %L and belt = 'white' and stripes = 3 $$, tests.id('sam')), 'and takes it out again');
select tests.expect(tests.rank_of('sam') = 'blue 0', 'which leaves the rank where it was');
select tests.allowed(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'blue', 2, '2026-11-11') $$, tests.id('sam')), 'a coach records two stripes by mistake');
select tests.expect(tests.rank_of('sam') = 'blue 2', 'and the rank follows');
select tests.allowed(format($$ update public.promotions set stripes = 1 where user_id = %L and belt = 'blue' and stripes = 2 $$, tests.id('sam')), 'a coach corrects a promotion');
select tests.expect(tests.rank_of('sam') = 'blue 1', 'and the rank comes down with the correction');
select tests.allowed(format($$ delete from public.promotions where user_id = %L and belt = 'blue' and stripes = 1 $$, tests.id('sam')), 'a coach deletes a mistaken promotion');
select tests.expect(tests.rank_of('sam') = 'blue 0', 'and the rank goes back to the highest that is left');

select tests.refused(format($$ update public.promotions set user_id = %L where belt = 'blue' $$, tests.id('sue')), 'moving a promotion to another student');
select tests.refused(format($$ update public.promotions set recorded_by = %L where belt = 'blue' $$, tests.id('ana')), 'changing who recorded a promotion');
select tests.refused(format($$ update public.profiles set belt = 'black', stripes = 0 where id = %L $$, tests.id('sam')), 'a coach setting a student''s rank without a promotion');
select tests.refused(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'blue', 0, '2026-11-10') $$, tests.id('stu')), 'a coach promoting someone in another academy');
select tests.refused(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'blue', 0, '2026-11-10') $$, tests.id('nia')), 'a coach promoting someone who is in no academy');
select tests.refused(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'blue', 5, '2026-01-01') $$, tests.id('sam')), 'five stripes on a coloured belt');
select tests.refused(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'white', 0, '2025-01-01') $$, tests.id('sam')), 'the same rank twice');

-- Deleting every promotion leaves no rank at all.
select tests.allowed(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'white', 1, '2026-03-01') $$, tests.id('sue')), 'a coach records another student''s promotion');
select tests.expect(tests.rank_of('sue') = 'white 1' and tests.rank_of('sam') = 'blue 0', 'which moves that student''s rank and nobody else''s');
select tests.allowed(format($$ delete from public.promotions where user_id = %L $$, tests.id('sue')), 'a coach deletes a student''s only promotion');
select tests.expect(tests.rank_of('sue') = 'none', 'which leaves them with no rank');

-- Staff record their own: the head coach has nobody above them. Belts rank in the order they are
-- earned, which is not the order of their names, and a belt counts before its stripes.
select tests.allowed($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'purple', 4, '2020-01-01') $$, 'a coach records their own promotion');
select tests.allowed($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'brown', 0, '2022-01-01') $$, 'and the next one');
select tests.expect(tests.rank_of('cal') = 'brown 0', 'a brown belt outranks a purple belt with four stripes');

select tests.be('ana');
select tests.allowed($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'black', 6, '2026-01-01') $$, 'an owner records their own promotion, to six degrees on a black belt');
select tests.refused($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'black', 7, '2026-01-01') $$, 'seven degrees');
select tests.allowed($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'white', 4, '2005-01-01') $$, 'an owner fills in their own history');
select tests.expect(tests.rank_of('ana') = 'black 6', 'a black belt outranks a white belt');
select tests.expect((select bool_and(recorded_by = auth.uid()) from public.promotions where user_id = auth.uid()), 'an owner''s own promotions say the owner entered them');

-- Back as the student: the history is theirs to read, not to write.
select tests.be('sam');
select tests.expect((select count(*) = 3 from public.promotions), 'a student reads their own promotions, and only theirs');
select tests.expect((select bool_and(recorded_by = tests.id('cal')) from public.promotions), 'each recorded by the coach');
select tests.refused($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'purple', 0, '2026-11-12') $$, 'a student adding to their own promotions');
select tests.refused($$ update public.promotions set stripes = 3 where belt = 'blue' $$, 'a student changing their own promotion');
select tests.refused($$ update public.promotions set date = '2020-01-01' $$, 'a student re-dating their own promotions');
select tests.refused($$ delete from public.promotions $$, 'a student deleting their own promotions');
select tests.refused($$ update public.profiles set belt = 'black', stripes = 0 where id = auth.uid() $$, 'a promoted student setting their own rank');
select tests.expect(tests.rank_of('sam') = 'blue 0' and (select count(*) = 3 from public.promotions), 'and none of it changed anything');

select tests.be('nia');
select tests.refused($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'blue', 0, '2026-11-12') $$, 'someone in no academy logging their own promotion');
select tests.refused($$ update public.profiles set belt = 'blue', stripes = 0 where id = auth.uid() $$, 'someone in no academy setting their own rank');
select tests.expect(tests.rank_of('nia') = 'none', 'so they have no rank');

-- ---------------------------------------------------------------------------------------------
-- Other students see none of it, and cannot write into it
-- ---------------------------------------------------------------------------------------------
select tests.be('sue');
select tests.expect((select count(*) = 0 from public.sessions), 'a student cannot read another student''s sessions');
select tests.expect((select count(*) = 0 from public.techniques), 'nor their techniques');
select tests.expect((select count(*) = 0 from public.session_techniques), 'nor what their sessions touched');
select tests.expect((select count(*) = 0 from public.competitions), 'nor their competitions');
select tests.expect((select count(*) = 0 from public.matches), 'nor their matches');
select tests.expect((select count(*) = 0 from public.time_off), 'nor their time off');
select tests.expect((select count(*) = 0 from public.promotions), 'nor their promotions');
select tests.expect((select count(*) = 1 from public.profiles), 'nor any profile but their own');
select tests.refused(format($$ insert into public.sessions (user_id, date, duration_minutes, type) values (%L, '2026-11-03', 60, 'gi') $$, tests.id('sam')), 'logging a session as another student');
select tests.refused(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'black', 0, '2026-11-03') $$, tests.id('sam')), 'a student promoting another student');
select tests.refused($$ update public.sessions set notes = 'hacked' $$, 'editing another student''s session');
select tests.refused($$ delete from public.sessions $$, 'deleting another student''s session');
select tests.refused(format($$ update public.profiles set display_name = 'Hacked' where id = %L $$, tests.id('sam')), 'changing another student''s name');
select tests.refused(format($$ insert into public.matches (competition_id, position, result, method) values (%L, 2, 'win', 'points') $$, :'sam_competition'), 'adding a match to another student''s competition');

-- Sue's own technique cannot be hung on Sam's session, nor Sam's on hers.
insert into public.techniques (user_id, name, position, status, added_on, status_since)
values (tests.id('sue'), 'Kimura', 'guard', 'learning', '2026-01-01', '2026-01-01') returning id as sue_kimura \gset
insert into public.sessions (user_id, date, duration_minutes, type)
values (tests.id('sue'), '2026-11-02', 60, 'nogi') returning id as sue_session \gset
select tests.refused(format($$ insert into public.session_techniques values (%L, %L, true, false) $$, :'sam_session', :'sue_kimura'), 'ticking your technique on another student''s session');
select tests.refused(format($$ insert into public.session_techniques values (%L, %L, true, false) $$, :'sue_session', :'sam_armbar'), 'ticking another student''s technique on your session');
-- Sue is away, with no end date yet.
insert into public.time_off (user_id, start_date, reason, notes)
values (tests.id('sue'), '2026-11-03', 'travel', 'Visiting family');

-- A student of the other academy trains and takes time off too, and the coach trains.
select tests.be('stu');
insert into public.sessions (user_id, date, duration_minutes, type, kind, notes)
values (tests.id('stu'), '2026-11-04', 45, 'nogi', 'class', 'A private note');
insert into public.time_off (user_id, start_date, end_date, reason)
values (tests.id('stu'), '2026-08-01', '2026-08-07', 'illness');
select tests.be('cal');
select tests.allowed($$ insert into public.sessions (user_id, date, duration_minutes, type, kind) values (auth.uid(), '2026-11-06', 120, 'gi', 'private') $$, 'a coach logs their own training');

-- ---------------------------------------------------------------------------------------------
-- A coach sees names, rank, promotions, attendance and the dates of time off, and nothing else
-- ---------------------------------------------------------------------------------------------
select tests.expect((select count(*) = 1 and bool_and(user_id = auth.uid()) from public.sessions), 'a coach reading sessions sees their own and none of a student''s');
select tests.expect((select count(*) = 0 from public.techniques), 'and none of a student''s techniques');
select tests.expect((select count(*) = 0 from public.session_techniques), 'nor what their sessions touched');
select tests.expect((select count(*) = 0 from public.competitions), 'nor their competitions');
select tests.expect((select count(*) = 0 from public.matches), 'nor their matches');
select tests.expect((select count(*) = 0 from public.time_off), 'nor their time off, with its reasons and notes');
select tests.expect((select count(*) = 4 from public.profiles), 'a coach reads the profiles of everyone in the academy');
select tests.expect((select display_name = 'Sam S' and belt = 'blue' and stripes = 0 from public.profiles where id = tests.id('sam')), 'with their names and ranks');
select tests.expect((select count(*) = 4 from public.memberships), 'and who is in it');
select tests.expect((select count(*) = 3 from public.promotions where user_id = tests.id('sam')), 'and a student''s promotion history');
select tests.refused($$ update public.sessions set notes = 'coach was here' where user_id <> auth.uid() $$, 'a coach editing a student''s session');
select tests.refused($$ delete from public.techniques $$, 'a coach deleting a student''s technique');
select tests.refused($$ delete from public.time_off $$, 'a coach deleting a student''s time off');
select tests.refused(format($$ insert into public.sessions (user_id, date, duration_minutes, type) values (%L, '2026-11-03', 60, 'gi') $$, tests.id('sam')), 'a coach logging a session for a student');
select tests.refused(format($$ update public.profiles set display_name = 'Renamed' where id = %L $$, tests.id('sam')), 'a coach editing a student''s profile');

-- Attendance: every member's sessions, and only when, how long and what kind.
select tests.expect(
  (select tests.names(array_agg(user_id)) = array['cal', 'sam', 'sue'] from public.academy_attendance(:'ana_academy')),
  'a coach sees the attendance of everyone in their academy, one row a session, and nobody else''s');
select tests.expect(
  (select count(*) = 1 from public.academy_attendance(:'ana_academy')
   where user_id = tests.id('sam') and date = '2026-11-01' and duration_minutes = 90 and type = 'gi' and kind = 'open-mat'),
  'with the day, length and kind of each session');
select tests.expect(
  (select bool_and((select array_agg(k order by k) from jsonb_object_keys(to_jsonb(a)) k)
     = array['date', 'duration_minutes', 'kind', 'type', 'user_id'])
   from public.academy_attendance(:'ana_academy') a),
  'and nothing else: no notes, rounds or what they were caught with');

-- Time off: the dates only.
select tests.expect(
  (select tests.names(array_agg(user_id)) = array['sam', 'sue'] from public.academy_time_off(:'ana_academy')),
  'a coach sees who in their academy has been away, and nobody else');
select tests.expect(
  (select count(*) = 1 from public.academy_time_off(:'ana_academy')
   where user_id = tests.id('sam') and start_date = '2026-09-01' and end_date = '2026-09-20'),
  'with the dates they were away');
select tests.expect(
  (select count(*) = 1 from public.academy_time_off(:'ana_academy')
   where user_id = tests.id('sue') and start_date = '2026-11-03' and end_date is null),
  'and no end date for someone still away');
select tests.expect(
  (select bool_and((select array_agg(k order by k) from jsonb_object_keys(to_jsonb(t)) k)
     = array['end_date', 'start_date', 'user_id'])
   from public.academy_time_off(:'ana_academy') t),
  'and nothing else: no reason and no notes');

select tests.forbidden(format($$ select * from public.academy_attendance(%L) $$, :'olga_academy'), 'a coach reading another academy''s attendance');
select tests.forbidden(format($$ select * from public.academy_time_off(%L) $$, :'olga_academy'), 'a coach reading another academy''s time off');

select tests.be('ana');
select tests.expect((select count(*) = 3 from public.academy_attendance(:'ana_academy')), 'an owner sees attendance as a coach does');
select tests.expect((select count(*) = 2 from public.academy_time_off(:'ana_academy')), 'and time off');
select tests.expect((select count(*) = 0 from public.sessions), 'and no more of a student''s sessions than a coach does');
select tests.expect((select count(*) = 0 from public.time_off), 'nor of their time off');

select tests.be('sam');
select tests.forbidden(format($$ select * from public.academy_attendance(%L) $$, :'ana_academy'), 'a student reading their academy''s attendance');
select tests.forbidden(format($$ select * from public.academy_time_off(%L) $$, :'ana_academy'), 'a student reading their academy''s time off');
select tests.expect((select count(*) = 1 and bool_and(notes = 'Felt slow' and caught_with = array['Triangle']) from public.sessions), 'a student still reads their own sessions, notes and all');
select tests.expect((select count(*) = 1 from public.techniques), 'and their techniques');
select tests.expect((select count(*) = 1 from public.session_techniques), 'and what their sessions touched');
select tests.expect((select count(*) = 1 from public.competitions), 'and their competitions');
select tests.expect((select count(*) = 1 from public.matches), 'and their matches');
select tests.expect((select count(*) = 1 and bool_and(reason = 'injury' and notes = 'Left knee') from public.time_off), 'and their time off, with its reason');

select tests.be('nia');
select tests.forbidden(format($$ select * from public.academy_attendance(%L) $$, :'ana_academy'), 'someone in no academy reading an academy''s attendance');
select tests.forbidden(format($$ select * from public.academy_time_off(%L) $$, :'ana_academy'), 'someone in no academy reading an academy''s time off');
select tests.be(null);
select tests.forbidden(format($$ select * from public.academy_attendance(%L) $$, :'ana_academy'), 'reading attendance while signed out');
select tests.forbidden(format($$ select * from public.academy_time_off(%L) $$, :'ana_academy'), 'reading time off while signed out');

-- ---------------------------------------------------------------------------------------------
-- Academies are sealed from each other
-- ---------------------------------------------------------------------------------------------
select tests.be('olga');
select tests.expect((select count(*) = 0 from public.sessions), 'an owner cannot read another academy''s sessions');
select tests.expect((select count(*) = 2 from public.profiles), 'an owner sees only their own academy''s people');
select tests.expect((select count(*) = 2 from public.memberships), 'and only its memberships');
select tests.expect((select count(*) = 0 from public.promotions), 'and none of another academy''s promotions');
select tests.forbidden(format($$ select * from public.academy_attendance(%L) $$, :'ana_academy'), 'an owner reading another academy''s attendance');
select tests.forbidden(format($$ select * from public.academy_time_off(%L) $$, :'ana_academy'), 'an owner reading another academy''s time off');
select tests.expect(
  (select tests.names(array_agg(user_id)) = array['stu'] from public.academy_attendance(:'olga_academy')),
  'an owner sees their own academy''s attendance, and only that');
select tests.refused(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'black', 0, '2026-11-10') $$, tests.id('sam')), 'an owner promoting someone in another academy');
select tests.refused(format($$ delete from public.promotions where user_id = %L $$, tests.id('sam')), 'an owner deleting promotions in another academy');
select tests.refused(format($$ delete from public.memberships where academy_id = %L $$, :'ana_academy'), 'removing members of another academy');
select tests.refused(format($$ delete from public.academies where id = %L $$, :'ana_academy'), 'deleting another academy');

select tests.be('nia');
select tests.expect((select count(*) = 0 from public.academies), 'someone in no academy sees no academy');
select tests.expect((select count(*) = 1 from public.profiles), 'and only their own profile');

-- ---------------------------------------------------------------------------------------------
-- A coach of two academies sees each one's people when asking about that one, never mixed
-- ---------------------------------------------------------------------------------------------
select tests.be('dee');
select public.join_academy(:'ana_code_now');
select public.join_academy(:'olga_code');
insert into public.sessions (user_id, date, duration_minutes, type) values (tests.id('dee'), '2026-11-07', 60, 'gi');
select tests.be('ana');
select tests.allowed(format($$ update public.memberships set role = 'coach' where user_id = %L $$, tests.id('dee')), 'one owner makes Dee a coach');
-- Being a coach somewhere is not being a coach everywhere.
select tests.be('dee');
select tests.forbidden(format($$ select * from public.academy_attendance(%L) $$, :'olga_academy'), 'a coach of one academy, a student of another, reading the other''s attendance');
select tests.forbidden(format($$ select * from public.academy_time_off(%L) $$, :'olga_academy'), 'or its time off');
select tests.refused(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'white', 1, '2026-11-08') $$, tests.id('stu')), 'or promoting a fellow student there');
select tests.be('olga');
select tests.allowed(format($$ update public.memberships set role = 'coach' where user_id = %L $$, tests.id('dee')), 'and then so does the other owner');

select tests.be('dee');
select tests.expect(
  (select tests.names(array_agg(user_id)) = array['cal', 'dee', 'sam', 'sue'] from public.academy_attendance(:'ana_academy')),
  'asked about the first academy, attendance is its members'' and nobody else''s');
select tests.expect(
  (select tests.names(array_agg(user_id)) = array['dee', 'stu'] from public.academy_attendance(:'olga_academy')),
  'asked about the second, it is the second''s');
select tests.expect(
  (select tests.names(array_agg(user_id)) = array['sam', 'sue'] from public.academy_time_off(:'ana_academy')),
  'time off in the first academy is its members''');
select tests.expect(
  (select tests.names(array_agg(user_id)) = array['stu'] from public.academy_time_off(:'olga_academy')),
  'and in the second, the second''s');
select tests.expect((select count(*) = 1 from public.sessions), 'and the sessions table still shows a coach of two academies only their own');
select tests.allowed(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'white', 1, '2026-11-08') $$, tests.id('stu')), 'a coach of two academies promotes a student of the second');
select tests.expect(tests.rank_of('stu') = 'white 1', 'and the rank follows');

-- ---------------------------------------------------------------------------------------------
-- Leaving, and what goes when things are deleted
-- ---------------------------------------------------------------------------------------------
select tests.be('sue');
select tests.allowed($$ delete from public.memberships where user_id = auth.uid() $$, 'a student leaves');
select tests.be('cal');
select tests.expect(
  (select tests.names(array_agg(user_id)) = array['cal', 'dee', 'sam'] from public.academy_attendance(:'ana_academy')),
  'a coach no longer sees the attendance of a student who left');
select tests.expect(
  (select tests.names(array_agg(user_id)) = array['sam'] from public.academy_time_off(:'ana_academy')),
  'nor their time off');
select tests.expect((select count(*) = 0 from public.profiles where id = tests.id('sue')), 'nor their profile');
select tests.refused(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'white', 2, '2026-11-09') $$, tests.id('sue')), 'a coach promoting a student who left');

select tests.be('sam');
select tests.allowed(format($$ delete from public.techniques where id = %L $$, :'sam_armbar'), 'deleting a technique');
select tests.expect((select count(*) = 0 from public.session_techniques), 'takes it off its sessions');
select tests.expect((select technique_id is null from public.matches), 'and unlinks it from its matches');
select tests.expect((select count(*) = 1 from public.sessions), 'and leaves the sessions');

select tests.be('ana');
select tests.allowed(format($$ delete from public.memberships where user_id = %L $$, tests.id('cal')), 'an owner removes a coach');
select tests.be('cal');
select tests.forbidden(format($$ select * from public.academy_attendance(%L) $$, :'ana_academy'), 'a coach who was removed reading attendance');
select tests.refused(format($$ delete from public.promotions where user_id = %L $$, tests.id('sam')), 'a coach who was removed deleting a promotion they recorded');
select tests.refused($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'brown', 1, '2026-11-09') $$, 'or recording their own');
select tests.be('ana');
select tests.allowed(format($$ delete from public.academies where id = %L $$, :'ana_academy'), 'an owner closes their academy');
select tests.be('sam');
select tests.expect(tests.rank_of('sam') = 'blue 0' and (select count(*) = 3 from public.promotions), 'a student keeps their rank and promotions when the academy closes');
select tests.refused($$ delete from public.promotions $$, 'and still cannot change them');
reset role;
select tests.expect(
  (select count(*) = 0 from pg_proc where pronamespace = 'public'::regnamespace and has_function_privilege('anon', oid, 'execute')),
  'someone who is not signed in can run none of the database''s functions');
select tests.expect(
  has_function_privilege('authenticated', 'public.academy_attendance(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.academy_time_off(uuid)', 'execute'),
  'and someone signed in can ask for the coach views');
select tests.expect((select count(*) = 0 from public.memberships where academy_id = :'ana_academy'), 'its memberships go with it');
select tests.expect((select count(*) = 5 from public.sessions), 'and nobody''s training record does');

delete from auth.users where id = tests.id('cal');
select tests.expect(
  (select count(*) = 3 and bool_and(recorded_by is null) from public.promotions where user_id = tests.id('sam')),
  'deleting a coach''s account keeps the promotions they recorded, without a recorder');
select tests.expect(tests.rank_of('sam') = 'blue 0', 'and the ranks that came from them');

delete from auth.users where id = tests.id('sam');
select tests.expect((select count(*) = 0 from public.sessions where user_id = tests.id('sam')), 'deleting an account deletes its record');
select tests.expect((select count(*) = 0 from public.promotions where user_id = tests.id('sam')), 'and its promotions');

\echo access rules: all expectations met
