import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";

import { useAuth } from "../context/useAuth";
import AuthPage from "../components/AuthPage";
import LoginForm from "../components/admin/LoginForm";
import { getErrorMessage } from "../services/errors";

function Login() {
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, isAuthenticated, isLoading } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from;
  const destination = from?.pathname
    ? `${from.pathname}${from.search || ""}${from.hash || ""}`
    : "/stocks";

  if (isLoading) {
    return <p>Loading...</p>;
  }

  if (isAuthenticated) {
    return <Navigate to={destination} replace />;
  }

  const handleLogin = async (email, password) => {
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await login(email, password);

      navigate(destination, {
        replace: true,
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Login failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPage title="Login" description="Welcome back. Your watchlist is waiting for you.">

      <LoginForm
        onSubmit={handleLogin}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
      />

      <div className="mx-auto mt-4 flex w-full max-w-md justify-between text-sm">
        <Link to="/register" className="text-blue-700 underline">
          Create account
        </Link>

        <Link to="/forgot-password" className="text-blue-700 underline">
          Forgot password?
        </Link>
      </div>
    </AuthPage>
  );
}

export default Login;
