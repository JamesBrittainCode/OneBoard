import type { BoardMode, Category, ResponseCard, Session } from './types';
import { hasSupabaseEnv, supabase } from './supabase';

interface TeacherUser {
  id: string;
  email: string;
}

type SessionRow = {
  id: number;
  prompt: string;
  join_code: string;
  created_at: string;
  active: boolean;
  board_mode: BoardMode;
  anonymous_mode: boolean;
  section_label_1: string;
  section_label_2: string;
  section_label_3: string;
};

type ResponseRow = {
  id: number;
  session_id: number;
  content: string;
  created_at: string;
  category: Category;
  student_name: string | null;
};

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUBMIT_DEBOUNCE_MS = 1200;
const submitTimes = new Map<string, number>();

function sanitizeInput(raw = '') {
  return String(raw).trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ensureSupabaseConfigured() {
  if (!hasSupabaseEnv) {
    throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    prompt: row.prompt,
    joinCode: row.join_code,
    createdAt: row.created_at,
    active: row.active,
    boardMode: row.board_mode,
    anonymousMode: row.anonymous_mode,
    sectionLabels: [row.section_label_1, row.section_label_2, row.section_label_3]
  };
}

function toResponse(row: ResponseRow): ResponseCard {
  return {
    id: row.id,
    sessionId: row.session_id,
    content: row.content,
    createdAt: row.created_at,
    category: row.category,
    studentName: row.student_name
  };
}

function createJoinCode(length = 6) {
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return value;
}

async function getAuthUserOrThrow() {
  ensureSupabaseConfigured();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Please sign in first.');
  return data.user;
}

export async function registerTeacher(email: string, password: string) {
  ensureSupabaseConfigured();
  const { data, error } = await supabase.auth.signUp({
    email: sanitizeInput(email).toLowerCase(),
    password
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Could not create account.');
  if (!data.session) {
    throw new Error('Account created. Confirm your email, then log in.');
  }
  return {
    user: {
      id: data.user.id,
      email: data.user.email || ''
    }
  } as { user: TeacherUser };
}

export async function loginTeacher(email: string, password: string) {
  ensureSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: sanitizeInput(email).toLowerCase(),
    password
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Could not sign in.');
  return {
    user: {
      id: data.user.id,
      email: data.user.email || ''
    }
  } as { user: TeacherUser };
}

export async function logoutTeacher() {
  ensureSupabaseConfigured();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getMe() {
  const user = await getAuthUserOrThrow();
  return {
    user: {
      id: user.id,
      email: user.email || ''
    }
  } as { user: TeacherUser };
}

export async function createSession(prompt: string) {
  const user = await getAuthUserOrThrow();
  const safePrompt = sanitizeInput(prompt).slice(0, 400);
  if (!safePrompt) throw new Error('Prompt is required.');

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const joinCode = createJoinCode(6);
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        prompt: safePrompt,
        join_code: joinCode,
        active: true,
        teacher_user_id: user.id,
        board_mode: 'categorized',
        anonymous_mode: true,
        section_label_1: 'Strong Thinking',
        section_label_2: 'Needs Clarification',
        section_label_3: 'Misconception'
      })
      .select(
        'id,prompt,join_code,created_at,active,board_mode,anonymous_mode,section_label_1,section_label_2,section_label_3'
      )
      .single();

    if (!error && data) {
      return { session: toSession(data), categories: [] as string[] };
    }

    if (error?.code === '23505') {
      continue;
    }

    throw new Error(error?.message || 'Could not create session.');
  }

  throw new Error('Could not generate a unique join code.');
}

export async function getSession(joinCode: string) {
  ensureSupabaseConfigured();
  const code = sanitizeInput(joinCode).toUpperCase();
  const { data, error } = await supabase
    .from('sessions')
    .select(
      'id,prompt,join_code,created_at,active,board_mode,anonymous_mode,section_label_1,section_label_2,section_label_3'
    )
    .eq('join_code', code)
    .eq('active', true)
    .single();

  if (error || !data) throw new Error('Session not found or ended.');
  return { session: toSession(data) };
}

export async function getTeacherSession(joinCode: string) {
  const user = await getAuthUserOrThrow();
  const code = sanitizeInput(joinCode).toUpperCase();

  const { data: sessionRow, error: sessionError } = await supabase
    .from('sessions')
    .select(
      'id,prompt,join_code,created_at,active,board_mode,anonymous_mode,section_label_1,section_label_2,section_label_3'
    )
    .eq('join_code', code)
    .eq('teacher_user_id', user.id)
    .single();

  if (sessionError || !sessionRow) {
    throw new Error('Session not found or unauthorized.');
  }

  const { data: responseRows, error: responseError } = await supabase
    .from('responses')
    .select('id,session_id,content,created_at,category,student_name')
    .eq('session_id', sessionRow.id)
    .order('created_at', { ascending: false });

  if (responseError) throw new Error(responseError.message);

  return {
    session: toSession(sessionRow),
    responses: (responseRows || []).map((row) => toResponse(row as ResponseRow)),
    studentCount: 0
  };
}

export async function updateSessionSettings(
  joinCode: string,
  settings: {
    boardMode?: BoardMode;
    anonymousMode?: boolean;
    sectionLabels?: [string, string, string];
  }
) {
  const user = await getAuthUserOrThrow();
  const code = sanitizeInput(joinCode).toUpperCase();

  const updates: Record<string, unknown> = {};

  if (settings.boardMode) {
    updates.board_mode = settings.boardMode;
  }
  if (typeof settings.anonymousMode === 'boolean') {
    updates.anonymous_mode = settings.anonymousMode;
  }
  if (settings.sectionLabels) {
    updates.section_label_1 = sanitizeInput(settings.sectionLabels[0]).slice(0, 40) || 'Strong Thinking';
    updates.section_label_2 = sanitizeInput(settings.sectionLabels[1]).slice(0, 40) || 'Needs Clarification';
    updates.section_label_3 = sanitizeInput(settings.sectionLabels[2]).slice(0, 40) || 'Misconception';
  }

  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('join_code', code)
    .eq('teacher_user_id', user.id);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function validateSession(joinCode: string) {
  return getSession(joinCode);
}

export async function submitResponse(
  joinCode: string,
  studentId: string,
  content: string,
  studentName?: string
) {
  ensureSupabaseConfigured();
  const code = sanitizeInput(joinCode).toUpperCase();
  const safeStudentId = sanitizeInput(studentId).slice(0, 80);
  const safeContent = sanitizeInput(content).slice(0, 250);
  const safeStudentName = sanitizeInput(studentName || '').slice(0, 80) || null;

  if (!safeStudentId) throw new Error('Missing student identifier.');
  if (!safeContent) throw new Error('Response is required.');

  const debounceKey = `${code}:${safeStudentId}`;
  const now = Date.now();
  const last = submitTimes.get(debounceKey) || 0;
  if (now - last < SUBMIT_DEBOUNCE_MS) {
    throw new Error('Please wait before trying again.');
  }
  submitTimes.set(debounceKey, now);

  const { data: sessionRow, error: sessionError } = await supabase
    .from('sessions')
    .select('id,anonymous_mode')
    .eq('join_code', code)
    .eq('active', true)
    .single<{ id: number; anonymous_mode: boolean }>();

  if (sessionError || !sessionRow) throw new Error('Session has ended.');
  if (!sessionRow.anonymous_mode && !safeStudentName) {
    throw new Error('Please enter your name.');
  }

  const { error } = await supabase.from('responses').insert({
    session_id: sessionRow.id,
    student_id: safeStudentId,
    content: safeContent,
    category: null,
    student_name: sessionRow.anonymous_mode ? null : safeStudentName
  });

  if (error?.code === '23505') {
    throw new Error('Response already submitted.');
  }
  if (error) {
    throw new Error(error?.message || 'Could not submit response.');
  }

  return { ok: true };
}

export async function updateResponseCategory(
  joinCode: string,
  responseId: number,
  category: Category
) {
  const user = await getAuthUserOrThrow();
  const code = sanitizeInput(joinCode).toUpperCase();

  const { data: sessionRow, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('join_code', code)
    .eq('teacher_user_id', user.id)
    .eq('active', true)
    .single();

  if (sessionError || !sessionRow) {
    throw new Error('Session not found or unauthorized.');
  }

  const { error } = await supabase
    .from('responses')
    .update({ category })
    .eq('id', responseId)
    .eq('session_id', sessionRow.id);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function endSession(joinCode: string) {
  const user = await getAuthUserOrThrow();
  const code = sanitizeInput(joinCode).toUpperCase();

  const { error } = await supabase
    .from('sessions')
    .update({ active: false })
    .eq('join_code', code)
    .eq('teacher_user_id', user.id)
    .eq('active', true);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function exportBoardCsv(joinCode: string) {
  const board = await getTeacherSession(joinCode);
  const header = [
    'join_code',
    'prompt',
    'response_id',
    'student_name',
    'content',
    'category',
    'created_at'
  ];
  const rows = board.responses.map((row) =>
    [
      board.session.joinCode,
      board.session.prompt,
      String(row.id),
      row.studentName || '',
      row.content,
      row.category || '',
      row.createdAt
    ].map((value) => String(value))
  );

  const csv = [header, ...rows]
    .map((cols) => cols.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  return csv;
}
