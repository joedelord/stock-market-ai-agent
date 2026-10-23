import { useState } from "react";
import { getErrorMessage } from "../../services/errors";

const inputClass =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 disabled:bg-gray-100";

// Same limits as server/validations/alertSchemas.js.
const MAX_THRESHOLD = 999999999999.9999;
const MAX_DAILY_FALL = 100;
const THRESHOLD_DECIMALS = 6;

function getValidationError(stockId, threshold, isFall) {
  if (!stockId) return "Choose a stock.";
  const value = Number(threshold);
  if (!threshold.trim() || !Number.isFinite(value) || value <= 0)
    return "Enter a threshold greater than zero.";
  if (isFall && value > MAX_DAILY_FALL)
    return `A daily fall cannot exceed ${MAX_DAILY_FALL}%.`;
  if (value > MAX_THRESHOLD) return "The threshold is too large.";
  if (value !== Number(value.toFixed(THRESHOLD_DECIMALS)))
    return `Use at most ${THRESHOLD_DECIMALS} decimal places.`;
  return "";
}

function AlertForm({
  stocks,
  alert,
  initialStockId = "",
  onSave,
  onCancel,
  disabled = false,
}) {
  const [stockId, setStockId] = useState(
    String(alert?.stock_id ?? initialStockId),
  );
  const [alertType, setAlertType] = useState(
    alert?.alert_type ?? "daily_change_above",
  );
  const [threshold, setThreshold] = useState(
    alert ? String(Math.abs(Number(alert.threshold))) : "",
  );
  const [repeatMode, setRepeatMode] = useState(alert?.repeat_mode ?? "once");
  const [isActive, setIsActive] = useState(alert?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stock = stocks.find((item) => String(item.id) === stockId);
  const daily = alertType.startsWith("daily_change_");
  const isFall = alertType === "daily_change_below";

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = getValidationError(stockId, threshold, isFall);
    if (validationError) {
      setError(validationError);
      return;
    }
    const value = Number(threshold);
    setSaving(true);
    setError("");
    try {
      const rule = {
        alertType,
        threshold: isFall ? -value : value,
        repeatMode,
      };
      await onSave(alert ? { ...rule, isActive } : { ...rule, stockId });
    } catch (error) {
      setError(
        getErrorMessage(error, "Could not save alert. Please try again."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={alert ? "Edit alert" : "Create alert"}
    >
      <fieldset
        disabled={saving || disabled}
        className="space-y-4 disabled:opacity-70"
      >
        <label className="block text-sm font-medium" htmlFor="alert-stock">
          Stock
          <select
            id="alert-stock"
            value={stockId}
            onChange={(event) => setStockId(event.target.value)}
            disabled={Boolean(alert)}
            required
            className={inputClass}
          >
            <option value="">Choose a stock</option>
            {stocks.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.name} · {item.symbol} ({item.exchange}) · {item.currency}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium" htmlFor="alert-type">
            Condition
            <select
              id="alert-type"
              value={alertType}
              onChange={(event) => setAlertType(event.target.value)}
              className={inputClass}
            >
              <option value="daily_change_above">Day rises by at least</option>
              <option value="daily_change_below">Day falls by at least</option>
              <option value="price_above">Price at or above</option>
              <option value="price_below">Price at or below</option>
            </select>
          </label>
          <label
            className="block text-sm font-medium"
            htmlFor="alert-threshold"
          >
            {daily
              ? "Daily change (%)"
              : `Target price (${stock?.currency ?? "stock currency"})`}
            <input
              id="alert-threshold"
              type="number"
              inputMode="decimal"
              min="0.000001"
              max={isFall ? MAX_DAILY_FALL : MAX_THRESHOLD}
              step="0.000001"
              required
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              placeholder={daily ? "3" : "100"}
              className={inputClass}
              aria-describedby="alert-threshold-help"
            />
          </label>
        </div>
        <p id="alert-threshold-help" className="text-sm text-gray-500">
          {daily
            ? "Compared with the previous trading day's close. Enter a positive amount, e.g. 3 for a 3% rise or fall."
            : "Uses the stock's quoted currency. The exact target also satisfies the condition."}
        </p>
        <label className="block text-sm font-medium" htmlFor="alert-repeat">
          Repeat
          <select
            id="alert-repeat"
            value={repeatMode}
            onChange={(event) => setRepeatMode(event.target.value)}
            className={inputClass}
          >
            <option value="once">Once, then switch off</option>
            <option value="daily">Once per trading day</option>
          </select>
        </label>
        {alert && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Alert enabled
          </label>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            {saving ? "Saving..." : alert ? "Save changes" : "Create alert"}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-gray-300 px-4 py-2"
            >
              Cancel editing
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}

export default AlertForm;
