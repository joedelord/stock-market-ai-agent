// Moderators get a read-only view: the server leaves out emails for them
// and rejects changes.
function UserTable({
  users,
  currentUser,
  canManage,
  onRoleChange,
  onDeleteUser,
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-left">
        <thead className="bg-gray-100 text-sm text-gray-700">
          <tr>
            <th className="px-6 py-3 font-semibold">Username</th>
            {canManage && <th className="px-6 py-3 font-semibold">Email</th>}
            <th className="px-6 py-3 font-semibold">Role</th>
            {canManage && <th className="px-6 py-3 font-semibold">Actions</th>}
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-200">
          {users.map((user) => (
            <tr key={user.id} className="transition-colors hover:bg-gray-50">
              <td className="px-6 py-4 font-medium text-gray-900">
                {user.username}

                {user.id === currentUser.id && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    (you)
                  </span>
                )}
              </td>

              {canManage && (
                <td className="px-6 py-4 text-gray-600">{user.email}</td>
              )}

              <td className="px-6 py-4">
                {canManage ? (
                  <select
                    value={user.role}
                    disabled={user.id === currentUser.id}
                    onChange={(event) =>
                      onRoleChange(user.id, event.target.value)
                    }
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="user">User</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span className="capitalize">{user.role}</span>
                )}
              </td>

              {canManage && (
                <td className="px-6 py-4">
                  {user.id !== currentUser.id && (
                    <button
                      type="button"
                      onClick={() => onDeleteUser(user)}
                      className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                    >
                      Delete
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default UserTable;
