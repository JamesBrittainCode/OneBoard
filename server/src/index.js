import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { Server } from 'socket.io';
import db from './db.js';
import {
  createJoinCode,
  createTeacherToken,
  hashPassword,
  verifyPassword,
  signAuthToken,
  verifyAuthToken,
  sanitizeInput,
  normalizeCode,
  isAllowedCategory,
  CATEGORIES
} from './utils.js';
import {
  connectStudent,
  disconnectStudent,
  getStudentCount,
  canSubmitNow
} from './sessionState.js';

const PORT = Number(process.env.PORT || 4000);
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const ALLOW_VERCEL_PREVIEW = String(process.env.ALLOW_VERCEL_PREVIEW || '').toLowerCase() === 'true';
const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-change-this-secret';

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (ALLOW_VERCEL_PREVIEW && origin.endsWith('.vercel.app')) return true;
  return false;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PATCH']
  }
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    }
  })
);
app.use(express.json({ limit: '50kb' }));

const statements = {
  createTeacherUser: db.prepare(
    'INSERT INTO teacher_users (email, password_hash) VALUES (?, ?)'
  ),
  getTeacherUserByEmail: db.prepare(
    'SELECT id, email, password_hash, created_at FROM teacher_users WHERE email = ?'
  ),
  getTeacherUserById: db.prepare(
    'SELECT id, email, created_at FROM teacher_users WHERE id = ?'
  ),
  createSession: db.prepare(
    'INSERT INTO sessions (prompt, join_code, teacher_token, teacher_user_id, active) VALUES (?, ?, ?, ?, 1)'
  ),
  getSessionByCode: db.prepare(
    'SELECT id, prompt, join_code, teacher_token, teacher_user_id, created_at, active FROM sessions WHERE join_code = ?'
  ),
  getSessionById: db.prepare(
    'SELECT id, prompt, join_code, teacher_token, teacher_user_id, created_at, active FROM sessions WHERE id = ?'
  ),
  deactivateSession: db.prepare('UPDATE sessions SET active = 0 WHERE id = ?'),
  createResponse: db.prepare(
    'INSERT INTO responses (session_id, student_id, content, category) VALUES (?, ?, ?, NULL)'
  ),
  updateCategory: db.prepare('UPDATE responses SET category = ? WHERE id = ?'),
  getResponsesBySession: db.prepare(
    'SELECT id, session_id, content, created_at, category FROM responses WHERE session_id = ? ORDER BY created_at DESC'
  ),
  getResponseBySessionAndStudent: db.prepare(
    'SELECT id FROM responses WHERE session_id = ? AND student_id = ?'
  ),
  exportSessionRows: db.prepare(
    `SELECT s.join_code, s.prompt, r.id as response_id, r.content, r.category, r.created_at
     FROM sessions s
     LEFT JOIN responses r ON r.session_id = s.id
     WHERE s.id = ?
     ORDER BY r.created_at DESC`
  )
};

function createAuthToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    iat: now,
    exp: now + 60 * 60 * 24 * 14
  };
  return signAuthToken(payload, AUTH_SECRET);
}

function getAuthUser(req) {
  const header = String(req.headers.authorization || '');
  const tokenFromHeader = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const tokenFromQuery = String(req.query.authToken || '').trim();
  const token = tokenFromHeader || tokenFromQuery;
  if (!token) return null;
  const payload = verifyAuthToken(token, AUTH_SECRET);
  if (!payload || !payload.sub || !payload.exp) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now > Number(payload.exp)) return null;

  const user = statements.getTeacherUserById.get(Number(payload.sub));
  return user || null;
}

function requireAuth(req, res, next) {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  req.user = user;
  return next();
}

