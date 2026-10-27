import { useEffect, useId, useRef, useState } from "react";
import {
  getNotifications,
  setNotificationRead,
  markAllNotificationsRead,
} from "../services/notificationService";
import { getErrorMessage } from "../services/errors";

function formatTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-GB", { timeZone: "Europe/Helsinki" });
}

function NotificationCenter() {
  const panelId = useId();
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const revision = useRef(0);
  const pending = useRef(false);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ notifications: [], unreadCount: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading || pending.current) return;
      loading = true;
      const version = revision.current;
      try {
        const result = await getNotifications({ signal: controller.signal });
        if (!controller.signal.aborted && version === revision.current) {
          setData(result);
          setLoaded(true);
          setError("");
        }
      } catch (error) {
        if (!controller.signal.aborted && version === revision.current) {
          setError(getErrorMessage(error, "Could not load notifications."));
        }
      } finally {
        loading = false;
      }
    }
    // Skip polls in a hidden tab and catch up as soon as it is shown again.
    function poll() {
      if (!document.hidden) load();
    }
    load();
    const timer = window.setInterval(poll, 60000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  async function changeRead(notification) {
    if (pending.current) return;
    pending.current = true;
    revision.current += 1;
    setBusy(true);
    setError("");
    try {
      if (notification)
        await setNotificationRead(notification.id, !notification.read_at);
      else await markAllNotificationsRead();
    } catch (error) {
      setError(getErrorMessage(error, "Could not update notifications."));
      return;
    } finally {
      pending.current = false;
      setBusy(false);
    }
    setReload((value) => value + 1);
  }

  return (
    <div ref={containerRef} className="relative w-full sm:w-auto">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="notification-toggle flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-1.5 hover:bg-gray-50"
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        <span className="notification-label">Notifications</span>
        {loaded && data.unreadCount > 0 && (
          <span
            className="rounded-full bg-blue-100 px-2 text-sm text-blue-800"
            aria-label={`${data.unreadCount} unread`}
          >
            {data.unreadCount}
          </span>
        )}
        {error && (
          <span
            className="text-amber-700"
            aria-label="Notifications unavailable"
          >
            !
          </span>
        )}
      </button>
      {open && (
        <section
          id={panelId}
          aria-label="Notifications"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
          className="notification-panel absolute right-0 z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white p-4 shadow-lg sm:w-96"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Notifications</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => setReload((value) => value + 1)}
              className="text-sm text-blue-700 underline disabled:opacity-50"
            >
              Refresh notifications
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {!loaded && !error && (
            <p role="status" className="mt-3 text-sm">
              Loading notifications...
            </p>
          )}
          {loaded && (
            <>
              <button
                type="button"
                disabled={busy || !data.unreadCount}
                onClick={() => changeRead()}
                className="mt-3 text-sm text-blue-700 underline disabled:opacity-50"
              >
                Mark all as read
              </button>
              {!data.notifications.length && (
                <p className="mt-4 text-sm text-gray-500">
                  No notifications yet.
                </p>
              )}
              <ul
                className="mt-3 max-h-96 space-y-2 overflow-y-auto"
                aria-label="Recent notifications"
              >
                {data.notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className={`rounded-lg p-3 ${notification.read_at ? "bg-gray-50" : "border border-blue-100 bg-blue-50"}`}
                  >
                    <p
                      className={`wrap-break-word text-sm ${notification.read_at ? "text-gray-600" : "font-medium text-gray-900"}`}
                    >
                      {notification.message}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Price recorded: {formatTime(notification.price_time)}{" "}
                      (Helsinki)
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => changeRead(notification)}
                      className="mt-2 text-xs text-blue-700 underline disabled:opacity-50"
                    >
                      {notification.read_at ? "Mark as unread" : "Mark as read"}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-gray-500">
                Latest 50 notifications. The unread count includes all
                notifications. Updates every minute.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default NotificationCenter;
