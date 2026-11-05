import { writable, type Readable } from "svelte/store";
import { WS_PATH } from "../../shared/constants";
import type { ClientMessage, Cue, MirrorView, ReaderView, ServerMessage } from "../../shared/protocol";
import type { AppState } from "../../shared/schema";
import type { ActionInput } from "../../shared/actions";
import type { Timeline } from "../../shared/history";

// One WebSocket to the server, reconnecting with backoff. Both pages are thin
// clients: they render whatever snapshot arrives last and send actions back.

export type Status = "connecting" | "open" | "closed";

export interface Snapshot {
  rev: number;
  /** Folder name of the open case under cases/. */
  caseId: string;
  state: AppState;
  history: Timeline;
  canUndo: boolean;
  canRedo: boolean;
}

export interface Connection {
  status: Readable<Status>;
  snapshot: Readable<Snapshot | null>;
  lastError: Readable<string | null>;
  /** The panel's map view, streamed while the overlay is in mirror mode. */
  mirror: Readable<MirrorView | null>;
  /** Latest presentation cue; seq changes even when the same cue repeats. */
  cue: Readable<{ cue: Cue; seq: number } | null>;
  /** Compact notes strip scroll position (0–1), set from the panel's preview. */
  notesScroll: Readable<number>;
  dispatch(action: ActionInput): void;
  undo(): void;
  redo(): void;
  /** Roll back (negative) or forward through history in one change. */
  jump(offset: number): void;
  sendMirror(view: MirrorView): void;
  sendCue(cue: Cue): void;
  sendNotesScroll(value: number): void;
  /** What each document shows on stream (page, visible area, highlight), by document id. */
  readers: Readable<Record<string, ReaderView>>;
  sendReader(view: ReaderView): void;
}

export function connect(): Connection {
  const status = writable<Status>("connecting");
  const snapshot = writable<Snapshot | null>(null);
  const lastError = writable<string | null>(null);
  const mirror = writable<MirrorView | null>(null);
  const cue = writable<{ cue: Cue; seq: number } | null>(null);
  let cueSeq = 0;
  const notesScroll = writable(0);
  const readers = writable<Record<string, ReaderView>>({});
  let ws: WebSocket | null = null;
  let retryMs = 500;
  let latestRev = -1;
  let latestCase = "";

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
      if (msg.type === "mirror") {
        mirror.set(msg.view);
        return;
      }
      if (msg.type === "notesScroll") {
        notesScroll.set(msg.value);
        return;
      }
      if (msg.type === "cue") {
        cue.set({ cue: msg.cue, seq: ++cueSeq });
        return;
      }
      if (msg.type === "reader") {
        readers.update((all) => ({ ...all, [msg.view.doc]: msg.view }));
        return;
      }
      // A restarted server may reload an older rev from disk; accept it after a
      // reconnect. Opening another case starts its own rev count.
      if (msg.rev < latestRev && msg.caseId === latestCase) return;
      latestCase = msg.caseId;
      latestRev = msg.rev;
      lastError.set(null);
      const { entries, index } = msg.history;
      snapshot.set({
        rev: msg.rev,
        caseId: msg.caseId,
        state: msg.state,
        history: msg.history,
        canUndo: index > 0,
        canRedo: index < entries.length - 1,
      });
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
    mirror,
    cue,
    notesScroll,
    dispatch: (action) => send({ type: "action", action }),
    undo: () => send({ type: "undo" }),
    redo: () => send({ type: "redo" }),
    jump: (offset) => send({ type: "jump", offset }),
    sendMirror: (view) => send({ type: "mirror", view }),
    sendCue: (c) => send({ type: "cue", cue: c }),
    readers,
    sendReader: (view) => {
      readers.update((all) => ({ ...all, [view.doc]: view }));
      send({ type: "reader", view });
    },
    sendNotesScroll: (value) => {
      notesScroll.set(value);
      send({ type: "notesScroll", value });
    },
  };
}