function safeCreateSession(prompt, teacherUserId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const joinCode = createJoinCode(6);
    const teacherToken = createTeacherToken();
    try {
      const tx = db.transaction(() => {
        const insert = statements.createSession.run(prompt, joinCode, teacherToken, teacherUserId);
        return statements.getSessionById.get(insert.lastInsertRowid);
      });
      return tx();
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed: sessions.join_code')) {
        continue;
      }
      throw error;
    }
  }
  throw new Error('Unable to generate unique join code.');
}

function sessionPayload(session) {
  return {
    id: session.id,
    prompt: session.prompt,
    joinCode: session.join_code,
    createdAt: session.created_at,
    active: Boolean(session.active)
  };
}

function responsePayload(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    content: row.content,
    createdAt: row.created_at,
    category: row.category
  };
}

function teacherOwnsSession(session, teacherUserId) {
  return Number(session.teacher_user_id) === Number(teacherUserId);
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/register', (req, res) => {
  const email = sanitizeInput(req.body?.email || '').toLowerCase().slice(0, 120);
  const password = String(req.body?.password || '');

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const passwordHash = hashPassword(password);
    const insert = statements.createTeacherUser.run(email, passwordHash);
    const user = statements.getTeacherUserById.get(insert.lastInsertRowid);
    const token = createAuthToken(user);
    return res.status(201).json({ user, token });
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed: teacher_users.email')) {
      return res.status(409).json({ error: 'Email already registered.' });
    }
    return res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const email = sanitizeInput(req.body?.email || '').toLowerCase().slice(0, 120);
  const password = String(req.body?.password || '');

  const user = statements.getTeacherUserByEmail.get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = createAuthToken(user);
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at
    },
    token
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

app.post('/api/sessions', requireAuth, (req, res) => {
  const prompt = sanitizeInput(req.body?.prompt || '').slice(0, 400);
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  try {
    const session = safeCreateSession(prompt, req.user.id);
    return res.status(201).json({
      session: sessionPayload(session),
      categories: CATEGORIES
    });
  } catch (error) {
    return res.status(500).json({ error: 'Could not create session.' });
  }
});

app.get('/api/sessions/:joinCode', (req, res) => {
  const joinCode = normalizeCode(req.params.joinCode);
  const session = statements.getSessionByCode.get(joinCode);
  if (!session || !session.active) {
    return res.status(404).json({ error: 'Session not found or ended.' });
  }

  return res.json({
    session: sessionPayload(session)
  });
});

app.get('/api/teacher/sessions/:joinCode', requireAuth, (req, res) => {
  const joinCode = normalizeCode(req.params.joinCode);
  const session = statements.getSessionByCode.get(joinCode);
  if (!session || !session.active) {
    return res.status(404).json({ error: 'Session not found or ended.' });
  }
  if (!teacherOwnsSession(session, req.user.id)) {
    return res.status(403).json({ error: 'Unauthorized teacher access.' });
  }

  const responses = statements
    .getResponsesBySession
    .all(session.id)
    .map(responsePayload);

  return res.json({
    session: sessionPayload(session),
    responses,
    categories: CATEGORIES,
    studentCount: getStudentCount(joinCode)
  });
});

app.post('/api/sessions/:joinCode/validate', (req, res) => {
  const joinCode = normalizeCode(req.params.joinCode);
  const session = statements.getSessionByCode.get(joinCode);
  if (!session || !session.active) {
    return res.status(404).json({ error: 'Invalid join code.' });
  }
  return res.json({ session: sessionPayload(session) });
});

