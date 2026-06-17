-- Query Studio: core schema + demo dataset
-- Run once via `npm run migrate` (see src/migrate.js)

CREATE TABLE IF NOT EXISTS app_users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS widgets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  chart_type  TEXT NOT NULL,
  sql_text    TEXT NOT NULL,
  label_col   TEXT,
  val_col     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS datasources (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  table_name        TEXT NOT NULL,
  original_filename TEXT,
  row_count         INTEGER,
  size_bytes        INTEGER,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, table_name)
);

-- Shared, read-only demo dataset every user can query alongside their own tables.
CREATE SCHEMA IF NOT EXISTS demo;

DROP TABLE IF EXISTS demo.gnn_alerts;
CREATE TABLE demo.gnn_alerts (
  id INTEGER, severity TEXT, status TEXT, source TEXT, region TEXT, alert_count INTEGER, ts TEXT
);
INSERT INTO demo.gnn_alerts (id, severity, status, source, region, alert_count, ts) VALUES
  (1,'Critical','open','MME-01','NJ-NORTH',14,'2026-06-17 08:00'),
  (2,'Major','open','MME-02','NJ-NORTH',23,'2026-06-17 08:05'),
  (3,'Minor','closed','AMF-01','NJ-SOUTH',41,'2026-06-17 08:10'),
  (4,'Critical','open','eNB-01','NJ-NORTH',9,'2026-06-17 08:15'),
  (5,'Major','open','UPF-01','NJ-SOUTH',17,'2026-06-17 08:20'),
  (6,'Info','closed','SMF-01','NJ-EAST',5,'2026-06-17 08:25'),
  (7,'Critical','open','MME-03','NJ-NORTH',31,'2026-06-17 08:30'),
  (8,'Major','closed','AMF-02','NJ-EAST',12,'2026-06-17 08:35');

DROP TABLE IF EXISTS demo.incidents;
CREATE TABLE demo.incidents (
  id INTEGER, title TEXT, priority TEXT, team TEXT, status TEXT, duration_min INTEGER
);
INSERT INTO demo.incidents (id, title, priority, team, status, duration_min) VALUES
  (1,'Core network outage','P1','Backend','open',45),
  (2,'API latency spike','P2','Frontend','closed',20),
  (3,'DB connection slowdown','P1','DevOps','open',90),
  (4,'Auth service failure','P3','Backend','closed',12),
  (5,'CDN routing issue','P2','DevOps','open',35);

DROP TABLE IF EXISTS demo.users;
CREATE TABLE demo.users (
  id INTEGER, team TEXT, tickets INTEGER, region TEXT
);
INSERT INTO demo.users (id, team, tickets, region) VALUES
  (1,'Backend',18,'NJ'),
  (2,'Frontend',12,'NJ'),
  (3,'DevOps',9,'NY'),
  (4,'QA',22,'NY'),
  (5,'Design',5,'NJ');
