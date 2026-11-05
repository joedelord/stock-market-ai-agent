const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const request = require("supertest");

const serveClient = require("../middleware/serveClient");

const INDEX_HTML = "<!doctype html><title>Client</title>";

let directory;
let app;

beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "client-dist-"));
  fs.mkdirSync(path.join(directory, "assets"));
  fs.writeFileSync(path.join(directory, "index.html"), INDEX_HTML);
  fs.writeFileSync(path.join(directory, "assets", "app.js"), "console.log(1);");

  app = express();
  app.get("/api/ping", (req, res) => res.json({ status: "ok" }));
  app.use(serveClient(directory));
  app.use((req, res) => res.status(404).json({ error: "Route not found" }));
});

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("Client serving", () => {
  test("serves built static files", async () => {
    const response = await request(app).get("/assets/app.js");

    expect(response.status).toBe(200);
    expect(response.text).toBe("console.log(1);");
  });

  test("serves index.html for client-side routes", async () => {
    const response = await request(app).get("/stocks/1");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.text).toBe(INDEX_HTML);
  });

  test("keeps API routes working", async () => {
    const response = await request(app).get("/api/ping");

    expect(response.body).toEqual({ status: "ok" });
  });

  test("returns a JSON 404 for unknown API routes", async () => {
    const response = await request(app).get("/api/missing");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Route not found" });
  });

  test("does not answer non-GET requests with index.html", async () => {
    const response = await request(app).post("/stocks/1");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Route not found" });
  });
});
