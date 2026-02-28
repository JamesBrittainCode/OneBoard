'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CategoryColumn from '@/components/CategoryColumn';
import {
  archiveSession,
  deleteResponse,
  endSession,
  exportBoardCsv,
  getTeacherSession,
  reopenSession,
  updateResponseCategory,
  updateSessionSettings
} from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { BoardMode, Category, ResponseCard } from '@/lib/types';

const DEFAULT_SECTIONS: [string, string, string] = [
  'Strong Thinking',
  'Needs Clarification',
  'Misconception'
];

const DEFAULT_CATEGORIES: Category[] = ['Strong Thinking', 'Needs Clarification', 'Misconception'];
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'with',
  'this',
  'from',
  'have',
  'your',
  'they',
  'their',
  'about',
  'what',
  'when',
  'where',
  'which',
  'were',
  'there',
  'just',
  'like',
  'into',
  'could',
  'would',
  'should',
  'because',
  'after',
  'before',
  'also',
  'some',
  'than',
  'then',
  'them',
  'over',
  'under'
]);

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

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
  const [boardMode, setBoardMode] = useState<BoardMode>('categorized');
  const [sectionLabels, setSectionLabels] = useState<[string, string, string]>(DEFAULT_SECTIONS);
  const [submissionsFrozen, setSubmissionsFrozen] = useState(false);
  const [studentCanViewResponses, setStudentCanViewResponses] = useState(false);
  const [activeStartedAt, setActiveStartedAt] = useState<string | null>(null);
  const [timerHistory, setTimerHistory] = useState<Array<{ startedAt: string; endedAt: string; seconds: number }>>(
    []
  );
  const [ended, setEnded] = useState(false);
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [highlighted, setHighlighted] = useState<Set<number>>(new Set());
  const [savingSettings, setSavingSettings] = useState(false);
  const [notice, setNotice] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
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
        setArchived(data.session.archived);
        setAnonymousMode(data.session.anonymousMode);
        setBoardMode(data.session.boardMode);
        setSectionLabels(data.session.sectionLabels);
        setSubmissionsFrozen(data.session.submissionsFrozen);
        setStudentCanViewResponses(data.session.studentCanViewResponses);
        setActiveStartedAt(data.session.activeStartedAt);
        setTimerHistory(data.session.timerHistory);
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
    if (!activeStartedAt || ended) {
      setElapsedSeconds(0);
      return;
    }

    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(activeStartedAt)) / 1000));
      setElapsedSeconds(elapsed);
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeStartedAt, ended]);

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
                studentName: row.student_name,
                reactionCounts: {
                  helpful: 0,
                  interesting: 0,
                  needExample: 0
                },
                myReaction: null
              },
              ...current
            ];
          });
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
          const row = payload.new as {
            active: boolean;
            archived: boolean;
            anonymous_mode: boolean;
            board_mode: BoardMode;
            section_label_1: string;
            section_label_2: string;
            section_label_3: string;
            submissions_frozen: boolean;
            student_can_view_responses: boolean;
            active_started_at: string | null;
            timer_history: Array<{ startedAt: string; endedAt: string; seconds: number }>;
          };
          setEnded(!row.active);
          setArchived(row.archived);
          setAnonymousMode(row.anonymous_mode);
          setBoardMode(row.board_mode);
          setSectionLabels([row.section_label_1, row.section_label_2, row.section_label_3]);
          setSubmissionsFrozen(row.submissions_frozen);
          setStudentCanViewResponses(row.student_can_view_responses);
          setActiveStartedAt(row.active_started_at);
          setTimerHistory(Array.isArray(row.timer_history) ? row.timer_history : []);
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

    const pollId = window.setInterval(async () => {
      try {
        const data = await getTeacherSession(joinCode);
        setResponses(data.responses);
        setEnded(!data.session.active);
        setArchived(data.session.archived);
        setAnonymousMode(data.session.anonymousMode);
        setBoardMode(data.session.boardMode);
        setSectionLabels(data.session.sectionLabels);
        setSubmissionsFrozen(data.session.submissionsFrozen);
        setStudentCanViewResponses(data.session.studentCanViewResponses);
        setActiveStartedAt(data.session.activeStartedAt);
        setTimerHistory(data.session.timerHistory);
      } catch {
        // Keep UI stable; realtime may still recover on next tick.
      }
    }, 4000);

    return () => {
      window.clearInterval(pollId);
      supabase.removeChannel(responsesChannel);
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [sessionId, joinCode]);

  const grouped = useMemo(() => {
    if (boardMode === 'open') {
      return [{ title: 'General Space', category: null as Category, cards: responses }];
    }

    return [
      { title: 'Unsorted', category: null as Category },
      { title: sectionLabels[0], category: DEFAULT_CATEGORIES[0] },
      { title: sectionLabels[1], category: DEFAULT_CATEGORIES[1] },
      { title: sectionLabels[2], category: DEFAULT_CATEGORIES[2] }
    ].map((bucket) => ({
      ...bucket,
      cards: responses.filter((response) => response.category === bucket.category)
    }));
  }, [responses, boardMode, sectionLabels]);

  const analytics = useMemo(() => {
    const categoryCounts = {
      unsorted: responses.filter((row) => row.category === null).length,
      section1: responses.filter((row) => row.category === DEFAULT_CATEGORIES[0]).length,
      section2: responses.filter((row) => row.category === DEFAULT_CATEGORIES[1]).length,
      section3: responses.filter((row) => row.category === DEFAULT_CATEGORIES[2]).length
    };

    const terms = new Map<string, number>();
    for (const row of responses) {
      const tokens = row.content.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
      for (const token of tokens) {
        if (token.length < 4 || STOP_WORDS.has(token)) continue;
        terms.set(token, (terms.get(token) || 0) + 1);
      }
    }

    const topTerms = [...terms.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([term, count]) => ({ term, count }));

    return { categoryCounts, topTerms };
  }, [responses]);

  async function saveSettings(next: {
    boardMode?: BoardMode;
    anonymousMode?: boolean;
    sectionLabels?: [string, string, string];
    submissionsFrozen?: boolean;
    studentCanViewResponses?: boolean;
  }) {
    if (ended || archived) return;
    setSavingSettings(true);
    setError('');
    try {
      await updateSessionSettings(joinCode, next);
      setNotice('Settings saved');
      window.setTimeout(() => setNotice(''), 1400);
    } catch {
      setError('Could not save session settings.');
      throw new Error('save-settings-failed');
    } finally {
      setSavingSettings(false);
    }
  }

  async function moveCard(category: Category) {
    if (draggingId.current === null || ended || boardMode === 'open') return;
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

  async function handleDeleteResponse(responseId: number) {
    if (ended || archived) return;
    const previous = responses;
    setResponses((current) => current.filter((item) => item.id !== responseId));
    try {
      await deleteResponse(joinCode, responseId);
      setNotice('Response deleted');
      window.setTimeout(() => setNotice(''), 1400);
    } catch {
      setResponses(previous);
      setError('Could not delete response.');
    }
  }

  async function handleEndSession() {
    setError('');
    try {
      await endSession(joinCode);
      setEnded(true);
      setSubmissionsFrozen(false);
      const data = await getTeacherSession(joinCode);
      setTimerHistory(data.session.timerHistory);
      setActiveStartedAt(data.session.activeStartedAt);
      setNotice('Session ended');
      window.setTimeout(() => setNotice(''), 1400);
    } catch {
      setError('Could not end session.');
    }
  }

  async function handleReopenSession() {
    setError('');
    try {
      await reopenSession(joinCode);
      const data = await getTeacherSession(joinCode);
      setEnded(!data.session.active);
      setArchived(data.session.archived);
      setSubmissionsFrozen(data.session.submissionsFrozen);
      setActiveStartedAt(data.session.activeStartedAt);
      setTimerHistory(data.session.timerHistory);
      setNotice('Session reopened');
      window.setTimeout(() => setNotice(''), 1400);
    } catch {
      setError('Could not reopen session.');
    }
  }

  async function handleArchiveSession() {
    setError('');
    try {
      await archiveSession(joinCode);
      const data = await getTeacherSession(joinCode);
      setEnded(!data.session.active);
      setArchived(data.session.archived);
      setSubmissionsFrozen(data.session.submissionsFrozen);
      setActiveStartedAt(data.session.activeStartedAt);
      setTimerHistory(data.session.timerHistory);
      setNotice('Session archived');
      window.setTimeout(() => setNotice(''), 1400);
    } catch {
      setError('Could not archive session.');
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

  async function copyJoinCode() {
    try {
      await navigator.clipboard.writeText(joinCode);
      setNotice('Join code copied');
      window.setTimeout(() => setNotice(''), 1400);
    } catch {
      setError('Could not copy join code.');
    }
  }

  async function copyJoinLink() {
    try {
      const url = `${window.location.origin}/student`;
      await navigator.clipboard.writeText(url);
      setNotice('Student join link copied');
      window.setTimeout(() => setNotice(''), 1400);
    } catch {
      setError('Could not copy join link.');
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
            <span className="badge">Submissions: {submissionsFrozen ? 'Frozen' : 'Open'}</span>
            {ended ? <span className="badge">Session Ended</span> : null}
            {archived ? <span className="badge">Archived</span> : null}
          </div>
          <div className="badges">
            <span className="badge">
              Current Round Time: {ended || !activeStartedAt ? 'Not running' : formatDuration(elapsedSeconds)}
            </span>
            <span className="badge">Timer History: {timerHistory.length} rounds</span>
          </div>
          <div className="toolbar">
            <button
              className="button"
              onClick={() => {
                const prev = anonymousMode;
                const next = !prev;
                setAnonymousMode(next);
                saveSettings({ anonymousMode: next }).catch(() => {
                  setAnonymousMode(prev);
                });
              }}
              disabled={savingSettings || ended || archived}
            >
              Anonymous Mode: {anonymousMode ? 'On' : 'Off'}
            </button>
            <button
              className="button"
              onClick={() => {
                const prev = boardMode;
                const next = prev === 'categorized' ? 'open' : 'categorized';
                setBoardMode(next);
                saveSettings({ boardMode: next }).catch(() => {
                  setBoardMode(prev);
                });
              }}
              disabled={savingSettings || ended || archived}
            >
              Mode: {boardMode === 'categorized' ? 'Categorized' : 'Open Space'}
            </button>
            <button
              className="button"
              onClick={() => {
                const prev = submissionsFrozen;
                const next = !prev;
                setSubmissionsFrozen(next);
                saveSettings({ submissionsFrozen: next }).catch(() => {
                  setSubmissionsFrozen(prev);
                });
              }}
              disabled={savingSettings || ended || archived}
            >
              {submissionsFrozen ? 'Unfreeze Submissions' : 'Freeze Submissions'}
            </button>
            <button
              className="button"
              onClick={() => {
                const prev = studentCanViewResponses;
                const next = !prev;
                setStudentCanViewResponses(next);
                saveSettings({ studentCanViewResponses: next }).catch(() => {
                  setStudentCanViewResponses(prev);
                });
              }}
              disabled={savingSettings || ended || archived}
            >
              Student View: {studentCanViewResponses ? 'Enabled' : 'Disabled'}
            </button>
            <button className="button" onClick={copyJoinCode}>
              Copy Join Code
            </button>
            <button className="button" onClick={copyJoinLink}>
              Copy Student Link
            </button>
            <button className="button" onClick={handleExport}>
              Export Board (CSV)
            </button>
            {ended ? (
              <button className="button" onClick={handleReopenSession} disabled={archived}>
                Reopen Session
              </button>
            ) : (
              <button className="button" onClick={handleEndSession}>
                End Session
              </button>
            )}
            <button className="button" onClick={handleArchiveSession}>
              Archive Session
            </button>
          </div>

          {boardMode === 'categorized' ? (
            <div className="section-edit-grid">
              {sectionLabels.map((label, index) => (
                <input
                  key={DEFAULT_CATEGORIES[index] || index}
                  className="input"
                  value={label}
                  maxLength={40}
                  onChange={(event) => {
                    const next: [string, string, string] = [...sectionLabels] as [
                      string,
                      string,
                      string
                    ];
                    next[index] = event.target.value;
                    setSectionLabels(next);
                  }}
                  onBlur={() => {
                    const prev = sectionLabels;
                    saveSettings({ sectionLabels: prev }).catch(() => {
                      setSectionLabels(prev);
                    });
                  }}
                  placeholder={`Section ${index + 1}`}
                  disabled={savingSettings || ended || archived}
                />
              ))}
            </div>
          ) : null}

          <div className="analytics-grid">
            <section className="analytics-card">
              <h3>Category Counts</h3>
              <p>Unsorted: {analytics.categoryCounts.unsorted}</p>
              <p>{sectionLabels[0]}: {analytics.categoryCounts.section1}</p>
              <p>{sectionLabels[1]}: {analytics.categoryCounts.section2}</p>
              <p>{sectionLabels[2]}: {analytics.categoryCounts.section3}</p>
            </section>
            <section className="analytics-card">
              <h3>Top Terms</h3>
              {analytics.topTerms.length === 0 ? (
                <p className="muted">No recurring terms yet.</p>
              ) : (
                analytics.topTerms.map((item) => (
                  <p key={item.term}>
                    {item.term}: {item.count}
                  </p>
                ))
              )}
            </section>
            <section className="analytics-card">
              <h3>Timer History</h3>
              {timerHistory.length === 0 ? (
                <p className="muted">No completed rounds yet.</p>
              ) : (
                timerHistory.map((item, index) => (
                  <p key={`${item.startedAt}-${index}`}>
                    Round {index + 1}: {formatDuration(item.seconds)}
                  </p>
                ))
              )}
            </section>
          </div>

          {error ? <p className="error">{error}</p> : null}
          {notice ? <p className="success">{notice}</p> : null}
        </div>

        <div
          className="columns"
          style={{
            padding: '0 14px 14px',
            gridTemplateColumns: boardMode === 'open' ? '1fr' : undefined
          }}
        >
          {grouped.map((bucket) => (
            <CategoryColumn
              key={bucket.title}
              title={bucket.title}
              category={bucket.category}
              cards={bucket.cards}
              anonymousMode={anonymousMode}
              highlighted={highlighted}
              onToggleHighlight={toggleHighlight}
              onDelete={handleDeleteResponse}
              onDragStart={(id) => {
                draggingId.current = id;
              }}
              onDropCard={moveCard}
              dragEnabled={boardMode === 'categorized' && !ended && !archived}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
