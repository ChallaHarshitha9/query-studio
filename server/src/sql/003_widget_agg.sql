-- Widgets now remember an aggregation function (count/sum/avg/min/max) so
-- pie/bar/line charts can group rows by label_col instead of plotting one
-- slice/bar per raw row.
ALTER TABLE widgets ADD COLUMN IF NOT EXISTS agg TEXT NOT NULL DEFAULT 'count';
