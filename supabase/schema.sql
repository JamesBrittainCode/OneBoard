-- OneBoard schema for Supabase
-- Run this in Supabase SQL editor.

create table if not exists public.sessions (
  id bigint generated always as identity primary key,
  prompt text not null,
  join_code text not null unique,
  teacher_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  active boolean not null default true
);

create table if not exists public.responses (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.sessions(id) on delete cascade,
  student_id text not null,
  content text not null,
  created_at timestamptz not null default now(),
  category text,
  constraint responses_category_check
    check (category is null or category in ('Strong Thinking', 'Needs Clarification', 'Misconception')),
  constraint responses_one_per_student unique (session_id, student_id)
);

alter table public.sessions enable row level security;
alter table public.responses enable row level security;

-- Sessions: students can read active sessions by join code.
create policy "sessions_select_active"
  on public.sessions
  for select
  using (active = true or auth.uid() = teacher_user_id);

-- Sessions: only authenticated teacher can create own sessions.
create policy "sessions_insert_owner"
  on public.sessions
  for insert
  to authenticated
  with check (auth.uid() = teacher_user_id);

-- Sessions: only owner can update session.
create policy "sessions_update_owner"
  on public.sessions
  for update
  to authenticated
  using (auth.uid() = teacher_user_id)
  with check (auth.uid() = teacher_user_id);

-- Responses: teachers can read responses for their own sessions.
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

-- Responses: any user (including anon) can submit once to an active session.
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
