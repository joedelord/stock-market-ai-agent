import { Link, useNavigate } from "react-router";

import { useAuth } from "../context/useAuth";

function Dashboard() {
  const { user, logout } = useAuth();

  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", {
      replace: true,
    });
  };

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-bold mb-5 text-center">Dashboard</h1>

      <div className="w-full max-w-md mx-auto p-5 rounded border-2 bg-gray-50">
        <p className="py-0.5">Logged in as {user.username}</p>
        <p className="py-0.5">Email: {user.email}</p>
        <p className="py-0.5">Role: {user.role}</p>

        {user.role === "admin" && (
          <p className="py-0.5 underline text-blue-700">
            <Link to="/admin">Open admin page</Link>
          </p>
        )}

        {user.role === "moderator" && (
          <p className="py-0.5 underline text-blue-700">
            <Link to="/admin">View users</Link>
          </p>
        )}

        <p className="py-0.5 underline text-blue-700">
          <Link to="/account/password">Change password</Link>
        </p>

        <button
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200 mt-4"
          type="button"
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>
    </main>
  );
}

export default Dashboard;
