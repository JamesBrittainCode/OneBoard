'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createSession, getMe, loginTeacher, registerTeacher } from '@/lib/api';
import { CREATED_BY } from '@/lib/branding';
import {
  clearAuthToken,
  getAuthToken,
  getTeacherSessions,
  recordTeacherSession,
  setAuthToken
} from '@/lib/storage';

export default function TeacherPage() {
  const [creating, setCreating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  const router = useRouter();
  const previous = useMemo(() => getTeacherSessions(), []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }

    getMe(token)
      .then(({ user }) => {
        setUserEmail(user.email);
      })
      .catch(() => {
        clearAuthToken();
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
      setAuthToken(result.token);
      setUserEmail(result.user.email);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not authenticate.');
    } finally {
      setLoading(false);
    }
  }

  async function launchSession(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!prompt.trim()) {
      setError('Please add a prompt first.');
      return;
    }

    const authToken = getAuthToken();
    if (!authToken) {
      setError('Please sign in first.');
      return;
    }

    setLoading(true);
    try {
      const { session } = await createSession(prompt.trim(), authToken);
      recordTeacherSession(session.joinCode, session.prompt);
      router.push(`/teacher/live/${session.joinCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create session.');
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    clearAuthToken();
    setUserEmail('');
    setCreating(false);
  }

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
              <input
                className="input"
                type="password"
                placeholder="Password (min 8 chars)"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
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
              </div>

              {!creating ? (
                <button className="button primary" type="button" onClick={() => setCreating(true)}>
                  Start New Session
                </button>
              ) : (
                <form className="stack" onSubmit={launchSession}>
                  <label htmlFor="prompt">Enter your prompt</label>
                  <textarea
                    id="prompt"
                    className="textarea"
                    value={prompt}
                    placeholder="What evidence supports your claim?"
                    onChange={(event) => setPrompt(event.target.value)}
                    maxLength={400}
                    required
                  />
                  <button className="button primary" type="submit" disabled={loading}>
                    {loading ? 'Launching...' : 'Launch Session'}
                  </button>
                </form>
              )}

              <div className="stack">
                <h2>Recent Sessions</h2>
                {previous.length === 0 ? (
                  <p className="muted">No previous sessions yet.</p>
                ) : (
                  previous.map((item) => (
                    <Link key={item.joinCode} href={`/teacher/live/${item.joinCode}`} className="button">
                      {item.joinCode} - {item.prompt}
                    </Link>
                  ))
                )}
              </div>
            </>
          )}

          {error ? <p className="error">{error}</p> : null}

          <p className="created-by">Created by: {CREATED_BY}</p>
        </section>
      </div>
    </main>
  );
}