app.post('/api/sessions/:joinCode/responses', (req, res) => {
  const joinCode = normalizeCode(req.params.joinCode);
  const session = statements.getSessionByCode.get(joinCode);
  if (!session || !session.active) {
    return res.status(404).json({ error: 'Session has ended.' });
  }

  const studentId = sanitizeInput(req.body?.studentId || '').slice(0, 80);
  const content = sanitizeInput(req.body?.content || '').slice(0, 250);

  if (!studentId) {
    return res.status(400).json({ error: 'Missing student identifier.' });
  }
  if (!content) {
    return res.status(400).json({ error: 'Response is required.' });
  }
  if (!canSubmitNow(joinCode, studentId)) {
    return res.status(429).json({ error: 'Please wait before trying again.' });
  }

  const existing = statements.getResponseBySessionAndStudent.get(session.id, studentId);
  if (existing) {
    return res.status(409).json({ error: 'Response already submitted.' });
  }

  try {
    const insert = statements.createResponse.run(session.id, studentId, content);
    const created = db
      .prepare(
        'SELECT id, session_id, content, created_at, category FROM responses WHERE id = ?'
      )
      .get(insert.lastInsertRowid);
    const payload = responsePayload(created);

    io.to(`session:${joinCode}`).emit('response:new', payload);

    return res.status(201).json({ response: payload });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to submit response.' });
  }
});

app.patch('/api/sessions/:joinCode/responses/:responseId', requireAuth, (req, res) => {
  const joinCode = normalizeCode(req.params.joinCode);
  const session = statements.getSessionByCode.get(joinCode);
  if (!session || !session.active) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  if (!teacherOwnsSession(session, req.user.id)) {
    return res.status(403).json({ error: 'Unauthorized teacher access.' });
  }

  const responseId = Number(req.params.responseId);
  const nextCategory = req.body?.category === null ? null : sanitizeInput(req.body?.category || '');
  if (!Number.isFinite(responseId) || !isAllowedCategory(nextCategory)) {
    return res.status(400).json({ error: 'Invalid category update.' });
  }

  const result = statements.updateCategory.run(nextCategory, responseId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Response not found.' });
  }

  io.to(`session:${joinCode}`).emit('response:category-updated', {
    id: responseId,
    category: nextCategory
  });

  return res.json({ ok: true });
});

app.post('/api/sessions/:joinCode/end', requireAuth, (req, res) => {
  const joinCode = normalizeCode(req.params.joinCode);
  const session = statements.getSessionByCode.get(joinCode);
  if (!session || !session.active) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  if (!teacherOwnsSession(session, req.user.id)) {
    return res.status(403).json({ error: 'Unauthorized teacher access.' });
  }

  statements.deactivateSession.run(session.id);
  io.to(`session:${joinCode}`).emit('session:ended');

  return res.json({ ok: true });
});

app.get('/api/sessions/:joinCode/export.csv', requireAuth, (req, res) => {
  const joinCode = normalizeCode(req.params.joinCode);
  const session = statements.getSessionByCode.get(joinCode);
  if (!session) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  if (!teacherOwnsSession(session, req.user.id)) {
    return res.status(403).json({ error: 'Unauthorized teacher access.' });
  }

  const rows = statements.exportSessionRows.all(session.id);
  const header = ['join_code', 'prompt', 'response_id', 'content', 'category', 'created_at'];

  const csv = [header.join(',')]
    .concat(
      rows.map((row) =>
        [
          row.join_code,
          row.prompt,
          row.response_id ?? '',
          row.content ?? '',
          row.category ?? '',
          row.created_at ?? ''
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      )
    )
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="oneboard-${joinCode}.csv"`);
  return res.send(csv);
});

io.on('connection', (socket) => {
  socket.on('session:join', ({ joinCode, role }) => {
    const normalized = normalizeCode(joinCode);
    if (!normalized) return;

    socket.join(`session:${normalized}`);
    socket.data.joinCode = normalized;
    socket.data.role = role;

    if (role === 'student') {
      connectStudent(normalized, socket.id);
      io.to(`session:${normalized}`).emit('session:student-count', {
        count: getStudentCount(normalized)
      });
    }
  });

  socket.on('disconnect', () => {
    if (socket.data.role === 'student' && socket.data.joinCode) {
      disconnectStudent(socket.data.joinCode, socket.id);
      io.to(`session:${socket.data.joinCode}`).emit('session:student-count', {
        count: getStudentCount(socket.data.joinCode)
      });
    }
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`OneBoard server listening on http://localhost:${PORT}`);
});
