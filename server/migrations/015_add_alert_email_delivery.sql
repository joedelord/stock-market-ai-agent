-- Lets users stop alert emails without deleting their alerts. Alerts still
-- show up in the app.
ALTER TABLE users
  ADD COLUMN email_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Tracks each alert email, so a failed one is retried instead of lost.
-- 'none' means no email is due (unverified address, alert emails turned off,
-- or a notification from before this migration).
ALTER TABLE notifications
  ADD COLUMN email_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN email_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN email_last_attempt_at TIMESTAMPTZ,

  ADD CONSTRAINT notifications_email_status_check
    CHECK (email_status IN ('none', 'pending', 'sent', 'failed'));

-- The retry only reads pending emails.
CREATE INDEX idx_notifications_email_pending
ON notifications (id)
WHERE email_status = 'pending';
