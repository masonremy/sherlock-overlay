import { describe, expect, it } from "vitest";
import { focusAction, toolkitItems } from "./focus";

describe("focusAction", () => {
  it("brings an item into focus", () => {
    expect(focusAction("map", "notes")).toEqual({ type: "overlay/setFocus", focus: "notes" });
  });

  it("selecting the item already in focus dismisses it (back to what was there before)", () => {
    expect(focusAction("notes", "notes")).toEqual({ type: "overlay/returnFocus" });
    expect(focusAction("newspaper", "newspaper")).toEqual({ type: "overlay/returnFocus" });
  });

  it("the map can't be dismissed", () => {
    expect(focusAction("map", "map")).toBeNull();
  });
});

describe("toolkitItems", () => {
  it("shows the newspaper only once a paper is loaded", () => {
    expect(toolkitItems(null)).toEqual(["map", "notes"]);
    expect(toolkitItems("paper-01")).toEqual(["map", "newspaper", "notes"]);
  });

  it("adds the directory and informants after the notes when their PDFs are present", () => {
    expect(toolkitItems("paper-01", ["directory", "informants"])).toEqual(["map", "newspaper", "notes", "directory", "informants"]);
    expect(toolkitItems(null, ["informants"])).toEqual(["map", "notes", "informants"]);
  });
});
