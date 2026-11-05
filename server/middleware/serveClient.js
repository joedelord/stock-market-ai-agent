const path = require("path");
const express = require("express");

// Serving the built client from the same origin keeps the SameSite=Lax session
// cookie working and needs no CORS setup in production.
const serveClient = (directory) => {
  const router = express.Router();

  router.use(express.static(directory));

  // React Router handles client-side paths such as /stocks/1, so unknown
  // non-API GET requests get index.html instead of a 404.
  router.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      return next();
    }

    return res.sendFile(path.join(directory, "index.html"));
  });

  return router;
};

module.exports = serveClient;
