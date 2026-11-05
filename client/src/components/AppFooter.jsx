import { Link } from "react-router";

export default function AppFooter() {
  return (
    <footer className="app-footer">
      <p>Stock Market AI · Your personal market workspace</p>
      <p className="mt-1">
        For information only, not investment advice ·{" "}
        <Link to="/privacy" className="underline">
          Privacy
        </Link>
      </p>
    </footer>
  );
}
