-- Widgets now store a snapshot of the table the query produced at the time
-- they were saved, so the Dashboard renders from that directly instead of
-- re-running sql_text every time it loads. sql_text is kept for reference
-- (e.g. explicit Refresh) but is no longer required for default rendering.
ALTER TABLE widgets ADD COLUMN IF NOT EXISTS data JSONB;
