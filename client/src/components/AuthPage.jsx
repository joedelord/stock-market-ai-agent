import PublicHeader from "./PublicHeader";

export default function AuthPage({ title, description, children }) {
  return (
    <div className="app-shell">
      <PublicHeader />
      <main id="main-content" className="auth-layout">
        <aside className="auth-story">
          <p className="workspace-eyebrow">YOUR PERSONAL MARKET WORKSPACE</p>
          <h2>A clearer view.<br />A smarter watchlist.</h2>
          <p>Bring your stocks, price alerts and AI analysis together in one place.</p>
          <ul className="auth-benefits">
            <li><span aria-hidden="true">01</span><div><strong>Follow your favourites</strong><p>Build a watchlist around the stocks that matter to you.</p></div></li>
            <li><span aria-hidden="true">02</span><div><strong>Stay informed</strong><p>Set price targets and daily change alerts.</p></div></li>
            <li><span aria-hidden="true">03</span><div><strong>Explore with AI</strong><p>Get a summary of stored price movements.</p></div></li>
          </ul>
          <p className="auth-story-note">Stored market data · Clear timestamps · Your own watchlist</p>
        </aside>
        <section className="auth-card" aria-labelledby="auth-title">
          <p className="workspace-eyebrow">STOCK MARKET AI</p>
          <h1 id="auth-title">{title}</h1>
          {description && <p className="auth-description">{description}</p>}
          {children}
        </section>
      </main>
      <footer className="app-footer">Stock Market AI · Your personal market workspace</footer>
    </div>
  );
}
