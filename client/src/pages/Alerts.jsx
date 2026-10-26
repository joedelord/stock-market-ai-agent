import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import AlertForm from "../components/alerts/AlertForm";
import AlertList from "../components/alerts/AlertList";
import NotificationCenter from "../components/NotificationCenter";
import {
  getAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
} from "../services/alertService";
import { getStocks } from "../services/stockService";
import { getErrorMessage } from "../services/errors";

function Alerts() {
  const [params] = useSearchParams();
  const [alerts, setAlerts] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [formVersion, setFormVersion] = useState(0);
  const formRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const [rules, catalog] = await Promise.allSettled([
        getAlerts({ signal: controller.signal }),
        getStocks({ signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      if (rules.status === "fulfilled") {
        setAlerts(rules.value);
        setListError("");
      } else
        setListError(getErrorMessage(rules.reason, "Could not load alerts."));
      if (catalog.status === "fulfilled") {
        setStocks(catalog.value);
        setCatalogError("");
      } else
        setCatalogError(
          getErrorMessage(catalog.reason, "Could not load stock catalog."),
        );
      setLoading(false);
    }
    load();
    return () => controller.abort();
  }, [reload]);

  function refresh() {
    setLoading(true);
    setActionError("");
    setReload((value) => value + 1);
  }

  async function save(rule) {
    setBusy(true);
    setNotice("");
    setActionError("");
    try {
      const saved = editing
        ? await updateAlert(editing.id, rule)
        : await createAlert(rule);
      const stock = stocks.find(
        (item) => String(item.id) === String(saved.stock_id),
      );
      const details = {
        symbol: stock?.symbol,
        name: stock?.name,
        exchange: stock?.exchange,
        currency: stock?.currency,
      };
      setAlerts((current) =>
        editing
          ? current.map((item) =>
              String(item.id) === String(saved.id)
                ? { ...item, ...saved }
                : item,
            )
          : [{ ...details, ...saved }, ...current],
      );
      setNotice(editing ? "Alert updated." : "Alert created.");
      setEditing(null);
      setFormVersion((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(alert) {
    setBusy(true);
    setDeletingId(null);
    setActionError("");
    setNotice("");
    try {
      const saved = await updateAlert(alert.id, { isActive: !alert.is_active });
      setAlerts((current) =>
        current.map((item) =>
          String(item.id) === String(saved.id) ? { ...item, ...saved } : item,
        ),
      );
      setNotice(saved.is_active ? "Alert enabled." : "Alert paused.");
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not update alert."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(alert) {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await deleteAlert(alert.id);
      setAlerts((current) =>
        current.filter((item) => String(item.id) !== String(alert.id)),
      );
      setDeletingId(null);
      setNotice("Alert deleted.");
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not delete alert."));
    } finally {
      setBusy(false);
    }
  }

  const availableStocks = stocks.filter((stock) => stock.is_active);
  if (
    editing &&
    !availableStocks.some(
      (stock) => String(stock.id) === String(editing.stock_id),
    )
  ) {
    availableStocks.push({
      id: editing.stock_id,
      name: editing.name,
      symbol: editing.symbol,
      exchange: editing.exchange,
      currency: editing.currency,
    });
  }
  const initialId = availableStocks.some(
    (stock) => String(stock.id) === params.get("stockId"),
  )
    ? params.get("stockId")
    : "";

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link to="/stocks" className="text-sm text-blue-700 underline">
              ← Back to watchlist
            </Link>
            <h1 className="mt-3 text-3xl font-bold">My alerts</h1>
            <p className="mt-2 max-w-xl text-sm text-gray-600">
              Set a target price or a daily percentage change. Alerts work
              independently of your watchlist.
            </p>
          </div>
          <NotificationCenter />
        </header>
        <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          Conditions are checked during scheduled market updates, about every 15
          minutes while the market is open. An already met condition can trigger
          at the next check using the latest stored price. Daily limits use the
          exchange's local date.
        </p>
        {notice && (
          <p
            role="status"
            className="rounded-lg bg-green-50 p-3 text-green-800"
          >
            {notice}
          </p>
        )}
        {actionError && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            {actionError}
          </p>
        )}
        {loading ? (
          <p role="status">Loading alerts and stocks...</p>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-5">
            <section
              ref={formRef}
              tabIndex={-1}
              aria-labelledby="alert-form-heading"
              className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2"
            >
              <h2
                id="alert-form-heading"
                className="mb-4 text-xl font-semibold"
              >
                {editing ? "Edit alert" : "Create alert"}
              </h2>
              {catalogError && (
                <p role="alert" className="mb-3 text-sm text-red-700">
                  {catalogError}
                </p>
              )}
              {listError ? (
                <p className="text-sm text-gray-500">
                  Reload your alerts before creating a new rule.
                </p>
              ) : catalogError && !editing ? (
                <button
                  type="button"
                  onClick={refresh}
                  className="text-blue-700 underline"
                >
                  Retry stock catalog
                </button>
              ) : !availableStocks.length ? (
                <p className="text-sm text-gray-500">
                  No active stocks are available yet.
                </p>
              ) : (
                <>
                  <AlertForm
                    key={`${editing?.id ?? "new"}-${formVersion}`}
                    stocks={availableStocks}
                    alert={editing}
                    initialStockId={initialId}
                    disabled={busy}
                    onSave={save}
                    onCancel={editing ? () => setEditing(null) : undefined}
                  />
                  {editing && (
                    <p className="mt-4 text-xs text-gray-500">
                      Saving a rule or re-enabling it lets it trigger again
                      today if its condition is met.
                    </p>
                  )}
                  <p className="mt-4 text-xs text-gray-500">
                    Up to 50 alerts per account, including alerts switched off.
                  </p>
                </>
              )}
            </section>
            <section
              aria-labelledby="alert-list-heading"
              className="lg:col-span-3"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="alert-list-heading" className="text-xl font-semibold">
                  Your alerts ({alerts.length})
                </h2>
                <button
                  type="button"
                  disabled={busy || Boolean(editing)}
                  onClick={refresh}
                  className="text-sm text-blue-700 underline disabled:opacity-50"
                >
                  Refresh alerts
                </button>
              </div>
              {listError ? (
                <div>
                  <p role="alert" className="text-red-700">
                    {listError}
                  </p>
                  <button
                    type="button"
                    onClick={refresh}
                    className="mt-2 text-blue-700 underline"
                  >
                    Retry alerts
                  </button>
                </div>
              ) : (
                <AlertList
                  alerts={alerts}
                  busy={busy || Boolean(editing)}
                  deletingId={deletingId}
                  onEdit={(alert) => {
                    setEditing(alert);
                    setDeletingId(null);
                    setActionError("");
                    setNotice("");
                    formRef.current?.focus();
                  }}
                  onToggle={toggle}
                  onDelete={setDeletingId}
                  onConfirmDelete={remove}
                  onCancelDelete={() => setDeletingId(null)}
                />
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

export default Alerts;
