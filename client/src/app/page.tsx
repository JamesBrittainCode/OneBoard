import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="shell centered">
      <section className="panel hero">
        <h1>OneBoard</h1>
        <p>A real-time classroom thinking wall.</p>
        <div className="stack actions">
          <Link href="/teacher" className="button primary">
            Teacher
          </Link>
          <Link href="/student" className="button">
            Student
          </Link>
        </div>
      </section>
    </main>
  );
}
