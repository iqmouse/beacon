-- Beacon D1 schema
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  pw_hash    TEXT NOT NULL,
  pw_salt    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS books (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
