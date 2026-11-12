-- Who can see and change what. Run by scripts/test-db.sh against a throwaway database that has
-- supabase-stub.sql and the migrations loaded. Any failed expectation stops the run.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create schema tests;
grant usage on schema tests to authenticated, anon;

-- The cast: two academies. Ana owns the first, Cal coaches there, Sam and Sue are its students.
-- Olga owns the second, where Stu is a student. Nia has signed up and joined nothing.
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

-- ---------------------------------------------------------------------------------------------
-- Signing up makes a profile
-- ---------------------------------------------------------------------------------------------
with made as (
  insert into auth.users (email, raw_user_meta_data)
  select name || '@example.test', jsonb_build_object('display_name', initcap(name))
  from unnest(array['ana', 'cal', 'sam', 'sue', 'olga', 'stu', 'nia']) as name
  returning id, email
)
insert into tests.people select split_part(email, '@', 1), id from made;

select tests.expect((select count(*) = 7 from public.profiles), 'every sign-up gets a profile');
select tests.expect(
  (select display_name = 'Sam' from public.profiles where id = tests.id('sam')),
  'the profile takes the name given at sign-up');

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
select public.renew_invite(:'ana_academy') as new_code \gset
select tests.be('nia');
select tests.refused(format($$ select public.join_academy(%L) $$, :'ana_code'), 'joining with a code that has been replaced');

-- ---------------------------------------------------------------------------------------------
-- A student's own record
-- ---------------------------------------------------------------------------------------------
select tests.be('sam');
insert into public.techniques (user_id, name, position, status, added_on, status_since)
values (tests.id('sam'), 'Armbar', 'guard', 'drilling', '2026-01-01', '2026-01-01')
returning id as sam_armbar \gset
insert into public.sessions (user_id, date, duration_minutes, type, kind, rounds, caught_with)
values (tests.id('sam'), '2026-11-01', 90, 'gi', 'open-mat', 6, array['Triangle'])
returning id as sam_session \gset
insert into public.session_techniques (session_id, technique_id, worked_on, landed)
values (:'sam_session', :'sam_armbar', true, true);
insert into public.competitions (user_id, date, name, type)
values (tests.id('sam'), '2026-10-17', 'Autumn Open', 'gi')
returning id as sam_competition \gset
insert into public.matches (competition_id, position, result, method, technique_id)
values (:'sam_competition', 1, 'win', 'submission', :'sam_armbar');
insert into public.time_off (user_id, start_date, reason)
values (tests.id('sam'), '2026-09-01', 'injury');
insert into public.promotions (user_id, belt, stripes, date)
values (tests.id('sam'), 'white', 0, '2024-01-10');
update public.profiles set weekly_goal = 3 where id = tests.id('sam');

select tests.expect((select belt = 'white' and stripes = 0 from public.profiles where id = tests.id('sam')),
  'a logged promotion sets a rank that was not set');
select tests.expect((select recorded_by is null from public.promotions), 'a promotion you log yourself has no recorder');

select tests.refused($$ insert into public.techniques (user_id, name, position, status, added_on, status_since)
  values (auth.uid(), ' ARMBAR ', 'guard', 'learning', '2026-01-01', '2026-01-01') $$,
  'a second technique with the same name in another case');
select tests.refused($$ insert into public.sessions (user_id, date, duration_minutes, type) values (auth.uid(), '2026-11-02', 0, 'gi') $$, 'a session of no minutes');
select tests.refused($$ insert into public.sessions (user_id, date, duration_minutes, type, rounds) values (auth.uid(), '2026-11-02', 60, 'gi', 31) $$, 'more than 30 rounds');
select tests.refused($$ insert into public.sessions (user_id, date, duration_minutes, type, kind) values (auth.uid(), '2026-11-02', 60, 'gi', 'seminar') $$, 'a kind of session the app does not have');
select tests.refused($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'blue', 5, '2026-01-01') $$, 'five stripes on a coloured belt');
select tests.allowed($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'black', 6, '2026-01-01') $$, 'six degrees on a black belt');
select tests.refused($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'black', 7, '2026-01-01') $$, 'seven degrees');
select tests.refused($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'white', 0, '2025-01-01') $$, 'the same rank twice');
delete from public.promotions where belt = 'black';
update public.profiles set belt = 'white', stripes = 0 where id = auth.uid();
select tests.refused($$ insert into public.time_off (user_id, start_date, end_date, reason) values (auth.uid(), '2026-09-10', '2026-09-01', 'travel') $$, 'time off that ends before it starts');
select tests.refused($$ update public.techniques set link = 'javascript:alert(1)' $$, 'a link that is not a web address');
select tests.refused($$ update public.profiles set stripes = 5 where id = auth.uid() $$, 'a rank of white belt with five stripes');
select tests.refused(format($$ update public.profiles set id = %L where id = auth.uid() $$, tests.id('nia')), 'changing whose profile it is');
select tests.refused($$ insert into public.matches (competition_id, position, result, method) select id, 2, 'draw', 'points' from public.competitions $$, 'a draw with a method');
select tests.refused($$ insert into public.matches (competition_id, position, result, method, technique_id) select c.id, 2, 'loss', 'submission', t.id from public.competitions c, public.techniques t $$, 'a loss linked to the journal');

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
select tests.refused(format($$ update public.profiles set belt = 'black', stripes = 0 where id = %L $$, tests.id('sam')), 'changing another student''s rank');
select tests.refused(format($$ insert into public.matches (competition_id, position, result, method) values (%L, 2, 'win', 'points') $$, :'sam_competition'), 'adding a match to another student''s competition');

