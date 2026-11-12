-- Belt Tracker: the academy database.
--
-- Everyone in an academy signs in. A student owns their own training record and checks
-- themselves in by logging their own sessions. Only a coach or owner awards rank: they record
-- the promotions of the people in their academy, and a person's current rank is worked out from
-- those, so nobody can set their own. A coach sees names, ranks, promotion histories, attendance
-- and the dates of time off, and nothing else: techniques, session notes, what someone was caught
-- with, competitions and the reasons for time off stay private to the student. An owner is a
-- coach who also manages who is a coach.
-- Every table has row-level security, so these rules hold whatever the app asks for.
--
-- The shapes and limits mirror src/domain/types.ts and the validation beside it. The app still
-- checks the rules that need the whole history (a promotion history that only climbs, for one);
-- the database checks what a single row can be checked for.
--
-- Written for Supabase: it expects the `auth` schema, `auth.users` and `auth.uid()`.

-- ---------------------------------------------------------------------------------------------
-- People and academies
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  -- Current rank: the highest promotion the person has, or null when they have none. It is kept
  -- by the trigger on promotions and nobody writes it directly, because only coaches award rank.
  -- Stripes are stripes on a coloured belt (0 to 4), degrees on a black belt (0 to 6).
  belt text check (belt in ('white', 'blue', 'purple', 'brown', 'black')),
  stripes smallint,
  weekly_goal smallint check (weekly_goal between 1 and 7),
  created_at timestamptz not null default now(),
  constraint rank_is_whole check ((belt is null) = (stripes is null)),
  constraint stripes_fit_belt check (
    stripes is null or (stripes >= 0 and stripes <= case when belt = 'black' then 6 else 4 end)
  )
);

create table public.academies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

-- The code that lets someone join. Kept apart from the academy so that members can read the
-- academy without being able to read, and pass on, its code.
create table public.academy_invites (
  academy_id uuid primary key references public.academies (id) on delete cascade,
  code text not null unique
);

create table public.memberships (
  academy_id uuid not null references public.academies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'coach', 'owner')),
  joined_at timestamptz not null default now(),
  primary key (academy_id, user_id)
);
create index memberships_user on public.memberships (user_id);

-- ---------------------------------------------------------------------------------------------
-- A person's training record
-- ---------------------------------------------------------------------------------------------

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  belt text not null check (belt in ('white', 'blue', 'purple', 'brown', 'black')),
  stripes smallint not null,
  date date not null,
  promoted_by text check (char_length(promoted_by) <= 80),
  academy text check (char_length(academy) <= 80),
  -- The coach or owner who entered it. Null only once that person's account has gone.
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stripes_fit_belt check (
    stripes >= 0 and stripes <= case when belt = 'black' then 6 else 4 end
  ),
  -- A rank is reached once.
  unique (user_id, belt, stripes)
);
create index promotions_user_date on public.promotions (user_id, date);

create table public.techniques (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position text not null check (position in (
    'standing', 'guard', 'passing', 'half-guard', 'side-control', 'mount', 'back', 'turtle',
    'legs', 'other'
  )),
  status text not null check (status in ('learning', 'drilling', 'landing')),
  notes text check (char_length(notes) <= 500),
  link text check (char_length(link) <= 500 and link ~* '^https?://'),
  added_on date not null,
  status_since date not null,
  created_at timestamptz not null default now()
);
-- A name is used once in a journal, whatever its case.
create unique index techniques_user_name on public.techniques (user_id, lower(btrim(name)));

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  duration_minutes smallint not null check (duration_minutes between 1 and 600),
  type text not null check (type in ('gi', 'nogi')),
  kind text check (kind in ('class', 'open-mat', 'drilling', 'private')),
  -- Null when not recorded; 0 means no rolling.
  rounds smallint check (rounds between 0 and 30),
  notes text check (char_length(notes) <= 500),
  -- What the person was caught with, by name: the other person's submissions, not the journal's.
  caught_with text[] not null default '{}' check (cardinality(caught_with) <= 10),
  created_at timestamptz not null default now()
);
create index sessions_user_date on public.sessions (user_id, date);

