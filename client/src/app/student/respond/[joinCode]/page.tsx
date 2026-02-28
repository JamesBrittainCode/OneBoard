'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ResponseCardView from '@/components/ResponseCard';
import { getSession, getStudentVisibleResponses, submitResponse } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { getStudentId, getStudentName, getSubmissionStatus, setSubmissionStatus } from '@/lib/storage';
import type { Category, ResponseCard } from '@/lib/types';

export default function StudentRespondPage() {
  const params = useParams<{ joinCode: string }>();
  const joinCode = params.joinCode.toUpperCase();

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState('');
  const [anonymousMode, setAnonymousMode] = useState(true);
  const [studentCanViewResponses, setStudentCanViewResponses] = useState(false);
  const [content, setContent] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const [responses, setResponses] = useState<ResponseCard[]>([]);

  useEffect(() => {
    setSubmitted(getSubmissionStatus(joinCode));

    let mounted = true;

    getSession(joinCode)
      .then(async (data) => {
        if (!mounted) return;
        setSessionId(data.session.id);
        setPrompt(data.session.prompt);
        setAnonymousMode(data.session.anonymousMode);
        setStudentCanViewResponses(data.session.studentCanViewResponses);
        setEnded(!data.session.active);

        if (data.session.studentCanViewResponses) {
          const visible = await getStudentVisibleResponses(joinCode);
          if (mounted) setResponses(visible.responses);
        }
      })
      .catch((_error) => {
        if (!mounted) return;
        setError('Invalid or ended session.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const sessionChannel = supabase
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
          const row = payload.new as {
            active: boolean;
            anonymous_mode: boolean;
            student_can_view_responses: boolean;
          };
          if (!row.active) {
            setEnded(true);
            setError('Session has ended.');
          }
          setAnonymousMode(row.anonymous_mode);
          setStudentCanViewResponses(row.student_can_view_responses);
        }
      )
      .subscribe();

    const presenceChannel = supabase.channel(`presence:${joinCode}`, {
      config: { presence: { key: getStudentId(joinCode) } }
    });

    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({ online_at: new Date().toISOString() });
      }
    });

    return () => {
      mounted = false;
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [joinCode]);

  useEffect(() => {
    if (!sessionId || !studentCanViewResponses) return;

    const responsesChannel = supabase
      .channel(`student-responses:${sessionId}`)
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
            student_name: string | null;
          };
          setResponses((current) => {
            if (current.some((item) => item.id === row.id)) return current;
            return [
              {
                id: row.id,
                sessionId: row.session_id,
                content: row.content,
                createdAt: row.created_at,
                category: row.category,
                studentName: row.student_name
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
          const row = payload.new as { id: number; category: Category; student_name: string | null };
          setResponses((current) =>
            current.map((item) =>
              item.id === row.id ? { ...item, category: row.category, studentName: row.student_name } : item
            )
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'responses',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          const row = payload.old as { id: number };
          setResponses((current) => current.filter((item) => item.id !== row.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(responsesChannel);
    };
  }, [sessionId, studentCanViewResponses]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitted || ended || sending) return;

    const text = content.trim();
    if (!text) {
      setError('Please type your response.');
      return;
    }
    if (!anonymousMode && !getStudentName(joinCode)) {
      setError('Please go back and re-join with your name.');
      return;
    }

    setSending(true);
    setError('');
    try {
      await submitResponse(joinCode, getStudentId(joinCode), text, getStudentName(joinCode));
      setSubmitted(true);
      setSubmissionStatus(joinCode, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit response.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main className="shell centered">
        <section className="panel" style={{ padding: 24 }}>
          Loading session...
        </section>
      </main>
    );
  }

  return (
    <main className="shell centered">
      <section className="panel" style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 760 }}>
        <h1 className="page-title">{prompt || 'Session'}</h1>

        {ended ? <p className="error">Session has ended.</p> : null}

        <form className="stack" onSubmit={handleSubmit}>
          <textarea
            className="textarea"
            placeholder="Type your response"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={250}
            disabled={submitted || ended}
            required
          />
          <p className="muted">{content.length}/250</p>
          <button className="button primary" type="submit" disabled={submitted || ended || sending}>
            {submitted ? 'Submitted' : sending ? 'Submitting...' : 'Submit'}
          </button>
        </form>

        {submitted ? <p className="success">Your response was submitted.</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {studentCanViewResponses ? (
          <section className="stack">
            <h2>Class Responses</h2>
            <div className="student-responses-grid">
              {responses.map((card) => (
                <ResponseCardView
                  key={card.id}
                  card={card}
                  anonymousMode={anonymousMode}
                  highlighted={false}
                  onToggleHighlight={() => {}}
                />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
