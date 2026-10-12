CREATE TABLE password_reset_tokens (
  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  token_hash CHAR(64) NOT NULL UNIQUE,

  expires_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX password_reset_tokens_user_id_idx
  ON password_reset_tokens (user_id);
