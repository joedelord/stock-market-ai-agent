import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";

import { useAuth } from "../context/useAuth";
import LoginForm from "../components/admin/LoginForm";
import { getErrorMessage } from "../services/errors";

function Login() {
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, isAuthenticated, isLoading } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  if (isLoading) {
    return <p>Loading...</p>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (email, password) => {
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await login(email, password);

      const destination = location.state?.from?.pathname || "/dashboard";

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
    <main className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-bold mb-5 text-center">Login</h1>

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
    </main>
  );
}

export default Login;
