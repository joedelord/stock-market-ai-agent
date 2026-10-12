const pool = require("../config/db");
const HttpError = require("../utils/httpError");

// Runs a change that could remove an admin while holding row locks on all
// admins, so two concurrent requests cannot remove the last two admins.
const withLastAdminGuard = async (userId, removesAdmin, change) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const admins = await client.query(
      "SELECT id FROM users WHERE role = 'admin' FOR UPDATE",
    );

    const isAdmin = admins.rows.some((admin) => admin.id === userId);

    if (removesAdmin && isAdmin && admins.rows.length === 1) {
      throw new HttpError(400, "Cannot remove the last admin");
    }

    const result = await change(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getUsersPage = async ({ limit, offset }) => {
  const [usersResult, countResult] = await Promise.all([
    pool.query(
      `SELECT
        id,
        username,
        email,
        role,
        created_at,
        updated_at
      FROM users
      ORDER BY id
      LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    pool.query("SELECT COUNT(*)::int AS total FROM users"),
  ]);

  return {
    users: usersResult.rows,
    total: countResult.rows[0].total,
  };
};

const getUserById = async (id) => {
  const result = await pool.query(
    `SELECT
      id,
      username,
      email,
      role,
      created_at,
      updated_at
    FROM users
    WHERE id = $1`,
    [id],
  );

  return result.rows[0];
};

const updateUserRole = async (id, role) => {
  return withLastAdminGuard(id, role !== "admin", async (client) => {
    const result = await client.query(
      `UPDATE users
       SET role = $1
       WHERE id = $2
       RETURNING
         id,
         username,
         email,
         role,
         created_at,
         updated_at`,
      [role, id],
    );

    return result.rows[0];
  });
};

const deleteUser = async (id) => {
  return withLastAdminGuard(id, true, async (client) => {
    const result = await client.query(
      `DELETE FROM users
       WHERE id = $1
       RETURNING
         id,
         username,
         email,
         role`,
      [id],
    );

    return result.rows[0];
  });
};

module.exports = {
  getUsersPage,
  getUserById,
  updateUserRole,
  deleteUser,
};
