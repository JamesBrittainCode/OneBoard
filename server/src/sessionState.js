const sessionConnections = new Map();
const submissionDebounce = new Map();

export function connectStudent(sessionCode, socketId) {
  if (!sessionConnections.has(sessionCode)) {
    sessionConnections.set(sessionCode, new Set());
  }
  sessionConnections.get(sessionCode).add(socketId);
}

export function disconnectStudent(sessionCode, socketId) {
  const room = sessionConnections.get(sessionCode);
  if (!room) return;
  room.delete(socketId);
  if (room.size === 0) {
    sessionConnections.delete(sessionCode);
  }
}

export function getStudentCount(sessionCode) {
  return sessionConnections.get(sessionCode)?.size ?? 0;
}

export function canSubmitNow(sessionCode, studentId, waitMs = 1200) {
  const key = `${sessionCode}:${studentId}`;
  const now = Date.now();
  const last = submissionDebounce.get(key) ?? 0;
  if (now - last < waitMs) {
    return false;
  }
  submissionDebounce.set(key, now);
  return true;
}
