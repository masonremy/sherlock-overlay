import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { DEFAULT_PORT, WS_PATH } from "../shared/constants";
import { ClientMessage, type ServerMessage } from "../shared/protocol";
import { CaseStore } from "./store";

const root = resolve(import.meta.dirname, "..");
const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? DEFAULT_PORT);
const caseId = process.env.CASE ?? "default";

const app = Fastify({ logger: { level: "info" } });
const store = await CaseStore.load(resolve(root, "cases"), caseId);
app.log.info(`case "${caseId}" loaded at rev ${store.state.rev}`);

// --- WebSocket sync ---------------------------------------------------------

const wss = new WebSocketServer({ noServer: true });

app.server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  // Other upgrades (Vite HMR in dev) are handled by their own listeners.
  if (pathname !== WS_PATH) return;
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

function snapshot(): ServerMessage {
  return { type: "snapshot", rev: store.state.rev, state: store.state, canUndo: store.canUndo, canRedo: store.canRedo };
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

store.subscribe(() => {
  const msg = snapshot();
  for (const ws of wss.clients) send(ws, msg);
});

wss.on("connection", (ws) => {
  send(ws, snapshot());
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
    else {
      const result = store.dispatch(msg.action);
      if (!result.ok) send(ws, { type: "error", message: result.error });
    }
  });
});

// --- Pages ------------------------------------------------------------------

const pages = { overlay: "overlay.html", control: "control.html" } as const;

if (isProd) {
  const dist = resolve(root, "dist/web");
  await app.register(import("@fastify/static"), { root: dist, index: false });
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
