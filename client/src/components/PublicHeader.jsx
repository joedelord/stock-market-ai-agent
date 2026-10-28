import { Link } from "react-router";

// Logged-in pages use AppHeader instead.
export default function PublicHeader({ isLoading = false }) {
  return (
    <header className="app-header">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="app-header-inner">
        <Link to="/" className="app-brand"><span aria-hidden="true" className="brand-mark">↗</span> Stock Market <span className="brand-tag">AI</span></Link>
        <nav aria-label="Your account" className="public-account-nav">
          {isLoading ? <span role="status">Loading account…</span> : <><Link to="/login">Login</Link><Link to="/register" className="public-nav-cta">Create account</Link></>}
        </nav>
      </div>
    </header>
  );
}
