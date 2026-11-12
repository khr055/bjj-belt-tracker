-- Belt Tracker: the academy database.
--
-- Everyone in an academy signs in. A student owns their own training record; a coach of their
-- academy can read it and can record their promotions; an owner also manages who is a coach.
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
  -- Current rank. Stripes are stripes on a coloured belt (0 to 4), degrees on a black belt (0 to 6).
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
  -- Who entered it, when that was a coach and not the person themselves.
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

-- A person's own record, or that of someone they coach.
create function public.can_read(person uuid) returns boolean
language sql stable set search_path = public as $$
  select person = auth.uid() or coaches(person);
$$;

-- ---------------------------------------------------------------------------------------------
-- Things done on someone's behalf
-- ---------------------------------------------------------------------------------------------

-- Everyone who signs up gets a profile.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'display_name', 80), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A logged promotion can raise the current rank but never lowers it, as in the app. This is what
-- lets a coach's entry move a student's rank without the coach being able to edit the profile.
create function public.raise_rank() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  belts constant text[] := array['white', 'blue', 'purple', 'brown', 'black'];
begin
  update profiles
  set belt = new.belt, stripes = new.stripes
  where id = new.user_id
    and (
      belt is null
      or array_position(belts, new.belt) * 10 + new.stripes
         > array_position(belts, belt) * 10 + stripes
    );
  return new;
end;
$$;

create trigger promotions_raise_rank
  after insert or update of belt, stripes on public.promotions
  for each row execute function public.raise_rank();

-- A promotion cannot be moved to another person, and says who entered it for someone else.
create function public.stamp_promotion() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'A promotion cannot be moved to another person.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.recorded_by := case when auth.uid() = new.user_id then null else auth.uid() end;
  else
    new.recorded_by := old.recorded_by;
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

-- Profiles: yours, and those of the people you coach. Only you change yours. They are made by
-- the sign-up trigger and removed with the account, so there is no insert or delete policy.
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

-- Promotions: yours to read and write; a coach reads and writes those of the people they coach,
-- since in an academy it is the coach who awards them.
create policy promotions_read on public.promotions for select to authenticated
  using (can_read(user_id));
create policy promotions_insert on public.promotions for insert to authenticated
  with check (can_read(user_id));
create policy promotions_update on public.promotions for update to authenticated
  using (can_read(user_id)) with check (can_read(user_id));
create policy promotions_delete on public.promotions for delete to authenticated
  using (can_read(user_id));

-- Everything else in a record: yours to read and write, your coach's to read.
create policy techniques_read on public.techniques for select to authenticated
  using (can_read(user_id));
create policy techniques_write on public.techniques for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy sessions_read on public.sessions for select to authenticated
  using (can_read(user_id));
create policy sessions_write on public.sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy competitions_read on public.competitions for select to authenticated
  using (can_read(user_id));
create policy competitions_write on public.competitions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy time_off_read on public.time_off for select to authenticated
  using (can_read(user_id));
create policy time_off_write on public.time_off for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Rows that hang off a session or a competition follow the row they hang off.
create policy session_techniques_read on public.session_techniques for select to authenticated
  using (exists (select 1 from sessions s where s.id = session_id and can_read(s.user_id)));
create policy session_techniques_write on public.session_techniques for all to authenticated
  using (exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy matches_read on public.matches for select to authenticated
  using (exists (select 1 from competitions c where c.id = competition_id and can_read(c.user_id)));
create policy matches_write on public.matches for all to authenticated
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
  public.create_academy(text), public.join_academy(text), public.renew_invite(uuid)
  to authenticated;

-- An owner changes only a member's role, never whose membership it is.
revoke update on public.memberships from authenticated;
grant update (role) on public.memberships to authenticated;
-- A person changes their own name, rank and goal, not their id.
revoke update on public.profiles from authenticated;
grant update (display_name, belt, stripes, weekly_goal) on public.profiles to authenticated;
