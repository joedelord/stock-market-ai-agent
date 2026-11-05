import { Outlet } from "react-router";
import AppFooter from "./AppFooter";
import AppHeader from "./AppHeader";
import EmailVerificationBanner from "./EmailVerificationBanner";

export default function AppLayout() {
  return (
    <div className="app-shell">
      <AppHeader />
      <EmailVerificationBanner />
      <Outlet />
      <AppFooter />
    </div>
  );
}