-- The journal techniques a session touched: worked on, landed in rolling, or both.
create table public.session_techniques (
  session_id uuid not null references public.sessions (id) on delete cascade,
  technique_id uuid not null references public.techniques (id) on delete cascade,
  worked_on boolean not null default false,
  landed boolean not null default false,
  primary key (session_id, technique_id),
  constraint touched_somehow check (worked_on or landed)
);
create index session_techniques_technique on public.session_techniques (technique_id);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  type text not null check (type in ('gi', 'nogi')),
  division text check (char_length(division) <= 80),
  medal text check (medal in ('gold', 'silver', 'bronze')),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index competitions_user_date on public.competitions (user_id, date);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  -- The order they were fought in.
  position smallint not null check (position between 1 and 30),
  result text not null check (result in ('win', 'loss', 'draw')),
  method text check (method in ('submission', 'points', 'advantages', 'decision', 'disqualification')),
  submission text check (char_length(submission) <= 60),
  -- The journal technique a win by submission was won with. If the technique is deleted the app
  -- writes its name into `submission` first; this only stops a dangling link.
  technique_id uuid references public.techniques (id) on delete set null,
  opponent text check (char_length(opponent) <= 80),
  unique (competition_id, position),
  constraint draw_has_no_method check ((result = 'draw') = (method is null)),
  constraint only_a_submission_names_one check (
    method = 'submission' or (submission is null and technique_id is null)
  ),
  constraint only_a_win_links_the_journal check (technique_id is null or result = 'win')
);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  -- Null while the time off is still going on.
  end_date date,
  reason text not null check (reason in ('injury', 'illness', 'travel', 'other')),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  constraint ends_after_it_starts check (end_date is null or end_date >= start_date)
);
create index time_off_user on public.time_off (user_id, start_date);

-- ---------------------------------------------------------------------------------------------
-- Who may see whom
--
-- These run with the definer's rights so that a policy on `memberships` can ask about
-- memberships without the policy applying to its own question.
-- ---------------------------------------------------------------------------------------------

create function public.is_staff_of(academy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where academy_id = academy and user_id = auth.uid() and role in ('coach', 'owner')
  );
$$;

create function public.is_owner_of(academy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where academy_id = academy and user_id = auth.uid() and role = 'owner'
  );
$$;

create function public.is_member_of(academy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships where academy_id = academy and user_id = auth.uid()
  );
$$;

-- True when the signed-in person is a coach or owner of an academy the other person is in.
create function public.coaches(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from memberships mine
    join memberships theirs on theirs.academy_id = mine.academy_id
    where mine.user_id = auth.uid()
      and mine.role in ('coach', 'owner')
      and theirs.user_id = person
  );
$$;

-- A person's own profile and promotions, or those of someone they coach. The rest of a record
-- is private to its owner, so nothing else uses this.
create function public.can_read(person uuid) returns boolean
language sql stable set search_path = public as $$
  select person = auth.uid() or coaches(person);
$$;

-- ---------------------------------------------------------------------------------------------
-- Things done on someone's behalf
-- ---------------------------------------------------------------------------------------------

-- Everyone who signs up gets a profile. The app sends the name as `display_name`; signing in
-- with Google sends `full_name` or `name` instead, so the first of the three that is not blank
-- is used.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(
      left(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 80),
      left(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 80),
      left(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), 80),
      ''
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The current rank is always the highest promotion a person has, so it follows every change to
-- their promotions: a new one can raise it, and correcting or deleting a mistaken one lowers it
-- again. This is what lets a coach's entry move a student's rank without anyone, the student
-- included, being able to write the rank itself.
create function public.follow_promotions() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  belts constant text[] := array['white', 'blue', 'purple', 'brown', 'black'];
  person uuid;
begin
  -- A deleted row has only an old side and a new row only a new one.
  for person in
    select distinct changed.id
    from (values (case when tg_op <> 'INSERT' then old.user_id end),
                 (case when tg_op <> 'DELETE' then new.user_id end)) as changed (id)
    where changed.id is not null
  loop
    -- Two coaches entering promotions for the same person at once must not each miss the
    -- other's, so the second waits here until the first has finished.
    perform 1 from profiles where id = person for update;
    update profiles
    set (belt, stripes) = (
      select p.belt, p.stripes
      from promotions p
      where p.user_id = person
      -- Belts in the order they are earned, not the order of their names.
      order by array_position(belts, p.belt) desc, p.stripes desc
      limit 1
    )
    where id = person;
  end loop;
  return null;
end;
$$;

create trigger promotions_set_rank
  after insert or update or delete on public.promotions
  for each row execute function public.follow_promotions();

