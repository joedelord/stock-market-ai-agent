import { Navigate, Outlet, useLocation } from "react-router";

import { useAuth } from "../context/useAuth";

function RoleRoute({ allowedRoles }) {
  const { user, isAuthenticated, isLoading } = useAuth();

  const location = useLocation();

  if (isLoading) {
    return <p>Loading...</p>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default RoleRoute;
