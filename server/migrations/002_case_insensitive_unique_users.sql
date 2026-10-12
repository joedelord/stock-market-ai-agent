CREATE UNIQUE INDEX users_username_lower_idx ON users (LOWER(username));

CREATE UNIQUE INDEX users_email_lower_idx ON users (LOWER(email));
