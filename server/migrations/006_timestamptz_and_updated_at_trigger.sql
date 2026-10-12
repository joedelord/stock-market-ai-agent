-- Existing values are interpreted in the session time zone, which is the
-- same zone CURRENT_TIMESTAMP used when they were written.
ALTER TABLE users
  ALTER COLUMN created_at TYPE TIMESTAMPTZ,
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ;

CREATE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Limited to account fields, so a logout bumping token_version does not
-- count as an update.
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE OF username, email, password_hash, role ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
