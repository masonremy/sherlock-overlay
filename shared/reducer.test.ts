import { describe, expect, it } from "vitest";
import { reduce } from "./reducer";
import { createInitialState } from "./schema";
import { parseAction } from "./actions";

const fresh = () => createInitialState("2026-11-01T20:00:00Z");

describe("case/setTitle", () => {
  it("sets the case title", () => {
    const next = reduce(fresh(), { type: "case/setTitle", title: "Case 3 · The Tin Soldier" });
    expect(next.case.title).toBe("Case 3 · The Tin Soldier");
  });

  it("does not mutate the previous state", () => {
    const before = fresh();
    reduce(before, { type: "case/setTitle", title: "Changed" });
    expect(before.case.title).toBe("");
  });

  it("leaves rev alone (the store owns rev)", () => {
    const next = reduce(fresh(), { type: "case/setTitle", title: "x" });
    expect(next.rev).toBe(0);
  });
});

describe("debug/ping", () => {
  it("changes nothing in the state", () => {
    const before = fresh();
    expect(reduce(before, { type: "debug/ping" })).toEqual(before);
  });
});

describe("parseAction", () => {
  it("accepts a valid action", () => {
    expect(parseAction({ type: "case/setTitle", title: "A" })).toEqual({
      ok: true,
      action: { type: "case/setTitle", title: "A" },
    });
  });

  it("rejects unknown types", () => {
    expect(parseAction({ type: "nope" }).ok).toBe(false);
  });

  it("rejects bad payloads", () => {
    expect(parseAction({ type: "case/setTitle", title: 7 }).ok).toBe(false);
    expect(parseAction({ type: "case/setTitle", title: "x".repeat(201) }).ok).toBe(false);
  });
});