-- A new promotion always says which coach or owner entered it, whatever the request claims,
-- and a promotion cannot be moved to another person. Later changes leave `recorded_by` alone
-- here: the privileges below stop people changing it, and the database itself must still be
-- able to clear it when the recorder's account is deleted.
create function public.stamp_promotion() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.recorded_by := auth.uid();
  elsif new.user_id <> old.user_id then
    raise exception 'A promotion cannot be moved to another person.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger promotions_stamp
  before insert or update on public.promotions
  for each row execute function public.stamp_promotion();

-- A session's techniques, and a match's, must be the same person's as the session or match.
create function public.same_owner_session_technique() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select user_id from sessions where id = new.session_id)
     is distinct from (select user_id from techniques where id = new.technique_id) then
    raise exception 'That technique is not in this person''s journal.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger session_techniques_same_owner
  before insert or update on public.session_techniques
  for each row execute function public.same_owner_session_technique();

create function public.same_owner_match_technique() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.technique_id is not null
     and (select user_id from competitions where id = new.competition_id)
         is distinct from (select user_id from techniques where id = new.technique_id) then
    raise exception 'That technique is not in this person''s journal.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger matches_same_owner
  before insert or update on public.matches
  for each row execute function public.same_owner_match_technique();

-- Starts an academy, with the person who made it as its owner.
create function public.create_academy(academy_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to start an academy.' using errcode = '42501';
  end if;
  insert into academies (name) values (btrim(academy_name)) returning id into new_id;
  insert into academy_invites (academy_id, code)
  values (new_id, substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into memberships (academy_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end;
$$;

-- Joins the academy a code belongs to, as a student. Joining twice changes nothing.
create function public.join_academy(invite_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  found uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join an academy.' using errcode = '42501';
  end if;
  select academy_id into found from academy_invites where code = lower(btrim(invite_code));
  if found is null then
    raise exception 'That code does not match an academy.' using errcode = 'P0002';
  end if;
  insert into memberships (academy_id, user_id) values (found, auth.uid())
  on conflict do nothing;
  return found;
end;
$$;

-- Replaces an academy's code, so one that has got out stops working.
create function public.renew_invite(academy uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  new_code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  if not is_owner_of(academy) then
    raise exception 'Only an owner can change the code.' using errcode = '42501';
  end if;
  update academy_invites set code = new_code where academy_id = academy;
  return new_code;
end;
$$;

-- What a coach or owner may see of their members' training, and no more. The tables themselves
-- are closed to them, because a session also holds notes and what the person was caught with,
-- and time off holds its reason. These hand out only the columns a coach needs, only for people
-- who are in the academy now, and refuse anyone who is not its coach or owner.

-- Attendance: who trained when, for how long, and in what kind of session.
create function public.academy_attendance(academy uuid)
returns table (user_id uuid, date date, duration_minutes smallint, type text, kind text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff_of(academy) then
    raise exception 'Only a coach or owner can see an academy''s attendance.' using errcode = '42501';
  end if;
  return query
    select s.user_id, s.date, s.duration_minutes, s.type, s.kind
    from memberships m
    join sessions s on s.user_id = m.user_id
    where m.academy_id = academy;
end;
$$;

-- The dates of time off, so that someone who is away is not taken for someone who has gone
-- quiet. The end date is null while the time off is still going on.
create function public.academy_time_off(academy uuid)
returns table (user_id uuid, start_date date, end_date date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff_of(academy) then
    raise exception 'Only a coach or owner can see an academy''s time off.' using errcode = '42501';
  end if;
  return query
    select t.user_id, t.start_date, t.end_date
    from memberships m
    join time_off t on t.user_id = m.user_id
    where m.academy_id = academy;
end;
$$;

-- An academy always has an owner.
create function public.keep_an_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     -- When the whole academy is going, its memberships go with it.
     and exists (select 1 from academies where id = old.academy_id)
     and not exists (
       select 1 from memberships
       where academy_id = old.academy_id and role = 'owner' and user_id <> old.user_id
     ) then
    raise exception 'An academy needs at least one owner.' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_keep_an_owner
  before update or delete on public.memberships
  for each row execute function public.keep_an_owner();

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.academies enable row level security;
alter table public.academy_invites enable row level security;
alter table public.memberships enable row level security;
alter table public.promotions enable row level security;
alter table public.techniques enable row level security;
alter table public.sessions enable row level security;
alter table public.session_techniques enable row level security;
alter table public.competitions enable row level security;
alter table public.matches enable row level security;
alter table public.time_off enable row level security;

-- Profiles: yours, and those of the people you coach, which is where a coach reads names and
-- ranks. Only you change yours, and only your name and goal (see the privileges below). They are
-- made by the sign-up trigger and removed with the account, so there is no insert or delete
-- policy.
create policy profiles_read on public.profiles for select to authenticated
  using (can_read(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Academies: members read them; owners rename and remove them. They are made with
-- create_academy().
create policy academies_read on public.academies for select to authenticated
  using (is_member_of(id));
create policy academies_update on public.academies for update to authenticated
  using (is_owner_of(id)) with check (is_owner_of(id));
create policy academies_delete on public.academies for delete to authenticated
  using (is_owner_of(id));

-- The joining code: coaches and owners read it, to hand out. It changes through renew_invite().
create policy invites_read on public.academy_invites for select to authenticated
  using (is_staff_of(academy_id));

-- Memberships: you see your own, and staff see their academy's. People join with
-- join_academy(). An owner changes roles and removes people; anyone can leave.
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = auth.uid() or is_staff_of(academy_id));
create policy memberships_update on public.memberships for update to authenticated
  using (is_owner_of(academy_id)) with check (is_owner_of(academy_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (user_id = auth.uid() or is_owner_of(academy_id));

-- Promotions: you read your own, and a coach or owner reads those of the people in their
-- academy. Only a coach or owner writes them, because rank is awarded, not claimed: a student
-- cannot add, change or delete even their own. `coaches` is true for a coach's own id, so staff
-- record their own promotions; the head coach has nobody above them to do it.
create policy promotions_read on public.promotions for select to authenticated
  using (can_read(user_id));
create policy promotions_insert on public.promotions for insert to authenticated
  with check (coaches(user_id));
create policy promotions_update on public.promotions for update to authenticated
  using (coaches(user_id)) with check (coaches(user_id));
create policy promotions_delete on public.promotions for delete to authenticated
  using (coaches(user_id));

-- Everything else in a record is private: yours alone to read and to write. This is also what
-- lets a student check themselves in, by logging their own sessions. A coach reads none of these
-- tables; attendance and the dates of time off reach them through academy_attendance() and
-- academy_time_off().
create policy techniques_own on public.techniques for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy sessions_own on public.sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy competitions_own on public.competitions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy time_off_own on public.time_off for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Rows that hang off a session or a competition follow the row they hang off.
create policy session_techniques_own on public.session_techniques for all to authenticated
  using (exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy matches_own on public.matches for all to authenticated
  using (exists (select 1 from competitions c where c.id = competition_id and c.user_id = auth.uid()))
  with check (exists (select 1 from competitions c where c.id = competition_id and c.user_id = auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Privileges
--
-- Signed-in people reach the tables, and the policies above decide the rows. Someone who is not
-- signed in reaches nothing.
-- ---------------------------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;

grant select, update on public.profiles to authenticated;
grant select, update, delete on public.academies to authenticated;
grant select on public.academy_invites to authenticated;
grant select, update, delete on public.memberships to authenticated;
grant select, insert, update, delete on
  public.promotions, public.techniques, public.sessions, public.session_techniques,
  public.competitions, public.matches, public.time_off
  to authenticated;

grant execute on function
  public.is_staff_of(uuid), public.is_owner_of(uuid), public.is_member_of(uuid),
  public.coaches(uuid), public.can_read(uuid),
  public.create_academy(text), public.join_academy(text), public.renew_invite(uuid),
  public.academy_attendance(uuid), public.academy_time_off(uuid)
  to authenticated;

-- An owner changes only a member's role, never whose membership it is.
revoke update on public.memberships from authenticated;
grant update (role) on public.memberships to authenticated;
-- A coach corrects what a promotion says, not whose it is or who recorded it.
revoke update on public.promotions from authenticated;
grant update (belt, stripes, date, promoted_by, academy) on public.promotions to authenticated;
-- A person changes their own name and goal. Not their id, and not their rank: that follows the
-- promotions a coach records.
revoke update on public.profiles from authenticated;
grant update (display_name, weekly_goal) on public.profiles to authenticated;
