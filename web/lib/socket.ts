import { writable, type Readable } from "svelte/store";
import { WS_PATH } from "../../shared/constants";
import type { ClientMessage, ServerMessage } from "../../shared/protocol";
import type { CaseState } from "../../shared/schema";
import type { Action } from "../../shared/actions";

// One WebSocket to the server, reconnecting with backoff. Both pages are thin
// clients: they render whatever snapshot arrives last and send actions back.

export type Status = "connecting" | "open" | "closed";

export interface Snapshot {
  rev: number;
  state: CaseState;
  canUndo: boolean;
  canRedo: boolean;
}

export interface Connection {
  status: Readable<Status>;
  snapshot: Readable<Snapshot | null>;
  lastError: Readable<string | null>;
  dispatch(action: Action): void;
  undo(): void;
  redo(): void;
}

export function connect(): Connection {
  const status = writable<Status>("connecting");
  const snapshot = writable<Snapshot | null>(null);
  const lastError = writable<string | null>(null);
  let ws: WebSocket | null = null;
  let retryMs = 500;
  let latestRev = -1;

  function open() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}${WS_PATH}`);
    status.set("connecting");

    ws.onopen = () => {
      status.set("open");
      retryMs = 500;
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerMessage;
      if (msg.type === "error") {
        lastError.set(msg.message);
        return;
      }
      // A restarted server may reload an older rev from disk; accept it after a reconnect.
      if (msg.rev < latestRev) return;
      latestRev = msg.rev;
      lastError.set(null);
      snapshot.set({ rev: msg.rev, state: msg.state, canUndo: msg.canUndo, canRedo: msg.canRedo });
    };
    ws.onclose = () => {
      status.set("closed");
      latestRev = -1;
      setTimeout(open, retryMs);
      retryMs = Math.min(retryMs * 2, 5000);
    };
  }

  function send(msg: ClientMessage) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  open();

  return {
    status,
    snapshot,
    lastError,
    dispatch: (action) => send({ type: "action", action }),
    undo: () => send({ type: "undo" }),
    redo: () => send({ type: "redo" }),
  };
}
