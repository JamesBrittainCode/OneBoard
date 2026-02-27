'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CategoryColumn from '@/components/CategoryColumn';
import { endSession, exportBoardCsv, getTeacherSession, updateResponseCategory } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Category, ResponseCard } from '@/lib/types';

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

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState('');
  const [responses, setResponses] = useState<ResponseCard[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [error, setError] = useState('');
  const [anonymousMode, setAnonymousMode] = useState(true);
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [highlighted, setHighlighted] = useState<Set<number>>(new Set());
  const draggingId = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    getTeacherSession(joinCode)
      .then((data) => {
        if (!mounted) return;
        setSessionId(data.session.id);
        setPrompt(data.session.prompt);
        setResponses(data.responses);
        setEnded(!data.session.active);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Could not load session.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [joinCode]);

  useEffect(() => {
    if (!sessionId) return;

    const responsesChannel = supabase
      .channel(`responses:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'responses',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          const row = payload.new as {
            id: number;
            session_id: number;
            content: string;
            created_at: string;
            category: Category;
          };
          setResponses((current) => {
            if (current.some((item) => item.id === row.id)) return current;
            return [
              {
                id: row.id,
                sessionId: row.session_id,
                content: row.content,
                createdAt: row.created_at,
                category: row.category
              },
              ...current
            ];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'responses',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          const row = payload.new as { id: number; category: Category };
          setResponses((current) =>
            current.map((item) => (item.id === row.id ? { ...item, category: row.category } : item))
          );
        }
      )
      .subscribe();

    const sessionsChannel = supabase
      .channel(`sessions:${joinCode}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `join_code=eq.${joinCode}`
        },
        (payload) => {
          const row = payload.new as { active: boolean };
          if (!row.active) setEnded(true);
        }
      )
      .subscribe();

    const presenceChannel = supabase.channel(`presence:${joinCode}`);
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setStudentCount(Object.keys(state).length);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(responsesChannel);
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [sessionId, joinCode]);

  const grouped = useMemo(() => {
    return CATEGORIES.map((bucket) => ({
      ...bucket,
      cards: responses.filter((response) => response.category === bucket.category)
    }));
  }, [responses]);

  async function moveCard(category: Category) {
    if (draggingId.current === null || ended) return;
    const id = draggingId.current;

    setResponses((current) => current.map((item) => (item.id === id ? { ...item, category } : item)));
    try {
      await updateResponseCategory(joinCode, id, category);
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
    setError('');
    try {
      await endSession(joinCode);
      setEnded(true);
    } catch {
      setError('Could not end session.');
    }
  }

  async function handleExport() {
    try {
      const csv = await exportBoardCsv(joinCode);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `oneboard-${joinCode}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not export board.');
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
            <button className="button" onClick={handleExport}>
              Export Board (CSV)
            </button>
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
