'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { findVocabularyEntry } from '@/lib/vocabulary';
import {
  getSession,
  getStudentVisibleResponses,
  setResponseReaction,
  submitResponse
} from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { getStudentId, getStudentName, getSubmissionStatus, setSubmissionStatus } from '@/lib/storage';
import type { Category, ReactionType, ResponseCard } from '@/lib/types';

const REACTION_OPTIONS: Array<{ type: ReactionType; label: string }> = [
  { type: 'helpful', label: 'Helpful' },
  { type: 'interesting', label: 'Interesting' },
  { type: 'need_example', label: 'Need Example' }
];

function renderWithVocabulary(content: string, onSelect: (term: string) => void) {
  return content.split(/(\s+)/g).map((token, index) => {
    const clean = token.toLowerCase().replace(/[^a-z]/g, '');
    const entry = clean ? findVocabularyEntry(clean) : null;
    if (!entry) return <span key={`${token}-${index}`}>{token}</span>;

    return (
      <button
        key={`${token}-${index}`}
        type="button"
        className="vocab-link"
        onClick={() => onSelect(entry.term)}
        title="See definition"
      >
        {token}
      </button>
    );
  });
}

export default function StudentRespondPage() {
  const params = useParams<{ joinCode: string }>();
  const joinCode = params.joinCode.toUpperCase();
  const [studentId, setStudentId] = useState('');

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
  const [vocabTerm, setVocabTerm] = useState<string | null>(null);

  useEffect(() => {
    setStudentId(getStudentId(joinCode));
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

        if (data.session.studentCanViewResponses && getSubmissionStatus(joinCode) && studentId) {
          const visible = await getStudentVisibleResponses(joinCode, studentId);
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
        async (payload) => {
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

          if (row.student_can_view_responses && getSubmissionStatus(joinCode) && studentId) {
            const visible = await getStudentVisibleResponses(joinCode, studentId);
            setResponses(visible.responses);
          }
        }
      )
      .subscribe();

    const presenceChannel = supabase.channel(`presence:${joinCode}`, {
      config: { presence: { key: studentId } }
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
  }, [joinCode, studentId]);

  const canSeeResponses = studentCanViewResponses && submitted;

  useEffect(() => {
    if (!sessionId || !canSeeResponses || !studentId) return;

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
        async () => {
          const visible = await getStudentVisibleResponses(joinCode, studentId);
          setResponses(visible.responses);
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
        async () => {
          const visible = await getStudentVisibleResponses(joinCode, studentId);
          setResponses(visible.responses);
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
        async () => {
          const visible = await getStudentVisibleResponses(joinCode, studentId);
          setResponses(visible.responses);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'response_reactions'
        },
        async () => {
          const visible = await getStudentVisibleResponses(joinCode, studentId);
          setResponses(visible.responses);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'response_reactions'
        },
        async () => {
          const visible = await getStudentVisibleResponses(joinCode, studentId);
          setResponses(visible.responses);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'response_reactions'
        },
        async () => {
          const visible = await getStudentVisibleResponses(joinCode, studentId);
          setResponses(visible.responses);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(responsesChannel);
    };
  }, [sessionId, canSeeResponses, joinCode, studentId]);

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
      await submitResponse(joinCode, studentId, text, getStudentName(joinCode));
      setSubmitted(true);
      setSubmissionStatus(joinCode, true);
      if (studentCanViewResponses) {
        const visible = await getStudentVisibleResponses(joinCode, studentId);
        setResponses(visible.responses);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit response.');
    } finally {
      setSending(false);
    }
  }

  async function handleReaction(responseId: number, type: ReactionType) {
    try {
      await setResponseReaction(joinCode, responseId, studentId, type);
      const visible = await getStudentVisibleResponses(joinCode, studentId);
      setResponses(visible.responses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save reaction.');
    }
  }

  const selectedVocab = useMemo(() => (vocabTerm ? findVocabularyEntry(vocabTerm) : null), [vocabTerm]);

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

        {studentCanViewResponses && !submitted ? (
          <p className="muted">Submit your response to unlock class responses.</p>
        ) : null}

        {canSeeResponses ? (
          <section className="stack">
            <h2>Class Responses</h2>
            <div className="student-responses-grid">
              {responses.map((card) => (
                <article key={card.id} className="response-card">
                  <header>
                    <span>
                      {anonymousMode ? 'Anonymous response' : card.studentName?.trim() || `Response #${card.id}`}
                    </span>
                  </header>
                  <p>{renderWithVocabulary(card.content, setVocabTerm)}</p>
                  <div className="reaction-row">
                    {REACTION_OPTIONS.map((item) => {
                      const count =
                        item.type === 'helpful'
                          ? card.reactionCounts.helpful
                          : item.type === 'interesting'
                            ? card.reactionCounts.interesting
                            : card.reactionCounts.needExample;
                      const active = card.myReaction === item.type;
                      return (
                        <button
                          key={item.type}
                          type="button"
                          className={`reaction-btn ${active ? 'active' : ''}`}
                          onClick={() => handleReaction(card.id, item.type)}
                        >
                          {item.label} ({count})
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {selectedVocab ? (
          <section className="vocab-card">
            <h3>{selectedVocab.term}</h3>
            <p>{selectedVocab.definition}</p>
            <p className="muted">Example: {selectedVocab.example}</p>
            <button className="button" type="button" onClick={() => setVocabTerm(null)}>
              Close
            </button>
          </section>
        ) : null}
      </section>
    </main>
  );
}
