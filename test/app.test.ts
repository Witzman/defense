import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createApp, MAX_SAVE_BYTES } from "../server/app.ts";
import { memoryStore } from "./memory-store.ts";

const root = mkdtempSync(join(tmpdir(), "defense-app-"));
const dist = join(root, "dist");
mkdirSync(dist);
writeFileSync(join(dist, "index.html"), "<!doctype html><title>Flow Defense</title>");
mkdirSync(join(dist, "assets"));
writeFileSync(join(dist, "assets", "main-abc.js"), "console.log(1)");
writeFileSync(join(root, "secret.txt"), "outside dist");

let store: ReturnType<typeof memoryStore>;
let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => app(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  store = memoryStore();
  app = createApp({ store, distDir: dist });
});

const put = (body: string) =>
  fetch(`${base}/api/save`, { method: "PUT", headers: { "content-type": "application/json" }, body });

describe("save api", () => {
  it("answers 404 while nothing is saved", async () => {
    expect((await fetch(`${base}/api/save`)).status).toBe(404);
  });

  it("returns the saved game after a PUT", async () => {
    expect((await put(JSON.stringify({ version: 1, points: 5 }))).status).toBe(204);
    const res = await fetch(`${base}/api/save`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, points: 5 });
  });

  it.each([
    ["not json", "{"],
    ["an array", "[1]"],
    ["no version", JSON.stringify({ points: 1 })],
    ["a non-integer version", JSON.stringify({ version: "1" })],
  ])("rejects %s with 400 and keeps the old save", async (_name, body) => {
    await put(JSON.stringify({ version: 1 }));
    expect((await put(body)).status).toBe(400);
    expect(await (await fetch(`${base}/api/save`)).json()).toEqual({ version: 1 });
  });

  it("rejects a save above the size limit with 413", async () => {
    const big = JSON.stringify({ version: 1, pad: "x".repeat(MAX_SAVE_BYTES) });
    expect((await put(big)).status).toBe(413);
  });

  it("answers 405 for other methods", async () => {
    expect((await fetch(`${base}/api/save`, { method: "DELETE" })).status).toBe(405);
  });

  it("answers 404 for unknown api paths instead of the page", async () => {
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
  });
});

describe("health", () => {
  it("is 200 while the store is healthy", async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });

  it("is 503 when the store is down", async () => {
    store.up = false;
    expect((await fetch(`${base}/healthz`)).status).toBe(503);
  });
});

describe("static game", () => {
  it("serves index.html at /", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Flow Defense");
  });

  it("serves built assets with their type", async () => {
    const res = await fetch(`${base}/assets/main-abc.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  it("answers 404 for a missing file", async () => {
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
  });

  it("never serves files outside the build directory", async () => {
    for (const p of ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt"]) {
      const res = await fetch(`${base}${p}`);
      expect(await res.text()).not.toContain("outside dist");
    }
  });
});
