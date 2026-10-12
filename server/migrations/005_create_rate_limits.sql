CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,

  hits INTEGER NOT NULL,

  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX rate_limits_reset_at_idx ON rate_limits (reset_at);
