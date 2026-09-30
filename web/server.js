// Runs the whole app without Vercel: serves the built frontend from dist/
// and the same /api/* handlers Vercel uses.  `npm run build && npm start`
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const dist = join(root, "dist");
const port = Number(process.env.PORT) || 3000;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png",
  ".svg": "image/svg+xml", ".wasm": "application/wasm", ".ico": "image/x-icon",
};

const handlers = {};
async function apiHandler(name) {
  if (!/^[a-z-]+$/.test(name)) return null;
  if (!(name in handlers)) {
    try {
      handlers[name] = (await import(`./api/${name}.js`)).default;
    } catch {
      handlers[name] = null;
    }
  }
  return handlers[name];
}

async function serveStatic(req, res, pathname) {
  let file = normalize(join(dist, decodeURIComponent(pathname)));
  if (!file.startsWith(dist)) { res.statusCode = 403; return res.end(); }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(dist, "index.html"); // single-page app fallback
  }
  try {
    const body = await readFile(file);
    res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
    if (pathname.startsWith("/assets/")) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("Not found. Did you run `npm run build`?");
  }
}

export function createAppServer() {
  return createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname.startsWith("/api/")) {
      const handler = await apiHandler(pathname.slice(5));
      if (!handler) { res.statusCode = 404; return res.end("{}"); }
      return handler(req, res);
    }
    return serveStatic(req, res, pathname);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createAppServer().listen(port, () => console.log(`Scan2Sell running at http://localhost:${port}`));
}
