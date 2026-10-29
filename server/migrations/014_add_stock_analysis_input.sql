-- The metrics and news an analysis was written from. When Groq is busy an
-- older analysis is returned with these, so its numbers and [n] citations
-- still match the data shown next to it. Older rows have none and are not
-- used as a fallback.
ALTER TABLE stock_analyses
  ADD COLUMN metrics JSONB,
  ADD COLUMN news JSONB;

-- Supports finding the newest analysis of a stock.
CREATE INDEX idx_stock_analyses_stock_created_at
ON stock_analyses (stock_id, created_at DESC);
