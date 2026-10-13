CREATE TABLE IF NOT EXISTS stocks (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(30) NOT NULL,
    exchange VARCHAR(30) NOT NULL,
    name VARCHAR(200) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT stocks_symbol_exchange_unique
        UNIQUE (symbol, exchange)
);

CREATE TABLE IF NOT EXISTS stock_prices (
    id BIGSERIAL PRIMARY KEY,
    stock_id BIGINT NOT NULL
        REFERENCES stocks(id) ON DELETE CASCADE,
    price_time TIMESTAMPTZ NOT NULL,
    interval_code VARCHAR(10) NOT NULL DEFAULT '1day',
    open NUMERIC(18,6),
    high NUMERIC(18,6),
    low NUMERIC(18,6),
    close NUMERIC(18,6) NOT NULL,
    volume BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT stock_prices_unique
        UNIQUE (stock_id, interval_code, price_time),

    CONSTRAINT stock_prices_close_positive CHECK (close > 0),
    CONSTRAINT stock_prices_volume_positive
        CHECK (volume IS NULL OR volume >= 0)
);

CREATE INDEX idx_stock_prices_lookup
ON stock_prices (stock_id, interval_code, price_time DESC);