-- Sue's own technique cannot be hung on Sam's session, nor Sam's on hers.
insert into public.techniques (user_id, name, position, status, added_on, status_since)
values (tests.id('sue'), 'Kimura', 'guard', 'learning', '2026-01-01', '2026-01-01') returning id as sue_kimura \gset
insert into public.sessions (user_id, date, duration_minutes, type)
values (tests.id('sue'), '2026-11-02', 60, 'nogi') returning id as sue_session \gset
select tests.refused(format($$ insert into public.session_techniques values (%L, %L, true, false) $$, :'sam_session', :'sue_kimura'), 'ticking your technique on another student''s session');
select tests.refused(format($$ insert into public.session_techniques values (%L, %L, true, false) $$, :'sue_session', :'sam_armbar'), 'ticking another student''s technique on your session');

-- ---------------------------------------------------------------------------------------------
-- A coach reads their students' records, and records their promotions, and nothing more
-- ---------------------------------------------------------------------------------------------
select tests.be('cal');
select tests.expect((select count(*) = 2 from public.sessions), 'a coach reads the sessions of both students');
select tests.expect((select count(*) = 1 from public.session_techniques), 'and what their sessions touched');
select tests.expect((select count(*) = 1 from public.matches), 'and their matches');
select tests.expect((select count(*) = 1 from public.time_off), 'and their time off');
select tests.expect((select count(*) = 4 from public.profiles), 'and the profiles of everyone in the academy');
select tests.refused($$ update public.sessions set notes = 'coach was here' $$, 'a coach editing a student''s session');
select tests.refused($$ delete from public.techniques $$, 'a coach deleting a student''s technique');
select tests.refused(format($$ insert into public.sessions (user_id, date, duration_minutes, type) values (%L, '2026-11-03', 60, 'gi') $$, tests.id('sam')), 'a coach logging a session for a student');
select tests.refused(format($$ update public.profiles set display_name = 'Renamed' where id = %L $$, tests.id('sam')), 'a coach editing a student''s profile');

select tests.allowed(format($$ insert into public.promotions (user_id, belt, stripes, date, promoted_by) values (%L, 'blue', 0, '2026-11-10', 'Coach Cal') $$, tests.id('sam')), 'a coach records a student''s promotion');
select tests.expect((select recorded_by = tests.id('cal') from public.promotions where belt = 'blue'), 'which says who entered it');
select tests.refused(format($$ update public.promotions set user_id = %L where belt = 'blue' $$, tests.id('sue')), 'moving a promotion to another student');
select tests.refused(format($$ insert into public.promotions (user_id, belt, stripes, date) values (%L, 'blue', 0, '2026-11-10') $$, tests.id('stu')), 'a coach promoting someone in another academy');

select tests.be('sam');
select tests.expect((select belt = 'blue' and stripes = 0 from public.profiles where id = auth.uid()), 'the coach''s promotion raised the student''s rank');
select tests.allowed($$ insert into public.promotions (user_id, belt, stripes, date) values (auth.uid(), 'white', 4, '2026-06-01') $$, 'back-dating a lower rank');
select tests.expect((select belt = 'blue' from public.profiles where id = auth.uid()), 'a lower promotion never lowers the rank');

-- ---------------------------------------------------------------------------------------------
-- Academies are sealed from each other
-- ---------------------------------------------------------------------------------------------
select tests.be('olga');
select tests.expect((select count(*) = 0 from public.sessions), 'an owner cannot read another academy''s sessions');
select tests.expect((select count(*) = 2 from public.profiles), 'an owner sees only their own academy''s people');
select tests.expect((select count(*) = 2 from public.memberships), 'and only its memberships');
select tests.refused(format($$ delete from public.memberships where academy_id = %L $$, :'ana_academy'), 'removing members of another academy');
select tests.refused(format($$ delete from public.academies where id = %L $$, :'ana_academy'), 'deleting another academy');

select tests.be('nia');
select tests.expect((select count(*) = 0 from public.academies), 'someone in no academy sees no academy');
select tests.expect((select count(*) = 1 from public.profiles), 'and only their own profile');

-- ---------------------------------------------------------------------------------------------
-- Leaving, and what goes when things are deleted
-- ---------------------------------------------------------------------------------------------
select tests.be('sue');
select tests.allowed($$ delete from public.memberships where user_id = auth.uid() $$, 'a student leaves');
select tests.be('cal');
select tests.expect((select count(*) = 1 from public.sessions), 'a coach no longer reads the record of a student who left');

select tests.be('sam');
select tests.allowed(format($$ delete from public.techniques where id = %L $$, :'sam_armbar'), 'deleting a technique');
select tests.expect((select count(*) = 0 from public.session_techniques), 'takes it off its sessions');
select tests.expect((select technique_id is null from public.matches), 'and unlinks it from its matches');
select tests.expect((select count(*) = 1 from public.sessions), 'and leaves the sessions');

select tests.be('ana');
select tests.allowed(format($$ delete from public.memberships where user_id = %L $$, tests.id('cal')), 'an owner removes a coach');
select tests.allowed(format($$ delete from public.academies where id = %L $$, :'ana_academy'), 'an owner closes their academy');
reset role;
select tests.expect((select count(*) = 0 from public.memberships where academy_id = :'ana_academy'), 'its memberships go with it');
select tests.expect((select count(*) = 2 from public.sessions), 'and nobody''s training record does');

delete from auth.users where id = tests.id('sam');
select tests.expect((select count(*) = 0 from public.sessions where user_id = tests.id('sam')), 'deleting an account deletes its record');

\echo access rules: all expectations met
