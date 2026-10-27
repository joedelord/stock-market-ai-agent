import { useEffect, useState } from "react";

import { useAuth } from "../context/useAuth";
import api from "../services/api";
import { getErrorMessage } from "../services/errors";
import UserTable from "../components/admin/UserTable";
import AddUserForm from "../components/admin/AddUserForm";
import StockSearch from "../components/admin/StockSearch";

const PAGE_SIZE = 20;

function Admin() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";

  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [reloadCount, setReloadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      try {
        const response = await api.get("/users", {
          params: { page, pageSize: PAGE_SIZE },
        });

        if (!cancelled) {
          setUsers(response.data.users);
          setTotal(response.data.total);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error, "Failed to load users"));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, [page, reloadCount]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Shows the given page, reloading when it is already the current one.
  const showPage = (targetPage) => {
    if (targetPage === page) {
      setReloadCount((count) => count + 1);
    } else {
      setPage(targetPage);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setErrorMessage("");

    try {
      const response = await api.patch(`/users/${userId}/role`, {
        role: newRole,
      });

      const updatedUser = response.data.user;

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === updatedUser.id ? updatedUser : user,
        ),
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to update user role"));
    }
  };

  const handleDeleteUser = async (user) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${user.username}?`,
    );

    if (!confirmed) {
      return;
    }

    setErrorMessage("");

    try {
      await api.delete(`/users/${user.id}`);

      // Step back when the last user on this page was deleted.
      showPage(users.length === 1 && page > 1 ? page - 1 : page);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to delete user"));
    }
  };

  const handleCreateUser = async (userData) => {
    setErrorMessage("");

    try {
      await api.post("/users", userData);

      // Users are ordered by id, so the new user is on the last page.
      showPage(Math.ceil((total + 1) / PAGE_SIZE));

      setIsAddUserOpen(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to create user"));

      throw error;
    }
  };

  if (isLoading) {
    return <p>Loading users...</p>;
  }

  return (
    <main id="main-content" className="mx-auto max-w-4xl p-8 text-center">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-4xl font-bold">
          {isAdmin ? "User management" : "Users"}
        </h1>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setIsAddUserOpen((current) => !current)}
            className="
    flex h-10 w-10
    items-center justify-center
    rounded-full
    bg-blue-600
    text-white
    hover:bg-blue-700
  "
            aria-label={isAddUserOpen ? "Close" : "Add user"}
          >
            <span className="text-xl mb-1">{isAddUserOpen ? "×" : "+"}</span>
          </button>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-red-700">
          {errorMessage}
        </p>
      )}

      {isAdmin && isAddUserOpen && (
        <AddUserForm
          onCreateUser={handleCreateUser}
          onCancel={() => setIsAddUserOpen(false)}
        />
      )}

      <UserTable
        users={users}
        currentUser={currentUser}
        canManage={isAdmin}
        onRoleChange={handleRoleChange}
        onDeleteUser={handleDeleteUser}
      />

      {pageCount > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-4 flex items-center justify-center gap-4"
        >
          <button
            type="button"
            onClick={() => setPage((current) => current - 1)}
            disabled={page === 1}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:text-gray-400"
          >
            Previous
          </button>

          <span className="text-sm text-gray-600">
            Page {page} of {pageCount}
          </span>

          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page === pageCount}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:text-gray-400"
          >
            Next
          </button>
        </nav>
      )}

      {isAdmin && <StockSearch />}
    </main>
  );
}

export default Admin;
