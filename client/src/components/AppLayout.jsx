import { Outlet } from "react-router";
import AppHeader from "./AppHeader";
import EmailVerificationBanner from "./EmailVerificationBanner";

export default function AppLayout() {
  return (
    <div className="app-shell">
      <AppHeader />
      <EmailVerificationBanner />
      <Outlet />
      <footer className="app-footer">Stock Market AI · Your personal market workspace</footer>
    </div>
  );
}
