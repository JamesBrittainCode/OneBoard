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
  submissions_frozen: boolean;
  student_can_view_responses: boolean;
  archived: boolean;
  active_started_at: string | null;
  timer_history: unknown;
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
const PROFANITY_PATTERNS: RegExp[] = [
  /\bfuck(?:er|ing|ed|s)?\b/gi,
  /\bshit(?:ty|ting|s)?\b/gi,
  /\bbitch(?:es)?\b/gi,
  /\basshole(?:s)?\b/gi,
  /\bbastard(?:s)?\b/gi
];

function sanitizeInput(raw = '') {
  return String(raw).trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function censorProfanity(raw = '') {
  let value = String(raw);
  for (const pattern of PROFANITY_PATTERNS) {
    value = value.replace(pattern, (match) => '*'.repeat(match.length));
  }
  return value;
}

function ensureSupabaseConfigured() {
  if (!hasSupabaseEnv) {
    throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
}

function normalizeTimerHistory(value: unknown): Session['timerHistory'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = item as { startedAt?: string; endedAt?: string; seconds?: number };
      if (!row.startedAt || !row.endedAt || typeof row.seconds !== 'number') return null;
      return {
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        seconds: Math.max(0, Math.floor(row.seconds))
      };
    })
    .filter((item): item is { startedAt: string; endedAt: string; seconds: number } => item !== null);
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
    sectionLabels: [row.section_label_1, row.section_label_2, row.section_label_3],
    submissionsFrozen: row.submissions_frozen,
    studentCanViewResponses: row.student_can_view_responses,
    archived: row.archived,
    activeStartedAt: row.active_started_at,
    timerHistory: normalizeTimerHistory(row.timer_history)
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

function sessionSelectFields() {
  return [
    'id',
    'prompt',
    'join_code',
    'created_at',
    'active',
    'board_mode',
    'anonymous_mode',
    'section_label_1',
    'section_label_2',
    'section_label_3',
    'submissions_frozen',
    'student_can_view_responses',
    'archived',
    'active_started_at',
    'timer_history'
  ].join(',');
}

async function getAuthUserOrThrow() {
  ensureSupabaseConfigured();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Please sign in first.');
  return data.user;
}

async function getOwnedSessionByCode(joinCode: string) {
  const user = await getAuthUserOrThrow();
  const code = sanitizeInput(joinCode).toUpperCase();

  const { data: sessionRow, error: sessionError } = await supabase
    .from('sessions')
    .select(sessionSelectFields())
    .eq('join_code', code)
    .eq('teacher_user_id', user.id)
    .single();

  if (sessionError || !sessionRow) throw new Error('Session not found or unauthorized.');
  return sessionRow as unknown as SessionRow;
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

export async function listTeacherSessions() {
  const user = await getAuthUserOrThrow();
  const { data, error } = await supabase
    .from('sessions')
    .select(sessionSelectFields())
    .eq('teacher_user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map((row) => toSession(row as unknown as SessionRow));
}

export async function createSession(
  prompt: string,
  options?: {
    boardMode?: BoardMode;
    anonymousMode?: boolean;
    sectionLabels?: [string, string, string];
  }
) {
  const user = await getAuthUserOrThrow();
  const safePrompt = sanitizeInput(prompt).slice(0, 400);
  if (!safePrompt) throw new Error('Prompt is required.');
  const sectionLabels = options?.sectionLabels || [
    'Strong Thinking',
    'Needs Clarification',
    'Misconception'
  ];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const joinCode = createJoinCode(6);
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        prompt: safePrompt,
        join_code: joinCode,
        active: true,
        teacher_user_id: user.id,
        board_mode: options?.boardMode || 'categorized',
        anonymous_mode: options?.anonymousMode ?? true,
        section_label_1: sanitizeInput(sectionLabels[0]).slice(0, 40) || 'Strong Thinking',
        section_label_2: sanitizeInput(sectionLabels[1]).slice(0, 40) || 'Needs Clarification',
        section_label_3: sanitizeInput(sectionLabels[2]).slice(0, 40) || 'Misconception',
        submissions_frozen: false,
        student_can_view_responses: false,
        archived: false,
        active_started_at: new Date().toISOString(),
        timer_history: []
      })
      .select(sessionSelectFields())
      .single();

    if (!error && data) return { session: toSession(data as unknown as SessionRow), categories: [] as string[] };
    if (error?.code === '23505') continue;
    throw new Error(error?.message || 'Could not create session.');
  }

  throw new Error('Could not generate a unique join code.');
}

