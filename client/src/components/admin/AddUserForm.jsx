import { useState } from "react";

import PasswordInput from "../PasswordInput";

function AddUserForm({ onCreateUser, onCancel }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setIsSubmitting(true);

    try {
      await onCreateUser({
        username,
        email,
        password,
        role,
      });

      setUsername("");
      setEmail("");
      setPassword("");
      setRole("user");
    } catch {
      // The admin page shows the error; keeping the fields lets the admin
      // correct them.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 grid gap-4 rounded-lg border p-4 text-left"
    >
      <h2 className="text-xl font-semibold">Add user</h2>

      <input
        type="text"
        placeholder="Username"
        value={username}
        required
        minLength={3}
        maxLength={100}
        onChange={(event) => setUsername(event.target.value)}
        className="rounded border px-3 py-2"
      />

      <input
        type="email"
        placeholder="Email"
        value={email}
        required
        onChange={(event) => setEmail(event.target.value)}
        className="rounded border px-3 py-2"
      />

      <PasswordInput
        placeholder="Password"
        autoComplete="new-password"
        value={password}
        required
        minLength={8}
        maxLength={128}
        onChange={(event) => setPassword(event.target.value)}
        className="rounded border px-3 py-2"
      />

      <select
        value={role}
        onChange={(event) => setRole(event.target.value)}
        className="rounded border px-3 py-2"
      >
        <option value="user">User</option>
        <option value="moderator">Moderator</option>
        <option value="admin">Admin</option>
      </select>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? "Creating..." : "Create user"}
        </button>
      </div>
    </form>
  );
}

export default AddUserForm;
