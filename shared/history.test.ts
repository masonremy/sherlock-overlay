import { describe, expect, it } from "vitest";
import { apply, createHistory, jump, redo, timeline, undo, HISTORY_LIMIT } from "./history";
import { createInitialState } from "./schema";

const T0 = "2026-11-01T20:00:00Z";
const T1 = "2026-11-01T20:01:00Z";
const start = () => createHistory(createInitialState(T0), T0);

describe("history", () => {
  it("bumps rev on every applied action", () => {
    let h = start();
    h = apply(h, { type: "debug/ping" }, T1);
    h = apply(h, { type: "case/setTitle", title: "A" }, T1);
    expect(h.present.state.rev).toBe(2);
  });

  it("undo restores the previous state but keeps rev increasing", () => {
    let h = start();
    h = apply(h, { type: "case/setTitle", title: "A" }, T1);
    h = apply(h, { type: "case/setTitle", title: "B" }, T1);
    h = undo(h);
    expect(h.present.state.case.title).toBe("A");
    expect(h.present.state.rev).toBe(3);
  });

  it("redo re-applies an undone change", () => {
    let h = start();
    h = apply(h, { type: "case/setTitle", title: "A" }, T1);
    h = undo(h);
    h = redo(h);
    expect(h.present.state.case.title).toBe("A");
    expect(h.present.state.rev).toBe(3);
  });

  it("a new action clears the redo stack", () => {
    let h = start();
    h = apply(h, { type: "case/setTitle", title: "A" }, T1);
    h = undo(h);
    h = apply(h, { type: "case/setTitle", title: "C" }, T1);
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
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = apply(h, { type: "debug/ping" }, T1);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });

  it("labels and timestamps each entry", () => {
    let h = start();
    h = apply(h, { type: "case/setTitle", title: "The Tin Soldier" }, T1);
    expect(timeline(h)).toEqual({
      entries: [
        { label: "Opened case", at: T0 },
        { label: 'Case title → "The Tin Soldier"', at: T1 },
      ],
      index: 1,
    });
  });

  it("jumps several steps back and forward in one change", () => {
    let h = start();
    for (const title of ["A", "B", "C"]) h = apply(h, { type: "case/setTitle", title }, T1);
    h = jump(h, -2);
    expect(h.present.state.case.title).toBe("A");
    expect(h.present.state.rev).toBe(4);
    expect(timeline(h).index).toBe(1);
    h = jump(h, 2);
    expect(h.present.state.case.title).toBe("C");
    expect(h.present.state.rev).toBe(5);
  });

  it("clamps jumps to the ends of the stack", () => {
    let h = start();
    h = apply(h, { type: "case/setTitle", title: "A" }, T1);
    expect(jump(h, -10).present.state.case.title).toBe("");
    expect(jump(h, 0)).toBe(h);
    expect(jump(h, 5)).toBe(h);
  });
});
