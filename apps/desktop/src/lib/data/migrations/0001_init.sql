-- The desktop app's data (desktop-app D4): the club's shapes for one local player, so no users and no owners.
-- Ids are UUID v7 text; times ISO-8601 UTC text; lists and trees JSON text.

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE games (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL CHECK (status IN ('playing', 'ended')),
  person_color  TEXT NOT NULL CHECK (person_color IN ('white', 'black')),
  engine_level  TEXT NOT NULL,
  think_seconds INTEGER NOT NULL,
  ply           INTEGER NOT NULL DEFAULT 0,
  fen           TEXT NOT NULL,
  result        TEXT,
  reason        TEXT,
  pgn           TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  ended_at      TEXT
);
CREATE INDEX games_recent ON games (updated_at DESC, id DESC);

CREATE TABLE moves (
  game_id   TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  ply       INTEGER NOT NULL,
  uci       TEXT NOT NULL,
  san       TEXT NOT NULL,
  fen_after TEXT NOT NULL,
  played_at TEXT NOT NULL,
  PRIMARY KEY (game_id, ply)
);

CREATE TABLE studies (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  start_fen  TEXT NOT NULL,
  tree       TEXT NOT NULL,
  white      TEXT,
  black      TEXT,
  result     TEXT,
  date       TEXT,
  version    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX studies_recent ON studies (updated_at DESC, id DESC);

CREATE TABLE position_evaluations (
  position_key TEXT NOT NULL,
  think_ms     INTEGER NOT NULL,
  depth        INTEGER NOT NULL,
  lines        TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  PRIMARY KEY (position_key, think_ms)
);

CREATE TABLE reviews (
  game_id      TEXT PRIMARY KEY REFERENCES games (id) ON DELETE CASCADE,
  requested_at TEXT NOT NULL,
  complete     INTEGER NOT NULL DEFAULT 0,
  synced       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE trainer_progress (
  line_key   TEXT NOT NULL,
  color      TEXT NOT NULL CHECK (color IN ('white', 'black')),
  study_id   TEXT REFERENCES studies (id) ON DELETE CASCADE,
  box        INTEGER NOT NULL,
  due_at     TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (line_key, color)
);

CREATE TABLE mistake_drills (
  id           TEXT PRIMARY KEY,
  game_id      TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  ply          INTEGER NOT NULL,
  fen          TEXT NOT NULL,
  played_uci   TEXT NOT NULL,
  played_san   TEXT NOT NULL,
  accepted_uci TEXT NOT NULL,
  best_line    TEXT NOT NULL,
  class        TEXT NOT NULL CHECK (class IN ('mistake', 'blunder')),
  box          INTEGER,
  due_at       TEXT,
  updated_at   TEXT NOT NULL
);

CREATE TABLE library_games (
  id           TEXT PRIMARY KEY,
  white        TEXT NOT NULL,
  black        TEXT NOT NULL,
  event        TEXT,
  site         TEXT,
  round        TEXT,
  date_text    TEXT,
  year         INTEGER,
  result       TEXT NOT NULL,
  eco          TEXT,
  opening_name TEXT,
  moves_uci    TEXT NOT NULL,
  ply          INTEGER NOT NULL,
  source       TEXT NOT NULL,
  licence      TEXT NOT NULL,
  source_ref   TEXT,
  dedupe_key   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL
);
CREATE INDEX library_games_white ON library_games (white COLLATE NOCASE);
CREATE INDEX library_games_black ON library_games (black COLLATE NOCASE);
CREATE INDEX library_games_year ON library_games (year);

CREATE TABLE library_positions (
  game_id      TEXT NOT NULL REFERENCES library_games (id) ON DELETE CASCADE,
  ply          INTEGER NOT NULL,
  position_key TEXT NOT NULL,
  next_uci     TEXT,
  result       TEXT NOT NULL,
  source       TEXT NOT NULL,
  PRIMARY KEY (game_id, ply)
);
CREATE INDEX library_positions_key ON library_positions (position_key);

CREATE TABLE openings (
  position_key TEXT PRIMARY KEY,
  eco          TEXT NOT NULL,
  name         TEXT NOT NULL,
  moves_uci    TEXT NOT NULL
);

CREATE TABLE training_candidates (
  position_key TEXT PRIMARY KEY,
  game_id      TEXT NOT NULL REFERENCES library_games (id) ON DELETE CASCADE,
  ply          INTEGER NOT NULL,
  fen          TEXT NOT NULL,
  next_uci     TEXT NOT NULL,
  asked_at     TEXT,
  judged_at    TEXT,
  critical     INTEGER
);

CREATE TABLE training_positions (
  id              TEXT PRIMARY KEY,
  position_key    TEXT NOT NULL UNIQUE,
  fen             TEXT NOT NULL,
  master_uci      TEXT NOT NULL,
  accepted_uci    TEXT NOT NULL,
  best_line       TEXT NOT NULL,
  gap             REAL NOT NULL,
  phase           TEXT NOT NULL CHECK (phase IN ('middlegame', 'endgame')),
  eco             TEXT,
  opening_name    TEXT,
  white           TEXT NOT NULL,
  black           TEXT NOT NULL,
  event           TEXT,
  year            INTEGER,
  library_game_id TEXT NOT NULL REFERENCES library_games (id) ON DELETE CASCADE,
  ply             INTEGER NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE training_progress (
  position_id TEXT PRIMARY KEY REFERENCES training_positions (id) ON DELETE CASCADE,
  box         INTEGER NOT NULL,
  due_at      TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE news_items (
  url          TEXT PRIMARY KEY,
  source       TEXT NOT NULL,
  title        TEXT NOT NULL,
  published_at TEXT NOT NULL,
  fetched_at   TEXT NOT NULL
);
CREATE INDEX news_items_recent ON news_items (published_at DESC);

CREATE TABLE chess_events (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  round_name TEXT,
  round_url  TEXT,
  ongoing    INTEGER NOT NULL,
  location   TEXT,
  fide_tc    TEXT,
  tier       INTEGER NOT NULL,
  starts_at  TEXT,
  ends_at    TEXT,
  fetched_at TEXT NOT NULL
);
