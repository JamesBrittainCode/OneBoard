const SESSION_KEY = 'oneboard:teacher-sessions';

export function getStudentId(joinCode: string) {
  const key = `oneboard:student-id:${joinCode}`;
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

export function getSubmissionStatus(joinCode: string) {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(`oneboard:submitted:${joinCode}`) === '1';
}

export function setSubmissionStatus(joinCode: string, submitted: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`oneboard:submitted:${joinCode}`, submitted ? '1' : '0');
}

export function recordTeacherSession(joinCode: string, prompt: string) {
  if (typeof window === 'undefined') return;
  const existing = JSON.parse(window.localStorage.getItem(SESSION_KEY) || '[]') as Array<{
    joinCode: string;
    prompt: string;
    createdAt: string;
  }>;

  const next = [{ joinCode, prompt, createdAt: new Date().toISOString() }]
    .concat(existing.filter((item) => item.joinCode !== joinCode))
    .slice(0, 10);

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
}

export function getTeacherSessions() {
  if (typeof window === 'undefined') return [] as Array<{ joinCode: string; prompt: string; createdAt: string }>;
  return JSON.parse(window.localStorage.getItem(SESSION_KEY) || '[]') as Array<{
    joinCode: string;
    prompt: string;
    createdAt: string;
  }>;
}
