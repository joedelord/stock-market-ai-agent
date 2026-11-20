-- Opt-in, because a daily email nobody asked for would be marked as spam and
-- hurt delivery of the alert emails too.
ALTER TABLE users
  ADD COLUMN email_digest_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- One row per user and US market day, so a restarted scheduler or a retry
-- never sends the same summary twice.
CREATE TABLE daily_digests (
    user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    digest_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, digest_date),

    CONSTRAINT daily_digests_status_check
        CHECK (status IN ('pending', 'sent', 'failed', 'cancelled'))
);

-- The sender only reads pending digests.
CREATE INDEX idx_daily_digests_pending
ON daily_digests (digest_date)
WHERE status = 'pending';

-- Supports deleting old rows.
CREATE INDEX idx_daily_digests_created_at
ON daily_digests (created_at);
