import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { DEFAULT_PORT, WS_PATH } from "../shared/constants";
import { ClientMessage, type MirrorView, type ServerMessage } from "../shared/protocol";
import { AppStore } from "./store";
import { saveImage, UnsupportedImageError } from "./uploads";

const root = resolve(import.meta.dirname, "..");
const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? DEFAULT_PORT);
const caseId = process.env.CASE ?? "default";
// User data (cases/, maps/, portraits/) lives in the repo by default; DATA_DIR
// points it elsewhere, e.g. so test runs never touch the streamer's files.
const dataDir = resolve(process.env.DATA_DIR ?? root);
const mapsDir = resolve(dataDir, "maps");
const portraitsDir = resolve(dataDir, "portraits");

// Warnings and errors only; per-request lines drown out everything else.
const app = Fastify({ logger: { level: "warn" } });
const store = await AppStore.load({ casesDir: resolve(dataDir, "cases"), mapsDir, portraitsDir, caseId });
console.log(`case "${caseId}" loaded at rev ${store.state.rev}; ${Object.keys(store.state.maps).length} map(s) in library`);

// --- WebSocket sync ---------------------------------------------------------

const wss = new WebSocketServer({ noServer: true });

app.server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  // Other upgrades (Vite HMR in dev) are handled by their own listeners.
  if (pathname !== WS_PATH) return;
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

function snapshot(): ServerMessage {
  return { type: "snapshot", rev: store.state.rev, state: store.state, history: store.timeline };
}

/** Latest mirrored panel view; kept so a reconnecting overlay picks it up. */
let mirror: MirrorView | null = null;

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

store.subscribe(() => {
  const msg = snapshot();
  for (const ws of wss.clients) send(ws, msg);
});

wss.on("connection", (ws) => {
  send(ws, snapshot());
  if (mirror) send(ws, { type: "mirror", view: mirror });
  ws.on("message", (data) => {
    let parsed;
    try {
      parsed = ClientMessage.safeParse(JSON.parse(data.toString()));
    } catch {
      return send(ws, { type: "error", message: "Message is not valid JSON" });
    }
    if (!parsed.success) return send(ws, { type: "error", message: "Unknown message" });

    const msg = parsed.data;
    if (msg.type === "undo") store.undo();
    else if (msg.type === "redo") store.redo();
    else if (msg.type === "jump") store.jump(msg.offset);
    else if (msg.type === "mirror") {
      mirror = msg.view;
      for (const client of wss.clients) if (client !== ws) send(client, { type: "mirror", view: mirror });
    } else if (msg.type === "cue") {
      for (const client of wss.clients) if (client !== ws) send(client, { type: "cue", cue: msg.cue });
    } else {
      const result = store.dispatch(msg.action);
      if (!result.ok) send(ws, { type: "error", message: result.error });
    }
  });
});

// --- Images (maps, portraits) -------------------------------------------------

// Upload is plain HTTP; the client then sends an action (map/create,
// character/update, portrait/add…) with the returned file name, so the state
// change itself is still an action.
app.addContentTypeParser(
  ["image/png", "image/jpeg", "image/webp", "application/octet-stream"],
  { parseAs: "buffer", bodyLimit: 200 * 1024 * 1024 },
  (_req, body, done) => done(null, body),
);

const fastifyStatic = (await import("@fastify/static")).default;

for (const { route, dir, prefix } of [
  { route: "maps", dir: mapsDir, prefix: "img" },
  { route: "portraits", dir: portraitsDir, prefix: "p" },
]) {
  app.post(`/api/${route}/images`, async (req, reply) => {
    if (!Buffer.isBuffer(req.body)) return reply.code(415).send({ error: "Send the image bytes as the request body" });
    try {
      return { file: await saveImage(dir, req.body, prefix) };
    } catch (err) {
      if (err instanceof UnsupportedImageError) return reply.code(415).send({ error: err.message });
      throw err;
    }
  });

  await app.register(fastifyStatic, {
    root: dir,
    prefix: `/${route}/`,
    decorateReply: false,
    index: false,
    allowedPath: (path) => /\.(png|jpe?g|webp)$/i.test(path),
    setHeaders: (res, path) => {
      // Uploaded images are content-addressed and never change; hand-placed ones might.
      const immutable = new RegExp(`[\\\\/]${prefix}-[0-9a-f]{16}\\.\\w+$`).test(path);
      res.header("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
    },
  });
}

// --- Pages ------------------------------------------------------------------

const pages = { overlay: "overlay.html", control: "control.html" } as const;

if (isProd) {
  const dist = resolve(root, "dist/web");
  await app.register(fastifyStatic, { root: dist, index: false });
  for (const [name, file] of Object.entries(pages)) {
    app.get(`/${name}`, (_req, reply) => reply.sendFile(file));
  }
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: resolve(root, "vite.config.ts"),
    appType: "custom",
    server: { middlewareMode: true, hmr: { server: app.server } },
  });
  await app.register(import("@fastify/middie"));
  app.use(vite.middlewares);
  for (const [name, file] of Object.entries(pages)) {
    app.get(`/${name}`, async (req, reply) => {
      const html = await readFile(resolve(root, "web", file), "utf8");
      reply.type("text/html").send(await vite.transformIndexHtml(req.url, html));
    });
  }
  app.addHook("onClose", () => vite.close());
}

app.get("/", (_req, reply) => reply.redirect("/control"));

// --- Lifecycle --------------------------------------------------------------

async function shutdown() {
  await store.flush();
  await app.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port, host: "0.0.0.0" });
console.log(`\n  Overlay:       http://localhost:${port}/overlay   (?bg=checker shows transparency)`);
console.log(`  Control panel: http://localhost:${port}/control\n`);
