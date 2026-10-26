CREATE TABLE stock_alerts (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    stock_id BIGINT NOT NULL
        REFERENCES stocks(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL,
    threshold NUMERIC(18,6) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    repeat_mode TEXT NOT NULL DEFAULT 'once',
    last_triggered_at TIMESTAMPTZ,
    last_triggered_market_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT stock_alerts_alert_type_check
        CHECK (alert_type IN (
            'price_above',
            'price_below',
            'daily_change_above',
            'daily_change_below'
        )),

    CONSTRAINT stock_alerts_repeat_mode_check
        CHECK (repeat_mode IN ('once', 'daily')),

    CONSTRAINT stock_alerts_threshold_check
        CHECK (
            (
                alert_type IN ('price_above', 'price_below', 'daily_change_above')
                AND threshold > 0
            )
            OR (
                alert_type = 'daily_change_below'
                AND threshold >= -100
                AND threshold < 0
            )
        )
);

CREATE INDEX idx_stock_alerts_user
ON stock_alerts (user_id, id DESC);

-- The alert check only reads active alerts.
CREATE INDEX idx_stock_alerts_active_stock
ON stock_alerts (stock_id)
WHERE is_active;

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    alert_id BIGINT
        REFERENCES stock_alerts(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    price NUMERIC(18,6) NOT NULL,
    daily_change_percent NUMERIC(18,6),
    price_time TIMESTAMPTZ NOT NULL,
    market_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,

    CONSTRAINT notifications_price_check CHECK (price > 0),

    -- Once/daily alerts produce at most one notification per market day.
    CONSTRAINT notifications_alert_market_date_unique
        UNIQUE (alert_id, market_date)
);

CREATE INDEX idx_notifications_user
ON notifications (user_id, id DESC);
