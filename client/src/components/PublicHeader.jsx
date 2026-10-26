import { Link, NavLink } from "react-router";

export default function PublicHeader({ isAuthenticated = false, isLoading = false }) {
  return (
    <header className="app-header">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="app-header-inner">
        <Link to="/" className="app-brand"><span aria-hidden="true" className="brand-mark">↗</span> Stock Market <span className="brand-tag">AI</span></Link>
        <nav aria-label="Main navigation" className="app-nav"><NavLink to="/" end>Markets</NavLink></nav>
        <nav aria-label="Your account" className="public-account-nav">
          {isLoading ? <span role="status">Loading account…</span> : isAuthenticated ? <><Link to="/account">My profile</Link><Link to="/stocks" className="public-nav-cta">My stocks →</Link></> : <><Link to="/login">Login</Link><Link to="/register" className="public-nav-cta">Create account</Link></>}
        </nav>
      </div>
    </header>
  );
}
