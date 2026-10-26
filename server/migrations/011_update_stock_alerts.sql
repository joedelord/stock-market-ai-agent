-- Limited to the rule fields, so recording a trigger time alone does not
-- count as an update. Uses set_updated_at() from migration 006.
CREATE TRIGGER stock_alerts_set_updated_at
  BEFORE UPDATE OF alert_type, threshold, repeat_mode, is_active ON stock_alerts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- An edited or resumed alert may fire again on the same market day. The
-- trigger date on stock_alerts, updated under a row lock, already limits
-- each alert to one notification per day otherwise.
ALTER TABLE notifications
  DROP CONSTRAINT notifications_alert_market_date_unique;

CREATE INDEX idx_notifications_alert
ON notifications (alert_id);
