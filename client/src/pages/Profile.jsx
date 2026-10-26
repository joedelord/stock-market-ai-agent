import { Link } from "react-router";
import AccountPage from "../components/AccountPage";
import { useAuth } from "../context/useAuth";

const ROLE_LABELS = { user: "Member", moderator: "Moderator", admin: "Administrator" };

export default function Profile() {
  const { user } = useAuth();

  return (
    <AccountPage title="My profile" description="Your account details and settings, all in one place.">
      <section className="account-card" aria-labelledby="profile-details-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="profile-details-title" className="text-lg font-bold">Account details</h2>
          <span className="account-role">{ROLE_LABELS[user.role] || user.role}</span>
        </div>
        <p className="mt-2 text-sm text-gray-500">The details associated with your account.</p>
        <dl className="profile-details">
          <div><dt>Username</dt><dd>{user.username}</dd></div>
          <div><dt>Email address</dt><dd>{user.email}</dd></div>
          <div><dt>Account role</dt><dd>{ROLE_LABELS[user.role] || user.role}</dd></div>
        </dl>
      </section>
      <section className="account-card" aria-labelledby="security-title">
        <span className="workspace-eyebrow">SECURITY</span>
        <h2 id="security-title" className="mt-2 text-lg font-bold">Password & security</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">Update your password using your current password. Changing it also signs out your other devices.</p>
        <Link to="/account/password" className="account-primary-link mt-5">Change password <span aria-hidden="true">→</span></Link>
      </section>
      <section className="account-card" aria-labelledby="workspace-title">
        <h2 id="workspace-title" className="text-lg font-bold">Your market workspace</h2>
        <div className="account-shortcuts">
          <Link to="/stocks"><span className="font-semibold">My stocks <span aria-hidden="true">↗</span></span><span>Explore your watchlist and AI analysis.</span></Link>
          <Link to="/alerts"><span className="font-semibold">My alerts <span aria-hidden="true">↗</span></span><span>Manage your stock price alerts.</span></Link>
          {["admin", "moderator"].includes(user.role) && <Link to="/admin"><span className="font-semibold">Administration <span aria-hidden="true">↗</span></span><span>Manage users and account access.</span></Link>}
        </div>
      </section>
    </AccountPage>
  );
}
