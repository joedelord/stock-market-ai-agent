import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";

import FormField from "../components/FormField";
import FormPage from "../components/FormPage";
import SubmitButton from "../components/SubmitButton";
import { useAuth } from "../context/useAuth";
import { getErrorMessage } from "../services/errors";

function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, isAuthenticated, isLoading } = useAuth();

  const navigate = useNavigate();

  if (isLoading) {
    return <p>Loading...</p>;
  }

  if (isAuthenticated && !isSubmitting) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();

    setErrorMessage("");

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    setIsSubmitting(true);

    try {
      await register({ username, email, password });

      navigate("/dashboard", { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Registration failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormPage title="Create account">
      <form onSubmit={handleSubmit}>
        <FormField
          id="username"
          label="Username"
          type="text"
          value={username}
          autoComplete="username"
          required
          minLength={3}
          maxLength={100}
          onChange={(event) => setUsername(event.target.value)}
        />

        <FormField
          id="email"
          label="Email"
          type="email"
          value={email}
          autoComplete="email"
          required
          className="mt-3"
          onChange={(event) => setEmail(event.target.value)}
        />

        <FormField
          id="password"
          label="Password"
          type="password"
          value={password}
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          className="mt-3"
          onChange={(event) => setPassword(event.target.value)}
        />

        <FormField
          id="confirmPassword"
          label="Confirm password"
          type="password"
          value={confirmPassword}
          autoComplete="new-password"
          required
          className="mt-3"
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        {errorMessage && (
          <p className="mt-2 text-red-500" role="alert">
            {errorMessage}
          </p>
        )}

        <SubmitButton isSubmitting={isSubmitting} submittingText="Creating...">
          Create account
        </SubmitButton>
      </form>

      <p className="mt-4 text-sm">
        Already have an account?{" "}
        <Link to="/login" className="text-blue-700 underline">
          Log in
        </Link>
      </p>
    </FormPage>
  );
}

export default Register;
