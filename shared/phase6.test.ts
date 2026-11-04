import { describe, expect, it } from "vitest";
import { parseAction } from "./actions";
import { ActionError, reduce } from "./reducer";
import { DEFAULT_LAYOUT } from "./layout";
import { AppState, createInitialState, Layout } from "./schema";

const T = "2026-11-01T20:00:00Z";

function run(state: AppState, raw: unknown): AppState {
  const parsed = parseAction(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return reduce(state, parsed.action);
}

const zone = (id: string, district = "WC") => ({
  id,
  label: id.toUpperCase(),
  district,
  shape: "rect",
  points: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]],
  anchor: [0.15, 0.15],
});

function base(): AppState {
  let s = createInitialState(T);
  s = { ...s, layouts: { full: Layout.parse({ id: "full", name: "Full", components: DEFAULT_LAYOUT }) } };
  s = run(s, { type: "map/import", map: { id: "london", image: "l.png", imageSize: [100, 100], zones: [zone("a"), zone("b", "SW")] }, replace: false });
  return run(s, { type: "trail/add", step: { id: "t1", mapId: "london", zoneId: "a", at: T } });
}

describe("layouts", () => {
  const corner = () => Layout.parse({ id: "corner", name: "Corner", components: { ...DEFAULT_LAYOUT, focus: { ...DEFAULT_LAYOUT.focus, x: 1200, w: 700 } } });

  it("fills missing components and fields from the default layout", () => {
    const l = Layout.parse({ id: "x", components: { focus: { x: 1, y: 2, w: 300, h: 200 } } });
    expect(l.components.focus).toMatchObject({ x: 1, y: 2, w: 300, h: 200, z: 1, visible: true, opacity: 1, locked: false });
    expect(l.components.header).toMatchObject(DEFAULT_LAYOUT.header);
    expect(l.reserved).toEqual([]);
  });

  it("saves (creates or replaces) a layout", () => {
    let s = run(base(), { type: "layout/save", layout: corner() });
    expect(s.layouts.corner.components.focus.x).toBe(1200);
    s = run(s, { type: "layout/save", layout: { ...corner(), name: "Corner view" } });
    expect(s.layouts.corner.name).toBe("Corner view");
  });

  it("switches the overlay to a saved layout", () => {
    let s = run(base(), { type: "layout/save", layout: corner() });
    s = run(s, { type: "overlay/setLayout", layoutId: "corner" });
    expect(s.overlay.layoutId).toBe("corner");
    expect(() => run(s, { type: "overlay/setLayout", layoutId: "nope" })).toThrow(ActionError);
  });

  it("deletes a layout, moving the overlay off it, but never the last one", () => {
    let s = run(base(), { type: "layout/save", layout: corner() });
    s = run(s, { type: "overlay/setLayout", layoutId: "corner" });
    s = run(s, { type: "layout/delete", layoutId: "corner" });
    expect(Object.keys(s.layouts)).toEqual(["full"]);
    expect(s.overlay.layoutId).toBe("full");
    expect(() => run(s, { type: "layout/delete", layoutId: "full" })).toThrow(/last/);
  });

  it("validates ids, sizes and reserved boxes", () => {
    const bad = (layout: unknown) => parseAction({ type: "layout/save", layout }).ok;
    expect(bad({ ...corner(), id: "Has Spaces" })).toBe(false);
    expect(bad({ ...corner(), components: { ...corner().components, focus: { ...corner().components.focus, w: 2 } } })).toBe(false);
    expect(bad({ ...corner(), reserved: [{ id: "r1", name: "alerts", x: 1500, y: 0, w: 400, h: 200 }] })).toBe(true);
  });
});

describe("theme", () => {
  it("defaults to the bundled fonts with no overrides", () => {
    expect(base().theme).toEqual({ display: "IM Fell English", body: "Source Sans 3", components: {} });
  });

  it("sets master fonts and per-component overrides", () => {
    const s = run(base(), {
      type: "theme/set",
      theme: { display: "Playfair Display", body: "Lato", components: { header: { display: "Special Elite", scale: 1.2 } } },
    });
    expect(s.theme.display).toBe("Playfair Display");
    expect(s.theme.components.header).toEqual({ display: "Special Elite", body: null, scale: 1.2, weight: null, letterSpacing: 0 });
  });

  it("rejects out-of-range scales", () => {
    expect(parseAction({ type: "theme/set", theme: { components: { cast: { scale: 3 } } } }).ok).toBe(false);
  });
});

