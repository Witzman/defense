import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import type { SaveData, Store } from "./store.ts";

/** Upper bound for one save game. The research tree and placements fit comfortably below it. */
export const MAX_SAVE_BYTES = 5 * 1024 * 1024;

/** The prototype has one global save game; with login this becomes the user id. */
const SLOT = "global";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

export interface AppOptions {
  store: Store;
  distDir: string;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createApp({ store, distDir }: AppOptions): RequestListener {
  const root = resolve(distDir);

  return (req, res) => {
    handle(req, res).catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) sendJson(res, status, { error: err instanceof HttpError ? err.message : "internal error" });
      else res.destroy();
    });
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const path = new URL(req.url ?? "/", "http://x").pathname;

    if (path === "/healthz") {
      const ok = await store.healthy();
      return sendJson(res, ok ? 200 : 503, { ok });
    }
    if (path === "/api/save") {
      if (req.method === "GET") {
        const data = await store.load(SLOT);
        return data ? sendJson(res, 200, data) : sendJson(res, 404, { error: "no save" });
      }
      if (req.method === "PUT") {
        await store.save(SLOT, parseSave(await readBody(req)));
        res.writeHead(204).end();
        return;
      }
      res.setHeader("allow", "GET, PUT");
      throw new HttpError(405, "method not allowed");
    }
    if (path.startsWith("/api/")) throw new HttpError(404, "not found");
    if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "method not allowed");
    return serveFile(req, res, path);
  }

  async function serveFile(req: IncomingMessage, res: ServerResponse, path: string) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      throw new HttpError(400, "bad path");
    }
    const file = resolve(join(root, decoded === "/" ? "index.html" : decoded));
    if (file !== root && !file.startsWith(root + sep)) throw new HttpError(404, "not found");
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) throw new HttpError(404, "not found");
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "content-length": body.length,
      // Vite puts a content hash into every asset name; index.html must always be fresh.
      "cache-control": file.startsWith(join(root, "assets") + sep) ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_SAVE_BYTES) throw new HttpError(413, "save too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseSave(text: string): SaveData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, "not json");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new HttpError(400, "save must be an object");
  if (!Number.isInteger((data as { version?: unknown }).version)) throw new HttpError(400, "save needs an integer version");
  // Postgres jsonb cannot store U+0000; reject it here instead of failing in the database.
  if (text.includes("\\u0000") || text.includes("\u0000")) throw new HttpError(400, "save must not contain U+0000");
  return data as SaveData;
}
