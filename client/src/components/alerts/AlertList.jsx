function formatTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-GB", { timeZone: "Europe/Helsinki" });
}

function describeAlert(alert) {
  const threshold = Number(alert.threshold).toLocaleString("en-GB", {
    maximumFractionDigits: 6,
  });
  switch (alert.alert_type) {
    case "price_above":
      return `Price ≥ ${threshold} ${alert.currency}`;
    case "price_below":
      return `Price ≤ ${threshold} ${alert.currency}`;
    case "daily_change_above":
      return `Day change ≥ +${threshold}%`;
    case "daily_change_below":
      return `Day change ≤ ${threshold}%`;
    default:
      return "Unknown condition";
  }
}

function AlertList({
  alerts,
  busy,
  deletingId,
  onEdit,
  onToggle,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
}) {
  if (!alerts.length)
    return (
      <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
        No alerts yet. Create your first alert using the form.
      </p>
    );
  return (
    <ul className="space-y-3" aria-label="Your alerts">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className="rounded-xl border border-gray-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">
                {alert.name}{" "}
                <span className="text-sm font-normal text-gray-500">
                  {alert.symbol} · {alert.exchange}
                </span>
              </h3>
              <p className="mt-2 font-medium">{describeAlert(alert)}</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${alert.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
            >
              {alert.is_active ? "Active" : "Off"}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {alert.repeat_mode === "daily"
              ? "Once per trading day"
              : "Once, then switch off"}
          </p>
          {alert.last_triggered_at && (
            <p className="mt-1 text-xs text-gray-500">
              Last triggered:{" "}
              {formatTime(alert.last_triggered_at)}{" "}
              (Helsinki)
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <button
              type="button"
              disabled={busy}
              onClick={() => onEdit(alert)}
              className="text-blue-700 underline disabled:opacity-50"
              aria-label={`Edit alert for ${alert.symbol}`}
            >
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onToggle(alert)}
              className="text-blue-700 underline disabled:opacity-50"
              aria-label={`${alert.is_active ? "Pause" : "Enable"} alert for ${alert.symbol}`}
            >
              {alert.is_active ? "Pause" : "Enable"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(alert.id)}
              className="text-red-700 underline disabled:opacity-50"
              aria-label={`Delete alert for ${alert.symbol}`}
            >
              Delete
            </button>
          </div>
          {String(deletingId) === String(alert.id) && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm">
              <p>Delete this alert? Existing notifications will be kept.</p>
              <div className="mt-2 flex gap-4">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onConfirmDelete(alert)}
                  className="font-medium text-red-700 underline"
                >
                  Confirm delete
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onCancelDelete}
                  className="underline"
                >
                  Keep alert
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default AlertList;
