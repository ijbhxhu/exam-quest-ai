PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('melances', 'manual', 'user_upload')),
  source_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drive_folders (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES exam_sources(id),
  grade INTEGER NOT NULL,
  subject TEXT NOT NULL,
  publisher TEXT NOT NULL,
  semester TEXT NOT NULL,
  exam_set TEXT,
  exam_type TEXT NOT NULL,
  folder_url TEXT NOT NULL UNIQUE,
  last_scanned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pdf_files (
  id TEXT PRIMARY KEY,
  drive_file_id TEXT UNIQUE,
  folder_id TEXT REFERENCES drive_folders(id),
  filename TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('exam', 'answer', 'other')),
  grade INTEGER NOT NULL,
  subject TEXT NOT NULL,
  publisher TEXT NOT NULL,
  semester TEXT NOT NULL,
  exam_type TEXT NOT NULL,
  source_url TEXT,
  preview_url TEXT,
  download_url TEXT,
  r2_key TEXT,
  sha256 TEXT,
  size_bytes INTEGER,
  mirror_status TEXT NOT NULL DEFAULT 'pending' CHECK (mirror_status IN ('pending', 'mirrored', 'failed', 'skipped')),
  ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending', 'processing', 'done', 'failed')),
  public_question_pack_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ocr_results (
  id TEXT PRIMARY KEY,
  pdf_file_id TEXT NOT NULL REFERENCES pdf_files(id),
  r2_json_key TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'done', 'failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS question_packs (
  id TEXT PRIMARY KEY,
  pdf_file_id TEXT NOT NULL REFERENCES pdf_files(id),
  title TEXT NOT NULL,
  grade INTEGER,
  subject TEXT,
  r2_json_key TEXT NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS anonymous_sessions (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS download_events (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES anonymous_sessions(id),
  pdf_file_id TEXT REFERENCES pdf_files(id),
  ip_hash TEXT NOT NULL,
  day_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES anonymous_sessions(id),
  question_pack_id TEXT REFERENCES question_packs(id),
  child_alias TEXT,
  grade INTEGER,
  subject TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS practice_answers (
  id TEXT PRIMARY KEY,
  practice_session_id TEXT NOT NULL REFERENCES practice_sessions(id),
  question_index INTEGER NOT NULL,
  answer_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  ai_feedback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pdf_lookup
  ON pdf_files (grade, subject, publisher, semester, exam_type, kind);

CREATE INDEX IF NOT EXISTS idx_pdf_drive_file_id
  ON pdf_files (drive_file_id);

CREATE INDEX IF NOT EXISTS idx_download_daily_limit
  ON download_events (ip_hash, day_key);

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('pdf_daily_limit', '30');

INSERT OR IGNORE INTO exam_sources (id, name, type, source_url)
VALUES ('melances', 'Melances Test Bank', 'melances', 'https://melances.com/test-bank/');
