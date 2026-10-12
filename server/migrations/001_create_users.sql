CREATE TABLE users (
  id SERIAL PRIMARY KEY,

  username VARCHAR(100) NOT NULL UNIQUE,

  email VARCHAR(255) NOT NULL UNIQUE,

  password_hash VARCHAR(255) NOT NULL,

  role VARCHAR(30) NOT NULL DEFAULT 'user',

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT users_role_check
    CHECK (role IN ('user', 'moderator', 'admin'))
);