'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CategoryColumn from '@/components/CategoryColumn';
import { createSocket } from '@/lib/socket';
import { endSession, exportLink, getTeacherSession, updateResponseCategory } from '@/lib/api';
import type { Category, ResponseCard } from '@/lib/types';
import { getAuthToken } from '@/lib/storage';

const CATEGORIES: Array<{ title: string; category: Category }> = [
  { title: 'Unsorted', category: null },
  { title: 'Strong Thinking', category: 'Strong Thinking' },
  { title: 'Needs Clarification', category: 'Needs Clarification' },
  { title: 'Misconception', category: 'Misconception' }
];

export default function TeacherLivePage() {
  const params = useParams<{ joinCode: string }>();
  const joinCode = params.joinCode.toUpperCase();
  const router = useRouter();

  const [prompt, setPrompt] = useState('');
  const [responses, setResponses] = useState<ResponseCard[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [error, setError] = useState('');
  const [anonymousMode, setAnonymousMode] = useState(true);
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [highlighted, setHighlighted] = useState<Set<number>>(new Set());
  const [authToken, setAuthToken] = useState('');
  const draggingId = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const token = getAuthToken();
    setAuthToken(token);

    if (!token) {
      setError('Unauthorized. Please sign in on Teacher Dashboard.');
      setLoading(false);
      return;
    }

    getTeacherSession(joinCode, token)
      .then((data) => {
        if (!mounted) return;
        setPrompt(data.session.prompt);
        setResponses(data.responses);
        setStudentCount(data.studentCount);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Could not load session.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const socket = createSocket();
    socket.emit('session:join', { joinCode, role: 'teacher' });

    socket.on('response:new', (payload: ResponseCard) => {
      setResponses((current) => {
        if (current.some((item) => item.id === payload.id)) return current;
        return [payload, ...current];
      });
    });

    socket.on('response:category-updated', ({ id, category }: { id: number; category: Category }) => {
      setResponses((current) =>
        current.map((item) => (item.id === id ? { ...item, category } : item))
      );
    });

    socket.on('session:student-count', ({ count }: { count: number }) => {
      setStudentCount(count);
    });

    socket.on('session:ended', () => {
      setEnded(true);
    });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, [joinCode]);

  const grouped = useMemo(() => {
    return CATEGORIES.map((bucket) => ({
      ...bucket,
      cards: responses.filter((response) => response.category === bucket.category)
    }));
  }, [responses]);

  async function moveCard(category: Category) {
    if (draggingId.current === null || !authToken) return;
    const id = draggingId.current;

    setResponses((current) => current.map((item) => (item.id === id ? { ...item, category } : item)));
    try {
      await updateResponseCategory(joinCode, id, category, authToken);
    } catch {
      setError('Could not move card. Please try again.');
    }
  }

  function toggleHighlight(id: number) {
    setHighlighted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleEndSession() {
    if (!authToken) return;
    setError('');
    try {
      await endSession(joinCode, authToken);
      setEnded(true);
    } catch {
      setError('Could not end session.');
    }
  }

  if (loading) {
    return (
      <main className="shell centered">
        <section className="panel" style={{ padding: 24 }}>
          Loading board...
        </section>
      </main>
    );
  }

  if (error && !prompt) {
    return (
      <main className="shell centered">
        <section className="panel" style={{ padding: 24, display: 'grid', gap: 12 }}>
          <h1>Session unavailable</h1>
          <p className="error">{error}</p>
          <button className="button" onClick={() => router.push('/teacher')}>
            Back to dashboard
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="panel board">
        <div className="board-top">
          <h1>{prompt}</h1>
          <div className="badges">
            <span className="badge">Join Code: {joinCode}</span>
            <span className="badge">Students Live: {studentCount}</span>
            {ended ? <span className="badge">Session Ended</span> : null}
          </div>
          <div className="toolbar">
            <button className="button" onClick={() => setAnonymousMode((v) => !v)}>
              Anonymous Mode: {anonymousMode ? 'On' : 'Off'}
            </button>
            <a className="button" href={exportLink(joinCode, authToken)} target="_blank" rel="noreferrer">
              Export Board (CSV)
            </a>
            <button className="button" onClick={handleEndSession} disabled={ended}>
              End Session
            </button>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>

        <div className="columns" style={{ padding: '0 14px 14px' }}>
          {grouped.map((bucket) => (
            <CategoryColumn
              key={bucket.title}
              title={bucket.title}
              category={bucket.category}
              cards={bucket.cards}
              anonymousMode={anonymousMode}
              highlighted={highlighted}
              onToggleHighlight={toggleHighlight}
              onDragStart={(id) => {
                draggingId.current = id;
              }}
              onDropCard={moveCard}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
