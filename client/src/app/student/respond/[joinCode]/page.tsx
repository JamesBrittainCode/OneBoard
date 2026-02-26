'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createSocket } from '@/lib/socket';
import { getSession, submitResponse } from '@/lib/api';
import { getStudentId, getSubmissionStatus, setSubmissionStatus } from '@/lib/storage';

export default function StudentRespondPage() {
  const params = useParams<{ joinCode: string }>();
  const joinCode = params.joinCode.toUpperCase();

  const [prompt, setPrompt] = useState('');
  const [content, setContent] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    setSubmitted(getSubmissionStatus(joinCode));

    let mounted = true;

    getSession(joinCode)
      .then((data) => {
        if (!mounted) return;
        setPrompt(data.session.prompt);
      })
      .catch((_error) => {
        if (!mounted) return;
        setError('Invalid or ended session.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const socket = createSocket();
    socket.emit('session:join', { joinCode, role: 'student' });
    socket.on('session:ended', () => {
      setEnded(true);
      setError('Session has ended.');
    });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, [joinCode]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitted || ended || sending) return;

    const text = content.trim();
    if (!text) {
      setError('Please type your response.');
      return;
    }

    setSending(true);
    setError('');
    try {
      await submitResponse(joinCode, getStudentId(joinCode), text);
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
      </section>
    </main>
  );
}
