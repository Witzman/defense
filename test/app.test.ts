import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.ts";

const root = mkdtempSync(join(tmpdir(), "defense-app-"));
const dist = join(root, "dist");
mkdirSync(dist);
writeFileSync(join(dist, "index.html"), "<!doctype html><title>Flow Defense</title>");
mkdirSync(join(dist, "assets"));
writeFileSync(join(dist, "assets", "main-abc.js"), "console.log(1)");
writeFileSync(join(root, "secret.txt"), "outside dist");

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
  app = createApp({ distDir: dist });
});

describe("api", () => {
  it("is gone: the save game lives in the browser (#24)", async () => {
    expect((await fetch(`${base}/api/save`)).status).toBe(404);
    expect((await fetch(`${base}/api/save`, { method: "PUT", body: "{}" })).status).toBe(404);
  });
});

describe("health", () => {
  it("is 200 while the server serves", async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
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