export async function getSession(joinCode: string) {
  ensureSupabaseConfigured();
  const code = sanitizeInput(joinCode).toUpperCase();
  const { data, error } = await supabase
    .from('sessions')
    .select(sessionSelectFields())
    .eq('join_code', code)
    .eq('active', true)
    .single();

  if (error || !data) throw new Error('Session not found or ended.');
  return { session: toSession(data as unknown as SessionRow) };
}

export async function getTeacherSession(joinCode: string) {
  const sessionRow = await getOwnedSessionByCode(joinCode);

  const { data: responseRows, error: responseError } = await supabase
    .from('responses')
    .select('id,session_id,content,created_at,category,student_name')
    .eq('session_id', sessionRow.id)
    .order('created_at', { ascending: false });

  if (responseError) throw new Error(responseError.message);

  return {
    session: toSession(sessionRow),
    responses: (responseRows || []).map((row) => toResponse(row as unknown as ResponseRow)),
    studentCount: 0
  };
}

export async function getStudentVisibleResponses(joinCode: string) {
  ensureSupabaseConfigured();
  const code = sanitizeInput(joinCode).toUpperCase();

  const { data: sessionRow, error: sessionError } = await supabase
    .from('sessions')
    .select(sessionSelectFields())
    .eq('join_code', code)
    .eq('active', true)
    .single();

  if (sessionError || !sessionRow) throw new Error('Session not found or ended.');

  const session = toSession(sessionRow as unknown as SessionRow);
  if (!session.studentCanViewResponses) return { responses: [] as ResponseCard[] };

  const { data: responseRows, error: responseError } = await supabase
    .from('responses')
    .select('id,session_id,content,created_at,category,student_name')
    .eq('session_id', session.id)
    .order('created_at', { ascending: false });

  if (responseError) throw new Error(responseError.message);
  return { responses: (responseRows || []).map((row) => toResponse(row as unknown as ResponseRow)) };
}

export async function updateSessionSettings(
  joinCode: string,
  settings: {
    boardMode?: BoardMode;
    anonymousMode?: boolean;
    sectionLabels?: [string, string, string];
    submissionsFrozen?: boolean;
    studentCanViewResponses?: boolean;
  }
) {
  const sessionRow = await getOwnedSessionByCode(joinCode);

  const updates: Record<string, unknown> = {};

  if (settings.boardMode) updates.board_mode = settings.boardMode;
  if (typeof settings.anonymousMode === 'boolean') updates.anonymous_mode = settings.anonymousMode;
  if (typeof settings.submissionsFrozen === 'boolean') {
    updates.submissions_frozen = settings.submissionsFrozen;
  }
  if (typeof settings.studentCanViewResponses === 'boolean') {
    updates.student_can_view_responses = settings.studentCanViewResponses;
  }
  if (settings.sectionLabels) {
    updates.section_label_1 = sanitizeInput(settings.sectionLabels[0]).slice(0, 40) || 'Strong Thinking';
    updates.section_label_2 =
      sanitizeInput(settings.sectionLabels[1]).slice(0, 40) || 'Needs Clarification';
    updates.section_label_3 = sanitizeInput(settings.sectionLabels[2]).slice(0, 40) || 'Misconception';
  }

  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await supabase.from('sessions').update(updates).eq('id', sessionRow.id);
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
  const safeContent = censorProfanity(sanitizeInput(content)).slice(0, 250);
  const safeStudentName = sanitizeInput(studentName || '').slice(0, 80) || null;

  if (!safeStudentId) throw new Error('Missing student identifier.');
  if (!safeContent) throw new Error('Response is required.');

  const debounceKey = `${code}:${safeStudentId}`;
  const now = Date.now();
  const last = submitTimes.get(debounceKey) || 0;
  if (now - last < SUBMIT_DEBOUNCE_MS) throw new Error('Please wait before trying again.');
  submitTimes.set(debounceKey, now);

  const { data: sessionRow, error: sessionError } = await supabase
    .from('sessions')
    .select('id,anonymous_mode,submissions_frozen')
    .eq('join_code', code)
    .eq('active', true)
    .single<{ id: number; anonymous_mode: boolean; submissions_frozen: boolean }>();

  if (sessionError || !sessionRow) throw new Error('Session has ended.');
  if (sessionRow.submissions_frozen) throw new Error('Submissions are currently frozen by the teacher.');
  if (!sessionRow.anonymous_mode && !safeStudentName) throw new Error('Please enter your name.');

  const { error } = await supabase.from('responses').insert({
    session_id: sessionRow.id,
    student_id: safeStudentId,
    content: safeContent,
    category: null,
    student_name: sessionRow.anonymous_mode ? null : safeStudentName
  });

  if (error?.code === '23505') throw new Error('Response already submitted.');
  if (error) throw new Error(error?.message || 'Could not submit response.');

  return { ok: true };
}

