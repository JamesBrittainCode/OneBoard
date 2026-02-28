-- OneBoard schema for Supabase
-- Run this in Supabase SQL editor.

create table if not exists public.sessions (
  id bigint generated always as identity primary key,
  prompt text not null,
  join_code text not null unique,
  teacher_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  active boolean not null default true,
  board_mode text not null default 'categorized',
  anonymous_mode boolean not null default true,
  section_label_1 text not null default 'Strong Thinking',
  section_label_2 text not null default 'Needs Clarification',
  section_label_3 text not null default 'Misconception',
  submissions_frozen boolean not null default false,
  student_can_view_responses boolean not null default false,
  archived boolean not null default false,
  active_started_at timestamptz,
  timer_history jsonb not null default '[]'::jsonb
);

alter table public.sessions
  add column if not exists board_mode text not null default 'categorized',
  add column if not exists anonymous_mode boolean not null default true,
  add column if not exists section_label_1 text not null default 'Strong Thinking',
  add column if not exists section_label_2 text not null default 'Needs Clarification',
  add column if not exists section_label_3 text not null default 'Misconception',
  add column if not exists submissions_frozen boolean not null default false,
  add column if not exists student_can_view_responses boolean not null default false,
  add column if not exists archived boolean not null default false,
  add column if not exists active_started_at timestamptz,
  add column if not exists timer_history jsonb not null default '[]'::jsonb;

alter table public.sessions
  drop constraint if exists sessions_board_mode_check;
alter table public.sessions
  add constraint sessions_board_mode_check check (board_mode in ('categorized', 'open'));

create table if not exists public.responses (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.sessions(id) on delete cascade,
  student_id text not null,
  student_name text,
  content text not null,
  created_at timestamptz not null default now(),
  category text,
  constraint responses_category_check
    check (category is null or category in ('Strong Thinking', 'Needs Clarification', 'Misconception')),
  constraint responses_one_per_student unique (session_id, student_id)
);

alter table public.responses
  add column if not exists student_name text;

alter table public.sessions enable row level security;
alter table public.responses enable row level security;

-- Sessions: students can read active sessions by join code.
drop policy if exists "sessions_select_active" on public.sessions;
create policy "sessions_select_active"
  on public.sessions
  for select
  to anon, authenticated
  using (active = true or auth.uid() = teacher_user_id);

-- Sessions: only authenticated teacher can create own sessions.
drop policy if exists "sessions_insert_owner" on public.sessions;
create policy "sessions_insert_owner"
  on public.sessions
  for insert
  to authenticated
  with check (auth.uid() = teacher_user_id);

-- Sessions: only owner can update session.
drop policy if exists "sessions_update_owner" on public.sessions;
create policy "sessions_update_owner"
  on public.sessions
  for update
  to authenticated
  using (auth.uid() = teacher_user_id)
  with check (auth.uid() = teacher_user_id);

-- Responses: teachers can read responses for their own sessions.
drop policy if exists "responses_select_owner" on public.responses;
create policy "responses_select_owner"
  on public.responses
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = responses.session_id
        and s.teacher_user_id = auth.uid()
    )
  );

-- Responses: students can view responses if teacher enabled student view.
drop policy if exists "responses_select_student_view" on public.responses;
create policy "responses_select_student_view"
  on public.responses
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = responses.session_id
        and s.active = true
        and s.student_can_view_responses = true
    )
  );

-- Responses: any user (including anon) can submit once to an active session.
drop policy if exists "responses_insert_active_session" on public.responses;
create policy "responses_insert_active_session"
  on public.responses
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = responses.session_id
        and s.active = true
    )
  );

-- Responses: only owner teacher can categorize responses.
drop policy if exists "responses_update_owner" on public.responses;
create policy "responses_update_owner"
  on public.responses
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = responses.session_id
        and s.teacher_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = responses.session_id
        and s.teacher_user_id = auth.uid()
    )
  );

-- Responses: only owner teacher can delete responses.
drop policy if exists "responses_delete_owner" on public.responses;
create policy "responses_delete_owner"
  on public.responses
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = responses.session_id
        and s.teacher_user_id = auth.uid()
    )
  );
