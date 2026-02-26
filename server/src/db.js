import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'oneboard.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS teacher_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE,
    teacher_token TEXT NOT NULL,
    teacher_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (teacher_user_id) REFERENCES teacher_users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    student_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    category TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, student_id)
  );
`);

const sessionColumns = db
  .prepare("SELECT name FROM pragma_table_info('sessions')")
  .all()
  .map((row) => row.name);

if (!sessionColumns.includes('teacher_token')) {
  db.exec("ALTER TABLE sessions ADD COLUMN teacher_token TEXT NOT NULL DEFAULT ''");
}
if (!sessionColumns.includes('teacher_user_id')) {
  db.exec('ALTER TABLE sessions ADD COLUMN teacher_user_id INTEGER');
}

export default db;
