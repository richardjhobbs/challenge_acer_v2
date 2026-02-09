-- AGE BAND ENUM (must match frontend strings)
create type age_band as enum (
  'Under 8',
  '8–10',
  '11–13',
  '14–16',
  '16+'
);

-- PLAYER PROFILES
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text,
  age_band age_band not null,
  created_at timestamptz not null default now(),
  constraint username_length check (char_length(username) between 3 and 20),
  constraint username_format check (username ~ '^[A-Za-z0-9_]+$')
);

create index profiles_username_idx on public.profiles(username);

-- DAILY SCORES
create table public.daily_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_date date not null,
  total_score integer not null default 0,
  challenge_scores jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint one_score_per_user_per_day unique (user_id, game_date),
  constraint challenge_scores_is_array check (jsonb_typeof(challenge_scores) = 'array'),
  constraint challenge_scores_max_5 check (jsonb_array_length(challenge_scores) <= 5)
);

create index daily_scores_date_idx on public.daily_scores(game_date);
create index daily_scores_user_date_idx on public.daily_scores(user_id, game_date);

-- WEEKLY LEADERBOARD (ROLLING 7 DAYS)
create view public.leaderboard_weekly as
select
  p.username,
  p.age_band,
  sum(d.total_score)::int as score
from public.daily_scores d
join public.profiles p on p.id = d.user_id
where d.game_date >= (current_date - interval '6 days')::date
group by p.username, p.age_band
order by score desc;

-- MONTHLY LEADERBOARD (CALENDAR MONTH)
create view public.leaderboard_monthly as
select
  p.username,
  p.age_band,
  sum(d.total_score)::int as score
from public.daily_scores d
join public.profiles p on p.id = d.user_id
where d.game_date >= date_trunc('month', current_date)::date
and d.game_date < (date_trunc('month', current_date) + interval '1 month')::date
group by p.username, p.age_band
order by score desc;

-- ROW LEVEL SECURITY (DEMO MODE)
alter table public.profiles enable row level security;
alter table public.daily_scores enable row level security;

-- DEMO ONLY: public read/write access
create policy "public read profiles"
on public.profiles for select using (true);

create policy "public insert profiles"
on public.profiles for insert with check (true);

create policy "public read scores"
on public.daily_scores for select using (true);

create policy "public insert scores"
on public.daily_scores for insert with check (true);

comment on table public.profiles is
'DEMO MODE: public insert/select enabled. Replace with authenticated RLS before production.';

comment on table public.daily_scores is
'DEMO MODE: public insert/select enabled. Replace with authenticated RLS before production.';
