import type { Category, ResponseCard, Session } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface TeacherUser {
  id: number;
  email: string;
  created_at: string;
}

async function parseResponse<T>(response: globalThis.Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || 'Request failed');
  }
  return data as T;
}

function authHeader(authToken: string) {
  return { Authorization: `Bearer ${authToken}` };
}

export async function registerTeacher(email: string, password: string) {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return parseResponse<{ user: TeacherUser; token: string }>(response);
}

export async function loginTeacher(email: string, password: string) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return parseResponse<{ user: TeacherUser; token: string }>(response);
}

export async function getMe(authToken: string) {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    method: 'GET',
    headers: authHeader(authToken),
    cache: 'no-store'
  });
  return parseResponse<{ user: TeacherUser }>(response);
}

export async function createSession(prompt: string, authToken: string) {
  const response = await fetch(`${API_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(authToken) },
    body: JSON.stringify({ prompt })
  });
  return parseResponse<{ session: Session; categories: string[] }>(response);
}

export async function getSession(joinCode: string) {
  const response = await fetch(`${API_URL}/api/sessions/${joinCode}`, {
    method: 'GET',
    cache: 'no-store'
  });
  return parseResponse<{ session: Session }>(response);
}

export async function getTeacherSession(joinCode: string, authToken: string) {
  const response = await fetch(`${API_URL}/api/teacher/sessions/${joinCode}`, {
    method: 'GET',
    cache: 'no-store',
    headers: authHeader(authToken)
  });
  return parseResponse<{ session: Session; responses: ResponseCard[]; studentCount: number }>(response);
}

export async function validateSession(joinCode: string) {
  const response = await fetch(`${API_URL}/api/sessions/${joinCode}/validate`, { method: 'POST' });
  return parseResponse<{ session: Session }>(response);
}

export async function submitResponse(joinCode: string, studentId: string, content: string) {
  const response = await fetch(`${API_URL}/api/sessions/${joinCode}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, content })
  });
  return parseResponse<{ response: ResponseCard }>(response);
}

export async function updateResponseCategory(
  joinCode: string,
  responseId: number,
  category: Category,
  authToken: string
) {
  const response = await fetch(`${API_URL}/api/sessions/${joinCode}/responses/${responseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader(authToken) },
    body: JSON.stringify({ category })
  });
  return parseResponse<{ ok: boolean }>(response);
}

export async function endSession(joinCode: string, authToken: string) {
  const response = await fetch(`${API_URL}/api/sessions/${joinCode}/end`, {
    method: 'POST',
    headers: authHeader(authToken)
  });
  return parseResponse<{ ok: boolean }>(response);
}

export function exportLink(joinCode: string, authToken: string) {
  const url = new URL(`${API_URL}/api/sessions/${joinCode}/export.csv`);
  url.searchParams.set('authToken', authToken);
  return url.toString();
}
