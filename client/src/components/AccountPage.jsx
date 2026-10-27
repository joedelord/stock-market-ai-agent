import { NavLink } from "react-router";
import { useAuth } from "../context/useAuth";

export default function AccountPage({ title, description, children }) {
  const { user } = useAuth();
  const initials = Array.from(user.username || "?")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main id="main-content" className="account-workspace px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="workspace-eyebrow">YOUR ACCOUNT</p>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">{title}</h1>
          <p className="mt-2 text-sm text-gray-600">{description}</p>
        </header>
        <div className="account-layout">
          <aside className="account-sidebar">
            <div className="account-identity">
              <span className="account-avatar" aria-hidden="true">
                {initials}
              </span>
              <p className="font-semibold text-gray-900">{user.username}</p>
              <p className="mt-1 text-sm text-gray-500 wrap-break-word">
                {user.email}
              </p>
            </div>
            <nav aria-label="Account settings" className="account-tabs">
              <NavLink to="/account" end>
                Profile overview
              </NavLink>
              <NavLink to="/account/password">Password & security</NavLink>
            </nav>
          </aside>
          <div className="account-content">{children}</div>
        </div>
      </div>
    </main>
  );
}
