import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "../context/useAuth";
import NotificationCenter from "./NotificationCenter";
import { getErrorMessage } from "../services/errors";

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    setError("");
    try {
      await logout();
      navigate("/", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Logout failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="app-brand"><span aria-hidden="true" className="brand-mark">↗</span> Stock Market <span className="brand-tag">AI</span></Link>
          <nav aria-label="Main navigation" className="app-nav">
            <NavLink to="/" end>Markets</NavLink>
            <NavLink to="/stocks">My stocks</NavLink>
            <NavLink to="/alerts">Alerts</NavLink>
          </nav>
          <div className="app-user-actions">
            <NotificationCenter />
            <details className="account-menu" onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary").focus();
              }
            }}>
              <summary>{user?.username || "Account"}<span aria-hidden="true"> ▾</span></summary>
              <nav aria-label="Account" className="account-panel">
                <Link to="/dashboard">My profile</Link>
                <Link to="/account/password">Change password</Link>
                {["admin", "moderator"].includes(user?.role) && <Link to="/admin">Administration</Link>}
                <button type="button" disabled={busy} onClick={handleLogout}>{busy ? "Logging out…" : "Log out"}</button>
              </nav>
            </details>
          </div>
        </div>
      </header>
      {error && <p role="alert" className="mx-auto max-w-7xl p-4 text-red-700">{error}</p>}
      <Outlet />
      <footer className="app-footer">Stock Market AI · Your personal market workspace</footer>
    </div>
  );
}
