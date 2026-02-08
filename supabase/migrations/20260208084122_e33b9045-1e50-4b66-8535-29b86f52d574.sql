-- Enums (idempotent)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'round_status' and typnamespace = 'public'::regnamespace) then
    create type public.round_status as enum ('locked','unlocked','closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'app_role' and typnamespace = 'public'::regnamespace) then
    create type public.app_role as enum ('admin');
  end if;
end $$;

-- Shared updated_at trigger
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  employee_id text not null unique,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profiles_employee_id on public.profiles (employee_id);

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_profiles_updated_at'
  ) then
    create trigger set_profiles_updated_at
    before update on public.profiles
    for each row execute function public.update_updated_at_column();
  end if;
end $$;

alter table public.profiles enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Profiles are readable by owner') then
    create policy "Profiles are readable by owner" on public.profiles for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Profiles are insertable by owner') then
    create policy "Profiles are insertable by owner" on public.profiles for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Profiles are updatable by owner') then
    create policy "Profiles are updatable by owner" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Roles
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  );
$$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_roles' and policyname='Users can read their roles') then
    create policy "Users can read their roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);
  end if;
end $$;

-- Quiz rounds
create table if not exists public.quiz_rounds (
  id uuid primary key default gen_random_uuid(),
  round_no int not null,
  title text not null,
  topic_preview text,
  status public.round_status not null default 'locked',
  unlocked_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_no)
);
create index if not exists idx_quiz_rounds_status on public.quiz_rounds (status);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='set_quiz_rounds_updated_at') then
    create trigger set_quiz_rounds_updated_at
    before update on public.quiz_rounds
    for each row execute function public.update_updated_at_column();
  end if;
end $$;

alter table public.quiz_rounds enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_rounds' and policyname='Rounds are readable by authenticated') then
    create policy "Rounds are readable by authenticated" on public.quiz_rounds for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_rounds' and policyname='Admins manage rounds') then
    create policy "Admins manage rounds" on public.quiz_rounds for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

-- Questions
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.quiz_rounds(id) on delete cascade,
  sort_order int not null default 1,
  prompt text not null,
  image_url text,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_quiz_questions_round on public.quiz_questions (round_id, sort_order);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='set_quiz_questions_updated_at') then
    create trigger set_quiz_questions_updated_at
    before update on public.quiz_questions
    for each row execute function public.update_updated_at_column();
  end if;
end $$;

alter table public.quiz_questions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_questions' and policyname='Questions readable by authenticated') then
    create policy "Questions readable by authenticated" on public.quiz_questions for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_questions' and policyname='Admins manage questions') then
    create policy "Admins manage questions" on public.quiz_questions for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

-- Correct answers (admin-only)
create table if not exists public.quiz_question_answers (
  question_id uuid primary key references public.quiz_questions(id) on delete cascade,
  correct_option char(1) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='set_quiz_question_answers_updated_at') then
    create trigger set_quiz_question_answers_updated_at
    before update on public.quiz_question_answers
    for each row execute function public.update_updated_at_column();
  end if;
end $$;

alter table public.quiz_question_answers enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_question_answers' and policyname='Admins manage answers') then
    create policy "Admins manage answers" on public.quiz_question_answers for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

-- Round attempts
create table if not exists public.quiz_round_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  round_id uuid not null references public.quiz_rounds(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms int,
  tab_switch_warnings int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, round_id)
);
create index if not exists idx_attempts_round on public.quiz_round_attempts (round_id, completed_at);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='set_quiz_round_attempts_updated_at') then
    create trigger set_quiz_round_attempts_updated_at
    before update on public.quiz_round_attempts
    for each row execute function public.update_updated_at_column();
  end if;
end $$;

alter table public.quiz_round_attempts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_round_attempts' and policyname='Attempts owner read') then
    create policy "Attempts owner read" on public.quiz_round_attempts for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_round_attempts' and policyname='Attempts owner write') then
    create policy "Attempts owner write" on public.quiz_round_attempts for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_round_attempts' and policyname='Attempts owner update') then
    create policy "Attempts owner update" on public.quiz_round_attempts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_round_attempts' and policyname='Admins can read all attempts') then
    create policy "Admins can read all attempts" on public.quiz_round_attempts for select to authenticated using (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

-- Answers
create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  round_id uuid not null references public.quiz_rounds(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  selected_option char(1) not null,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, question_id)
);
create index if not exists idx_answers_round_user on public.quiz_answers (round_id, user_id);
create index if not exists idx_answers_question on public.quiz_answers (question_id);

alter table public.quiz_answers enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_answers' and policyname='Answers owner read') then
    create policy "Answers owner read" on public.quiz_answers for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_answers' and policyname='Answers owner insert') then
    create policy "Answers owner insert" on public.quiz_answers for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_answers' and policyname='Answers owner update') then
    create policy "Answers owner update" on public.quiz_answers for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_answers' and policyname='Admins can read all answers') then
    create policy "Admins can read all answers" on public.quiz_answers for select to authenticated using (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

-- Leaderboard view (aggregated)
create or replace view public.leaderboard
with (security_invoker=on)
as
select
  p.employee_id,
  p.full_name,
  p.user_id,
  coalesce(sum(
    case
      when qans.correct_option is not null and qa.selected_option = qans.correct_option then 1
      else 0
    end
  ), 0)::int as total_correct,
  count(qa.id)::int as total_answered,
  coalesce(sum(att.duration_ms), 0)::bigint as total_duration_ms,
  max(att.completed_at) as last_completed_at
from public.profiles p
left join public.quiz_round_attempts att
  on att.user_id = p.user_id
left join public.quiz_answers qa
  on qa.user_id = p.user_id
left join public.quiz_question_answers qans
  on qans.question_id = qa.question_id
group by p.employee_id, p.full_name, p.user_id;

-- Realtime publications (ignore duplicates)
do $$
begin
  begin
    alter publication supabase_realtime add table public.quiz_rounds;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.quiz_round_attempts;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.quiz_answers;
  exception when duplicate_object then null;
  end;
end $$;
