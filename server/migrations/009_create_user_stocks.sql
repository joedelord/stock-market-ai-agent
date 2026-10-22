CREATE TABLE user_stocks (
    user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    stock_id BIGINT NOT NULL
        REFERENCES stocks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, stock_id)
);

-- Supports the scheduler and stock deletion without scanning all watchlists.
CREATE INDEX idx_user_stocks_stock_id
ON user_stocks (stock_id);
