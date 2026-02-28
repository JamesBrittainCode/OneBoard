'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSession, getMe } from '@/lib/api';
import type { BoardMode } from '@/lib/types';
import { recordTeacherSession } from '@/lib/storage';

const DEFAULT_SECTIONS: [string, string, string] = [
  'Strong Thinking',
  'Needs Clarification',
  'Misconception'
];

export default function TeacherSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [boardMode, setBoardMode] = useState<BoardMode>('categorized');
  const [anonymousMode, setAnonymousMode] = useState(true);
  const [sectionLabels, setSectionLabels] = useState<[string, string, string]>(DEFAULT_SECTIONS);
  const [error, setError] = useState('');

  useEffect(() => {
    getMe()
      .then(() => {
        setAuthLoading(false);
      })
      .catch(() => {
        router.replace('/teacher');
      });
  }, [router]);

  async function launch(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!prompt.trim()) {
      setError('Please add a prompt first.');
      return;
    }

    setLoading(true);
    try {
      const { session } = await createSession(prompt.trim(), {
        boardMode,
        anonymousMode,
        sectionLabels
      });
      recordTeacherSession(session.joinCode, session.prompt);
      router.push(`/teacher/live/${session.joinCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create session.');
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <main className="shell centered">
        <section className="panel" style={{ padding: 24 }}>
          Loading setup...
        </section>
      </main>
    );
  }

  return (
    <main className="shell centered">
      <section className="panel" style={{ padding: 24, display: 'grid', gap: 14 }}>
        <h1 className="page-title">Session Setup</h1>
        <form className="stack" onSubmit={launch}>
          <label htmlFor="prompt">Prompt</label>
          <textarea
            id="prompt"
            className="textarea"
            value={prompt}
            placeholder="What evidence supports your claim?"
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={400}
            required
          />

          <label htmlFor="mode">Board Mode</label>
          <select
            id="mode"
            className="input"
            value={boardMode}
            onChange={(event) => setBoardMode(event.target.value as BoardMode)}
          >
            <option value="categorized">Categorized</option>
            <option value="open">Open Space</option>
          </select>

          <label className="toolbar" style={{ alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={anonymousMode}
              onChange={(event) => setAnonymousMode(event.target.checked)}
            />
            Anonymous mode
          </label>

          {boardMode === 'categorized' ? (
            <div className="section-edit-grid">
              {sectionLabels.map((label, index) => (
                <input
                  key={index}
                  className="input"
                  value={label}
                  maxLength={40}
                  onChange={(event) => {
                    const next = [...sectionLabels] as [string, string, string];
                    next[index] = event.target.value;
                    setSectionLabels(next);
                  }}
                  placeholder={`Section ${index + 1}`}
                />
              ))}
            </div>
          ) : null}

          <button className="button primary" type="submit" disabled={loading}>
            {loading ? 'Launching...' : 'Launch Session'}
          </button>
        </form>

        {error ? <p className="error">{error}</p> : null}

        <Link href="/teacher" className="button">
          Back to Dashboard
        </Link>
      </section>
    </main>
  );
}
