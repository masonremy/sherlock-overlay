import { describe, expect, it } from "vitest";
import type { Character, MapDef, Note, TrailStep } from "../../shared/schema";
import { autoLinks, filterNotes, fromDisplay, linksInText, mentionAt, noteRingZones, parseQuickNote, segments, toDisplay } from "./notes";

const char = (id: string, name: string): Character => ({
  id,
  name,
  role: "",
  status: "witness",
  portrait: null,
  cameo: null,
  address: null,
  notes: "",
  hidden: false,
});
const maps = {
  london: { id: "london", name: "London", zones: [{ id: "sw-13", label: "13 SW" }, { id: "wc-14", label: "14 WC" }] },
} as unknown as Record<string, MapDef>;
const chars = [char("c1", "Mrs. Example"), char("c2", "Lestrade")];
const note = (id: string, extra: Partial<Note> = {}): Note => ({
  id,
  text: id,
  tag: null,
  pinned: false,
  hidden: false,
  stepIds: [],
  characterIds: [],
  places: [],
  ...extra,
});

describe("parseQuickNote", () => {
  it("! pins and ? tags as a question, in either order", () => {
    expect(parseQuickNote("!? Who wrote the letter")).toEqual({ text: "Who wrote the letter", pinned: true, tag: "question" });
    expect(parseQuickNote("?!Who")).toEqual({ text: "Who", pinned: true, tag: "question" });
    expect(parseQuickNote("! Muddy boots")).toEqual({ text: "Muddy boots", pinned: true, tag: null });
    expect(parseQuickNote("plain")).toEqual({ text: "plain", pinned: false, tag: null });
  });

  it("leaves punctuation inside the text alone", () => {
    expect(parseQuickNote("Why? Nobody knows!")).toEqual({ text: "Why? Nobody knows!", pinned: false, tag: null });
  });
});

describe("mention tokens", () => {
  it("renders tokens as names, so renames ripple", () => {
    expect(toDisplay("Met @[c1] at #[london/sw-13]", chars, maps)).toBe("Met @Mrs. Example at #13 SW");
  });

  it("turns typed mentions of linked things back into tokens", () => {
    const text = fromDisplay("Met @Mrs. Example at #13 SW, not @Bob", chars, maps, ["c1"], [{ mapId: "london", zoneId: "sw-13" }]);
    expect(text).toBe("Met @[c1] at #[london/sw-13], not @Bob");
  });

  it("splits text into segments for chips", () => {
    expect(segments("Met @[c1] at #[london/sw-13]!", chars, maps)).toEqual([
      { kind: "text", text: "Met " },
      { kind: "character", character: chars[0] },
      { kind: "text", text: " at " },
      { kind: "place", label: "13 SW", mapId: "london", zoneId: "sw-13" },
      { kind: "text", text: "!" },
    ]);
  });

  it("shows unknown references as plain text", () => {
    expect(toDisplay("@[gone] #[london/zz]", chars, maps)).toBe("@? #?");
  });

  it("collects the links a text mentions", () => {
    expect(linksInText("@[c1] @[c2] @[c1] #[london/wc-14]")).toEqual({
      characterIds: ["c1", "c2"],
      places: [{ mapId: "london", zoneId: "wc-14" }],
    });
  });
});

describe("autoLinks", () => {
  it("links exact @names and #zone labels typed by hand", () => {
    const mapList = Object.values(maps);
    expect(autoLinks("Ask @Lestrade about #13 SW and #14 WCX, not @Les", chars, mapList)).toEqual({
      characterIds: ["c2"],
      places: [{ mapId: "london", zoneId: "sw-13" }],
    });
  });
});

describe("mentionAt", () => {
  it("finds the @ or # being typed before the caret", () => {
    expect(mentionAt("Met @lan", 8)).toEqual({ kind: "@", query: "lan", start: 4 });
    expect(mentionAt("at #13s", 7)).toEqual({ kind: "#", query: "13s", start: 3 });
    expect(mentionAt("email a@b", 9)).toBeNull(); // not at a word start
    expect(mentionAt("@lan done", 9)).toBeNull(); // caret past a space
  });
});

describe("filterNotes", () => {
  const notes = [
    note("n1", { characterIds: ["c1"] }),
    note("n2", { places: [{ mapId: "london", zoneId: "wc-14" }] }),
    note("n3", { stepIds: ["t1"] }),
  ];
  it("filters by character, place or step", () => {
    expect(filterNotes(notes, { kind: "character", id: "c1" }).map((n) => n.id)).toEqual(["n1"]);
    expect(filterNotes(notes, { kind: "place", mapId: "london", zoneId: "wc-14" }).map((n) => n.id)).toEqual(["n2"]);
    expect(filterNotes(notes, { kind: "step", id: "t1" }).map((n) => n.id)).toEqual(["n3"]);
    expect(filterNotes(notes, null)).toHaveLength(3);
  });
});

describe("noteRingZones", () => {
  const step = (zoneId: string): TrailStep => ({
    id: zoneId,
    mapId: "london",
    zoneId,
    kind: "lead",
    customLabel: null,
    note: "",
    characterIds: [],
    by: null,
    clock: null,
    duration: null,
    at: "",
  });

  it("marks places from visible pinned notes that haven't been visited", () => {
    const notes = [
      note("n1", { pinned: true, places: [{ mapId: "london", zoneId: "sw-13" }, { mapId: "london", zoneId: "wc-14" }] }),
      note("n2", { pinned: false, places: [{ mapId: "london", zoneId: "x" }] }), // private
      note("n3", { pinned: true, hidden: true, places: [{ mapId: "london", zoneId: "y" }] }), // hidden
    ];
    expect(noteRingZones(notes, [step("wc-14")], "london")).toEqual(["sw-13"]);
  });
});
