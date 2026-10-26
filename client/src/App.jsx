import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";

import Admin from "./pages/Admin";
import Alerts from "./pages/Alerts";
import ChangePassword from "./pages/ChangePassword";
import Profile from "./pages/Profile";
import ForgotPassword from "./pages/ForgotPassword";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";

import StockDashboard from "./pages/StockDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/login" element={<Login />} />

        <Route path="/register" element={<Register />} />

        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Navigate to="/stocks" replace />} />

          <Route element={<AppLayout />}>
            <Route path="/stocks" element={<StockDashboard />} />
            <Route path="/account" element={<Profile />} />
            <Route path="/account/password" element={<ChangePassword />} />
            <Route path="/alerts" element={<Alerts />} />
          </Route>
        </Route>

        <Route element={<RoleRoute allowedRoles={["admin", "moderator"]} />}>
          <Route element={<AppLayout />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
