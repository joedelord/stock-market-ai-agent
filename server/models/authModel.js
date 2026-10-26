const pool = require("../config/db");

const findUserByEmail = async (email) => {
  const result = await pool.query(
    `SELECT
      id,
      username,
      email,
      password_hash,
      role,
      token_version,
      email_verified_at,
      created_at,
      updated_at
    FROM users
    WHERE LOWER(email) = LOWER($1)`,
    [email],
  );

  return result.rows[0];
};

const findUserByUsername = async (username) => {
  const result = await pool.query(
    `SELECT
      id,
      username,
      email,
      password_hash,
      role,
      created_at,
      updated_at
    FROM users
    WHERE LOWER(username) = LOWER($1)`,
    [username],
  );

  return result.rows[0];
};

const createUser = async ({
  username,
  email,
  passwordHash,
  role = "user",
  emailVerified = false,
}) => {
  const result = await pool.query(
    `INSERT INTO users (
      username,
      email,
      password_hash,
      role,
      email_verified_at
    )
    VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN CURRENT_TIMESTAMP END)
    RETURNING
      id,
      username,
      email,
      role,
      token_version,
      email_verified_at,
      created_at,
      updated_at`,
    [username, email, passwordHash, role, emailVerified],
  );

  return result.rows[0];
};

const findUserAuthState = async (id) => {
  const result = await pool.query(
    `SELECT
      id,
      role,
      token_version
    FROM users
    WHERE id = $1`,
    [id],
  );

  return result.rows[0];
};

const incrementTokenVersion = async (id) => {
  await pool.query(
    `UPDATE users
     SET token_version = token_version + 1
     WHERE id = $1`,
    [id],
  );
};

const findPasswordHashById = async (id) => {
  const result = await pool.query(
    "SELECT password_hash FROM users WHERE id = $1",
    [id],
  );

  return result.rows[0]?.password_hash;
};

// Bumping the token version logs the user out on every device.
const updatePassword = async (id, passwordHash) => {
  const result = await pool.query(
    `UPDATE users
     SET
       password_hash = $1,
       token_version = token_version + 1
     WHERE id = $2
     RETURNING
       id,
       email,
       token_version`,
    [passwordHash, id],
  );

  return result.rows[0];
};

module.exports = {
  findUserByEmail,
  findUserByUsername,
  createUser,
  findUserAuthState,
  incrementTokenVersion,
  findPasswordHashById,
  updatePassword,
};