export async function updateResponseCategory(
  joinCode: string,
  responseId: number,
  category: Category
) {
  const sessionRow = await getOwnedSessionByCode(joinCode);
  if (!sessionRow.active) throw new Error('Session not active.');

  const { error } = await supabase
    .from('responses')
    .update({ category })
    .eq('id', responseId)
    .eq('session_id', sessionRow.id);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteResponse(joinCode: string, responseId: number) {
  const sessionRow = await getOwnedSessionByCode(joinCode);
  if (!sessionRow.active) throw new Error('Session not active.');

  const { error } = await supabase
    .from('responses')
    .delete()
    .eq('id', responseId)
    .eq('session_id', sessionRow.id);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function endSession(joinCode: string) {
  const sessionRow = await getOwnedSessionByCode(joinCode);
  if (!sessionRow.active) return { ok: true };

  const now = new Date().toISOString();
  const startedAt = sessionRow.active_started_at || sessionRow.created_at;
  const seconds = Math.max(0, Math.floor((Date.parse(now) - Date.parse(startedAt)) / 1000));
  const timerHistory = normalizeTimerHistory(sessionRow.timer_history).concat({
    startedAt,
    endedAt: now,
    seconds
  });

  const { error } = await supabase
    .from('sessions')
    .update({
      active: false,
      submissions_frozen: false,
      active_started_at: null,
      timer_history: timerHistory
    })
    .eq('id', sessionRow.id);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function reopenSession(joinCode: string) {
  const sessionRow = await getOwnedSessionByCode(joinCode);

  const { error } = await supabase
    .from('sessions')
    .update({
      active: true,
      archived: false,
      submissions_frozen: false,
      active_started_at: new Date().toISOString()
    })
    .eq('id', sessionRow.id);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function archiveSession(joinCode: string) {
  const sessionRow = await getOwnedSessionByCode(joinCode);

  const now = new Date().toISOString();
  let timerHistory = normalizeTimerHistory(sessionRow.timer_history);

  if (sessionRow.active) {
    const startedAt = sessionRow.active_started_at || sessionRow.created_at;
    const seconds = Math.max(0, Math.floor((Date.parse(now) - Date.parse(startedAt)) / 1000));
    timerHistory = timerHistory.concat({
      startedAt,
      endedAt: now,
      seconds
    });
  }

  const { error } = await supabase
    .from('sessions')
    .update({
      active: false,
      archived: true,
      submissions_frozen: false,
      active_started_at: null,
      timer_history: timerHistory
    })
    .eq('id', sessionRow.id);

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
