const path = require("path");
const express = require("express");

// Serving the built client from the same origin keeps the SameSite=Lax session
// cookie working and needs no CORS setup in production.
const ASSETS_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const serveClient = (directory) => {
  const router = express.Router();

  // Vite puts a content hash in every file name under assets/, so a changed
  // file gets a new URL and browsers never need to revalidate the old one.
  // index.html keeps the default, so a new release shows up right away.
  router.use(
    "/assets",
    express.static(path.join(directory, "assets"), {
      immutable: true,
      maxAge: ASSETS_MAX_AGE_MS,
    }),
  );
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
