'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getMe, loginTeacher, logoutTeacher, registerTeacher } from '@/lib/api';
import { CREATED_BY } from '@/lib/branding';
import { getTeacherSessions } from '@/lib/storage';

export default function TeacherPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  const previous = useMemo(() => getTeacherSessions(), []);

  useEffect(() => {
    getMe()
      .then(({ user }) => {
        setUserEmail(user.email);
      })
      .catch(() => {
        setUserEmail('');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out.');
    }
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
              </div>

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