describe("newspapers", () => {
  const paper = (id: string, date: string | null) => ({ id, file: "np-0123456789abcdef.webp", date, title: "" });

  it("keeps a dated library and points the case at its own paper", () => {
    let s = run(base(), { type: "paper/add", paper: paper("p14", "1889-03-14") });
    s = run(s, { type: "paper/add", paper: paper("p12", "1889-03-12") });
    s = run(s, { type: "newspaper/update", patch: { paperId: "p14" } });
    expect(s.newspaper).toMatchObject({ paperId: "p14", showing: null, opened: false });
    expect(s.case.paperDate).toBe("1889-03-14"); // the case takes its paper's date
    s = run(s, { type: "newspaper/update", patch: { showing: "p12", zoom: { x: 0.1, y: 0.2, w: 0.3, h: 0.2 }, opened: true } });
    expect(s.newspaper).toMatchObject({ showing: "p12", opened: true, zoom: { x: 0.1, y: 0.2, w: 0.3, h: 0.2 } });
  });

  it("validates", () => {
    expect(() => run(base(), { type: "newspaper/update", patch: { paperId: "nope" } })).toThrow(ActionError);
    expect(parseAction({ type: "paper/add", paper: paper("p1", "14 March") }).ok).toBe(false);
    expect(parseAction({ type: "newspaper/update", patch: { zoom: { x: 0.9, y: 0, w: 0.5, h: 0.5 } } }).ok).toBe(false);
  });

  it("deleting a paper clears the case's references to it", () => {
    let s = run(base(), { type: "paper/add", paper: paper("p14", "1889-03-14") });
    s = run(s, { type: "newspaper/update", patch: { paperId: "p14", showing: "p14" } });
    s = run(s, { type: "paper/delete", paperId: "p14" });
    expect(s.papers).toEqual({});
    expect(s.newspaper).toMatchObject({ paperId: null, showing: null });
  });

  it("edits a paper's date and title", () => {
    let s = run(base(), { type: "paper/add", paper: paper("p1", null) });
    s = run(s, { type: "paper/update", paperId: "p1", patch: { date: "1889-03-10", title: "The Times" } });
    expect(s.papers.p1).toMatchObject({ date: "1889-03-10", title: "The Times" });
  });
});

describe("scoring/update", () => {
  it("sets the end-of-case fields", () => {
    const s = run(base(), { type: "scoring/update", patch: { series1: 60, series2: 40, holmesLeads: 7, freeStepIds: ["t1"] } });
    expect(s.scoring).toEqual({ series1: 60, series2: 40, holmesLeads: 7, freeStepIds: ["t1"] });
  });

  it("only accepts trail steps as free", () => {
    expect(() => run(base(), { type: "scoring/update", patch: { freeStepIds: ["nope"] } })).toThrow(ActionError);
  });
});

describe("case/update", () => {
  it("edits case details, players and the timesheet switch", () => {
    const s = run(base(), {
      type: "case/update",
      patch: { title: "The Tin Soldier", number: "3", box: "Thames Murders", paperDate: "1889-03-14", timesheet: true, players: [{ id: "p1", name: "Ann" }] },
    });
    expect(s.case).toMatchObject({ title: "The Tin Soldier", number: "3", box: "Thames Murders", paperDate: "1889-03-14", timesheet: true });
    expect(s.case.players).toEqual([{ id: "p1", name: "Ann" }]);
  });

  it("validates dates", () => {
    expect(parseAction({ type: "case/update", patch: { paperDate: "yesterday" } }).ok).toBe(false);
  });
});

describe("informants and adjacency", () => {
  it("stores informants on the map definition", () => {
    const s = run(base(), { type: "map/setInformants", mapId: "london", informants: [{ id: "i1", name: "Scotland Yard", zoneId: "b" }] });
    expect(s.maps.london.informants).toEqual([{ id: "i1", name: "Scotland Yard", zoneId: "b" }]);
    expect(() => run(base(), { type: "map/setInformants", mapId: "london", informants: [{ id: "i1", name: "X", zoneId: "zz" }] })).toThrow(ActionError);
  });

  it("stores the area adjacency table", () => {
    const s = run(base(), { type: "map/setAdjacency", mapId: "london", adjacency: { WC: ["SW"], SW: ["WC"] } });
    expect(s.maps.london.adjacency).toEqual({ WC: ["SW"], SW: ["WC"] });
  });
});

describe("timesheet and turn fields on steps", () => {
  it("records the lead's duration and whose turn it was", () => {
    const s = run(base(), { type: "trail/add", step: { id: "t2", mapId: "london", zoneId: "b", at: T, duration: 30, by: "p1" } });
    expect(s.trail[1]).toMatchObject({ duration: 30, by: "p1" });
    expect(run(s, { type: "trail/update", stepId: "t2", patch: { duration: 45 } }).trail[1].duration).toBe(45);
  });
});

describe("overlay options", () => {
  it("shows guides, reduces motion, and can put the verdict in focus", () => {
    let s = run(base(), { type: "overlay/configure", patch: { showGuides: true, reducedMotion: true } });
    expect(s.overlay).toMatchObject({ showGuides: true, reducedMotion: true });
    s = run(s, { type: "overlay/setFocus", focus: "verdict" });
    expect(s.overlay.focus).toBe("verdict");
  });
});
