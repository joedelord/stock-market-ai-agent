CREATE TABLE stock_quotes (
    stock_id BIGINT PRIMARY KEY
        REFERENCES stocks(id) ON DELETE CASCADE,

    price_time TIMESTAMPTZ NOT NULL,
    close NUMERIC(18,6) NOT NULL,
    previous_close NUMERIC(18,6) NOT NULL,

    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT stock_quotes_close_positive
        CHECK (close > 0),

    CONSTRAINT stock_quotes_previous_close_positive
        CHECK (previous_close > 0)
);