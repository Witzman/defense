import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

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
  distDir: string;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Serves the built game. The save game lives in the browser (#24); there is no API and no database. */
export function createApp({ distDir }: AppOptions): RequestListener {
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

    if (path === "/healthz") return sendJson(res, 200, { ok: true });
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
