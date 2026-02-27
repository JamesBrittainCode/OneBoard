'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { validateSession } from '@/lib/api';
import { CREATED_BY } from '@/lib/branding';
import { setStudentName } from '@/lib/storage';

export default function StudentJoinPage() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [needsName, setNeedsName] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function join(event: FormEvent) {
    event.preventDefault();
    setError('');

    const joinCode = code.trim().toUpperCase();
    if (!joinCode) {
      setError('Enter a join code.');
      return;
    }

    if (needsName && !name.trim()) {
      setError('Please enter your name.');
      return;
    }

    setLoading(true);
    try {
      const data = await validateSession(joinCode);
      setNeedsName(!data.session.anonymousMode);
      if (!data.session.anonymousMode && !name.trim()) {
        setError('This teacher requires names.');
        return;
      }

      if (!data.session.anonymousMode) {
        setStudentName(joinCode, name.trim());
      }

      router.push(`/student/respond/${joinCode}`);
    } catch (_error) {
      setError('Invalid or ended session code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell centered">
      <div style={{ width: 'min(550px, 100%)' }}>
        <div className="logo-wrap">
          <img src="/logo.png" alt="OneBoard logo" className="logo-small" />
        </div>
        <section className="panel" style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 550 }}>
          <h1 className="page-title">Join Session</h1>
          <form className="stack" onSubmit={join}>
            <input
              className="input"
              aria-label="Enter join code"
              placeholder="Enter Join Code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              maxLength={6}
              required
            />
            {needsName ? (
              <input
                className="input"
                aria-label="Enter your name"
                placeholder="Your Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                required
              />
            ) : null}
            <button className="button primary" type="submit" disabled={loading}>
              {loading ? 'Joining...' : 'Join'}
            </button>
          </form>
          {error ? <p className="error">{error}</p> : null}
          <p className="created-by">Created by: {CREATED_BY}</p>
        </section>
      </div>
    </main>
  );
}
