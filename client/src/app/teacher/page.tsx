'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  archiveSession,
  getMe,
  listTeacherSessions,
  loginTeacher,
  logoutTeacher,
  registerTeacher,
  reopenSession
} from '@/lib/api';
import { CREATED_BY } from '@/lib/branding';
import type { Session } from '@/lib/types';

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function timerSummary(session: Session) {
  const total = session.timerHistory.reduce((sum, item) => sum + item.seconds, 0);
  return {
    total,
    rounds: session.timerHistory.length
  };
}

export default function TeacherPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);

  async function loadSessions() {
    try {
      const next = await listTeacherSessions();
      setSessions(next);
    } catch (_error) {
      setSessions([]);
    }
  }

  useEffect(() => {
    getMe()
      .then(async ({ user }) => {
        setUserEmail(user.email);
        await loadSessions();
      })
      .catch(() => {
        setUserEmail('');
        setSessions([]);
      })
      .finally(() => {
        setAuthLoading(false);
      });
  }, []);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      const action = authMode === 'register' ? registerTeacher : loginTeacher;
      const result = await action(email.trim(), password);
      setUserEmail(result.user.email);
      setPassword('');
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not authenticate.');
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setError('');
    try {
      await logoutTeacher();
      setUserEmail('');
      setSessions([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out.');
    }
  }

  async function handleArchive(joinCode: string) {
    setError('');
    try {
      await archiveSession(joinCode);
      await loadSessions();
      setNotice('Session archived');
      window.setTimeout(() => setNotice(''), 1400);
    } catch {
      setError('Could not archive session.');
    }
  }

  async function handleReopen(joinCode: string) {
    setError('');
    try {
      await reopenSession(joinCode);
      await loadSessions();
      setNotice('Session reopened');
      window.setTimeout(() => setNotice(''), 1400);
    } catch {
      setError('Could not reopen session.');
    }
  }

  const activeSessions = useMemo(() => sessions.filter((item) => item.active && !item.archived), [sessions]);
  const endedSessions = useMemo(
    () => sessions.filter((item) => !item.active && !item.archived),
    [sessions]
  );
  const archivedSessions = useMemo(() => sessions.filter((item) => item.archived), [sessions]);

  if (authLoading) {
    return (
      <main className="shell centered">
        <section className="panel" style={{ padding: 24 }}>
          Loading...
        </section>
      </main>
    );
  }

  return (
    <main className="shell centered">
      <div style={{ width: 'min(900px, 100%)' }}>
        <div className="logo-wrap">
          <img src="/logo.png" alt="OneBoard logo" className="logo-small" />
        </div>
        <section className="panel" style={{ padding: 24, display: 'grid', gap: 18 }}>
          <h1 className="page-title">Teacher Dashboard</h1>

          {!userEmail ? (
            <form className="stack" onSubmit={submitAuth}>
              <div className="toolbar">
                <button
                  type="button"
                  className="button"
                  onClick={() => setAuthMode('login')}
                  aria-pressed={authMode === 'login'}
                >
                  Login
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => setAuthMode('register')}
                  aria-pressed={authMode === 'register'}
                >
                  Create Account
                </button>
              </div>
              <input
                className="input"
                type="email"
                placeholder="teacher@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <div className="password-wrap">
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password (min 8 chars)"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="eye-button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <button className="button primary" type="submit" disabled={loading}>
                {loading ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Create Account'}
              </button>
            </form>
          ) : (
            <>
              <p className="muted">Signed in as {userEmail}</p>
              <div className="toolbar">
                <button className="button" type="button" onClick={signOut}>
                  Sign Out
                </button>
                <Link href="/teacher/setup" className="button primary">
                  Start New Session
                </Link>
                <button className="button" type="button" onClick={loadSessions}>
                  Refresh
                </button>
              </div>

              <div className="stack">
                <h2>Active Sessions</h2>
                {activeSessions.length === 0 ? (
                  <p className="muted">No active sessions.</p>
                ) : (
                  activeSessions.map((item) => {
                    const summary = timerSummary(item);
                    return (
                      <div key={item.joinCode} className="session-item">
                        <p>
                          <strong>{item.joinCode}</strong> - {item.prompt}
                        </p>
                        <p className="muted">
                          Rounds: {summary.rounds} | Total time: {formatDuration(summary.total)}
                        </p>
                        <div className="toolbar">
                          <Link href={`/teacher/live/${item.joinCode}`} className="button">
                            Open Live Board
                          </Link>
                          <button className="button" onClick={() => handleArchive(item.joinCode)}>
                            Archive
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="stack">
                <h2>Past Sessions</h2>
                {endedSessions.length === 0 ? (
                  <p className="muted">No ended sessions.</p>
                ) : (
                  endedSessions.map((item) => {
                    const summary = timerSummary(item);
                    return (
                      <div key={item.joinCode} className="session-item">
                        <p>
                          <strong>{item.joinCode}</strong> - {item.prompt}
                        </p>
                        <p className="muted">
                          Rounds: {summary.rounds} | Total time: {formatDuration(summary.total)}
                        </p>
                        <div className="toolbar">
                          <Link href={`/teacher/live/${item.joinCode}`} className="button">
                            Open Board
                          </Link>
                          <button className="button" onClick={() => handleReopen(item.joinCode)}>
                            Reopen
                          </button>
                          <button className="button" onClick={() => handleArchive(item.joinCode)}>
                            Archive
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="stack">
                <h2>Archived</h2>
                {archivedSessions.length === 0 ? (
                  <p className="muted">No archived sessions.</p>
                ) : (
                  archivedSessions.map((item) => {
                    const summary = timerSummary(item);
                    return (
                      <div key={item.joinCode} className="session-item">
                        <p>
                          <strong>{item.joinCode}</strong> - {item.prompt}
                        </p>
                        <p className="muted">
                          Rounds: {summary.rounds} | Total time: {formatDuration(summary.total)}
                        </p>
                        <div className="toolbar">
                          <button className="button" onClick={() => handleReopen(item.joinCode)}>
                            Reopen
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {error ? <p className="error">{error}</p> : null}
          {notice ? <p className="success">{notice}</p> : null}

          <p className="created-by">Created by: {CREATED_BY}</p>
        </section>
      </div>
    </main>
  );
}
