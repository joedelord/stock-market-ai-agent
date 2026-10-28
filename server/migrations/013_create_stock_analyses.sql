-- Stored AI analyses, reused while their exact Groq input is unchanged, so
-- repeated clicks don't spend the shared provider quota.
CREATE TABLE stock_analyses (
    stock_id BIGINT NOT NULL
        REFERENCES stocks(id) ON DELETE CASCADE,
    cache_key CHAR(64) NOT NULL,
    analysis JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (stock_id, cache_key)
);

-- Supports deleting expired analyses.
CREATE INDEX idx_stock_analyses_created_at
ON stock_analyses (created_at);
