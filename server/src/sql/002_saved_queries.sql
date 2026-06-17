-- Saved queries: distinct from widgets, just a name + SQL text a user can re-load later.
CREATE TABLE IF NOT EXISTS saved_queries (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sql_text   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
