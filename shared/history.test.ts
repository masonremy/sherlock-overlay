import { describe, expect, it } from "vitest";
import { apply, createHistory, redo, undo, HISTORY_LIMIT } from "./history";
import { createInitialState } from "./schema";

const start = () => createHistory(createInitialState("2026-11-01T20:00:00Z"));

describe("history", () => {
  it("bumps rev on every applied action", () => {
    let h = start();
    h = apply(h, { type: "debug/ping" });
    h = apply(h, { type: "case/setTitle", title: "A" });
    expect(h.present.rev).toBe(2);
  });

  it("undo restores the previous state but keeps rev increasing", () => {
    let h = start();
    h = apply(h, { type: "case/setTitle", title: "A" });
    h = apply(h, { type: "case/setTitle", title: "B" });
    h = undo(h);
    expect(h.present.case.title).toBe("A");
    expect(h.present.rev).toBe(3);
  });

  it("redo re-applies an undone change", () => {
    let h = start();
    h = apply(h, { type: "case/setTitle", title: "A" });
    h = undo(h);
    h = redo(h);
    expect(h.present.case.title).toBe("A");
    expect(h.present.rev).toBe(3);
  });

  it("a new action clears the redo stack", () => {
    let h = start();
    h = apply(h, { type: "case/setTitle", title: "A" });
    h = undo(h);
    h = apply(h, { type: "case/setTitle", title: "C" });
    expect(h.future).toHaveLength(0);
    expect(redo(h)).toBe(h);
  });

  it("undo and redo are no-ops at the ends of the stack", () => {
    const h = start();
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("caps the undo stack", () => {
    let h = start();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = apply(h, { type: "debug/ping" });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
