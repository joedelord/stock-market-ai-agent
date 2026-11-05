import { Link } from "react-router";

import AppFooter from "../components/AppFooter";
import AppHeader from "../components/AppHeader";
import PublicHeader from "../components/PublicHeader";
import { useAuth } from "../context/useAuth";

// Set at build time, so each deployment can name its own contact address.
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL;

function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-gray-700">
        {children}
      </div>
    </section>
  );
}

function Privacy() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="app-shell">
      {isAuthenticated && !isLoading ? (
        <AppHeader />
      ) : (
        <PublicHeader isLoading={isLoading} />
      )}

      <main id="main-content" className="px-4 py-10 sm:px-8">
        <article className="mx-auto max-w-3xl">
          <p className="workspace-eyebrow">STOCK MARKET AI</p>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">
            Privacy and terms of use
          </h1>
          <p className="mt-3 text-gray-600">
            What this service stores about you, why, and how to remove it.
          </p>

          <Section title="Not investment advice">
            <p>
              Stock Market AI shows stored market data and AI-generated
              summaries of past price movements. The summaries can contain
              errors and do not take your financial situation into account.
              Nothing in the service is investment advice or a recommendation
              to buy or sell securities. Prices can be delayed or incomplete.
            </p>
          </Section>

          <Section title="What we store">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Account:</strong> username, email address, a hashed
                password (never the password itself), your role, and whether
                your email address is verified.
              </li>
              <li>
                <strong>Your activity:</strong> the stocks on your watchlist,
                your price alerts and the notifications they create.
              </li>
              <li>
                <strong>Security data:</strong> IP addresses and email
                addresses in rate limit counters, which expire within an
                hour, and IP addresses in server logs.
              </li>
              <li>
                <strong>Session cookie:</strong> one cookie that keeps you
                logged in. There are no advertising or analytics cookies.
              </li>
            </ul>
            <p>
              AI analyses are stored per stock and are not linked to you.
            </p>
          </Section>

          <Section title="Why we store it">
            <p>
              Only to run the service: logging you in, showing your watchlist,
              checking your alerts, sending the emails you need (address
              verification, password reset and alert notifications) and
              protecting accounts from abuse.
            </p>
          </Section>

          <Section title="Other services">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Twelve Data</strong> provides prices. It receives stock
                symbols only.
              </li>
              <li>
                <strong>Groq</strong> generates the AI analyses. It receives
                price figures and news headlines, not your details.
              </li>
              <li>
                <strong>Marketaux</strong>, when enabled, provides company
                news. It receives stock symbols only.
              </li>
              <li>
                <strong>An email provider</strong> delivers emails. It receives
                your email address and the message.
              </li>
            </ul>
          </Section>

          <Section title="Deleting your data">
            <p>
              You can delete your account at any time on your{" "}
              <Link to="/account" className="text-blue-700 underline">
                profile page
              </Link>
              . This removes your account, watchlist, alerts and notifications
              immediately. Server logs are removed as they rotate.
            </p>
            {CONTACT_EMAIL && (
              <p>
                For other questions about your data, contact{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-blue-700 underline"
                >
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            )}
          </Section>
        </article>
      </main>

      <AppFooter />
    </div>
  );
}

export default Privacy;
