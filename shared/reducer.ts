import { z } from "zod";
import type { Action } from "./actions";
import { TrailStep, Zone, type AppState, type MapDef } from "./schema";

/** An action that is well-formed but can't apply to the current state. */
export class ActionError extends Error {}

// Pure: never mutates `state`, never touches `rev` (history.ts owns rev).
// Throws ActionError when the action doesn't fit the current state.
export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "case/setTitle":
      return { ...state, case: { ...state.case, title: action.title } };
    case "debug/ping":
      return state;

    case "case/addMap":
      getMap(state, action.mapId);
      return withCaseMap(state, action.mapId);
    case "case/removeMap":
      if (trailUsesMap(state, action.mapId)) {
        throw new ActionError(`The trail has steps on map "${action.mapId}"; remove them first`);
      }
      return { ...state, case: { ...state.case, mapIds: state.case.mapIds.filter((id) => id !== action.mapId) } };

    case "map/create": {
      if (state.maps[action.map.id]) throw new ActionError(`A map with id "${action.map.id}" already exists`);
      const map: MapDef = { ...action.map, zones: [], informants: [], adjacency: {} };
      return withCaseMap(setMap(state, map), map.id);
    }
    case "map/import":
      if (state.maps[action.map.id] && !action.replace) {
        throw new ActionError(`A map with id "${action.map.id}" already exists`);
      }
      return withCaseMap(setMap(state, action.map), action.map.id);
    case "map/rename":
      return setMap(state, { ...getMap(state, action.mapId), name: action.name });
    case "map/setImage":
      return setMap(state, { ...getMap(state, action.mapId), image: action.image, imageSize: action.imageSize });
    case "map/delete": {
      getMap(state, action.mapId);
      if (trailUsesMap(state, action.mapId)) {
        throw new ActionError(`The trail has steps on map "${action.mapId}"; remove them first`);
      }
      const { [action.mapId]: _deleted, ...maps } = state.maps;
      return { ...state, maps, case: { ...state.case, mapIds: state.case.mapIds.filter((id) => id !== action.mapId) } };
    }

    case "zone/add": {
      const map = getMap(state, action.mapId);
      if (map.zones.some((z) => z.id === action.zone.id)) {
        throw new ActionError(`Zone "${action.zone.id}" already exists on this map`);
      }
      return setMap(state, { ...map, zones: [...map.zones, action.zone] });
    }
    case "zone/update": {
      const map = getMap(state, action.mapId);
      const index = zoneIndex(map, action.zoneId);
      const result = Zone.safeParse({ ...map.zones[index], ...action.patch });
      if (!result.success) throw new ActionError(z.prettifyError(result.error));
      return setMap(state, { ...map, zones: map.zones.with(index, result.data) });
    }
    case "zone/delete": {
      const map = getMap(state, action.mapId);
      zoneIndex(map, action.zoneId);
      const usedBy = zoneUsedBy(state, action.mapId, action.zoneId);
      if (usedBy) throw new ActionError(`Zone is used by ${usedBy}; unlink it first`);
      return setMap(state, { ...map, zones: map.zones.filter((z) => z.id !== action.zoneId) });
    }

    case "trail/add":
      return editTrail(state, (trail) => {
        if (trail.some((t) => t.id === action.step.id)) throw new ActionError(`Step "${action.step.id}" already exists`);
        const index = action.index ?? trail.length;
        if (index > trail.length) throw new ActionError(`Can't insert at position ${index + 1}`);
        const step = TrailStep.parse(action.step);
        checkStep(state, step, true);
        return trail.toSpliced(index, 0, step);
      });
    case "trail/update":
      return editTrail(state, (trail) => {
        const index = stepIndex(trail, action.stepId);
        const old = trail[index];
        const step = { ...old, ...action.patch };
        checkStep(state, step, step.mapId !== old.mapId || step.zoneId !== old.zoneId);
        return trail.with(index, step);
      });
    case "trail/delete":
      return editTrail(state, (trail) => trail.toSpliced(stepIndex(trail, action.stepId), 1));
    case "trail/move":
      return editTrail(state, (trail) => {
        const index = stepIndex(trail, action.stepId);
        if (action.toIndex >= trail.length) throw new ActionError(`Can't move to position ${action.toIndex + 1}`);
        return trail.toSpliced(index, 1).toSpliced(action.toIndex, 0, trail[index]);
      });
    case "trail/beginEdit":
      if (state.trailDraft) throw new ActionError("The trail is already being edited");
      return { ...state, trailDraft: state.trail };
    case "trail/apply":
      if (!state.trailDraft) throw new ActionError("There are no trail edits to apply");
      return { ...commitTrail(state, state.trailDraft), trailDraft: null };
    case "trail/discard":
      if (!state.trailDraft) throw new ActionError("There are no trail edits to discard");
      return { ...state, trailDraft: null };

    case "character/add": {
      const c = action.character;
      if (state.characters.some((x) => x.id === c.id)) throw new ActionError(`Character "${c.id}" already exists`);
      checkPlace(state, c.address);
      const next = { ...state, characters: [...state.characters, c] };
      if (!action.stepId) return next;
      const stepId = action.stepId;
      return editTrail(next, (trail) => {
        const i = stepIndex(trail, stepId);
        return trail.with(i, { ...trail[i], characterIds: [...trail[i].characterIds, c.id] });
      });
    }
    case "character/update": {
      const i = characterIndex(state, action.characterId);
      if (action.patch.address) checkPlace(state, action.patch.address);
      return { ...state, characters: state.characters.with(i, { ...state.characters[i], ...action.patch }) };
    }
    case "character/delete": {
      characterIndex(state, action.characterId);
      const drop = <T extends { characterIds: string[] }>(x: T): T =>
        x.characterIds.includes(action.characterId)
          ? { ...x, characterIds: x.characterIds.filter((id) => id !== action.characterId) }
          : x;
      return {
        ...state,
        characters: state.characters.filter((c) => c.id !== action.characterId),
        trail: state.trail.map(drop),
        trailDraft: state.trailDraft?.map(drop) ?? null,
        notes: state.notes.map(drop),
      };
    }

    case "key/add": {
      if (state.keys.some((k) => k.letter === action.letter)) throw new ActionError(`Key ${action.letter} already exists`);
      const stamp = action.unlocked ? action.stepId : null;
      if (stamp) checkStepExists(state, stamp);
      const key = { letter: action.letter, unlocked: action.unlocked, unlockedAtStep: stamp, note: "" };
      return { ...state, keys: [...state.keys, key] };
    }
    case "key/update": {
      const i = keyIndex(state, action.letter);
      const { patch } = action;
      if (patch.letter && patch.letter !== action.letter && state.keys.some((k) => k.letter === patch.letter)) {
        throw new ActionError(`Key ${patch.letter} already exists`);
      }
      if (patch.unlockedAtStep) checkStepExists(state, patch.unlockedAtStep);
      const key = { ...state.keys[i], ...patch };
      if (!key.unlocked) key.unlockedAtStep = null;
      return { ...state, keys: state.keys.with(i, key) };
    }
    case "key/delete":
      keyIndex(state, action.letter);
      return { ...state, keys: state.keys.filter((k) => k.letter !== action.letter) };

    case "portrait/add":
      if (state.portraits[action.portrait.id]) throw new ActionError(`Portrait "${action.portrait.id}" already exists`);
      return { ...state, portraits: { ...state.portraits, [action.portrait.id]: action.portrait } };
    case "portrait/update": {
      const p = getPortrait(state, action.portraitId);
      return { ...state, portraits: { ...state.portraits, [p.id]: { ...p, tags: action.tags } } };
    }
    case "portrait/delete": {
      getPortrait(state, action.portraitId);
      const { [action.portraitId]: _deleted, ...portraits } = state.portraits;
      return { ...state, portraits };
    }

    case "note/add": {
      if (state.notes.some((n) => n.id === action.note.id)) throw new ActionError(`Note "${action.note.id}" already exists`);
      checkNoteLinks(state, action.note);
      const index = Math.min(action.index ?? 0, state.notes.length);
      return { ...state, notes: state.notes.toSpliced(index, 0, action.note) };
    }
    case "note/update": {
      const i = noteIndex(state, action.noteId);
      checkNoteLinks(state, action.patch);
      return { ...state, notes: state.notes.with(i, { ...state.notes[i], ...action.patch }) };
    }
    case "note/delete":
      noteIndex(state, action.noteId);
      return { ...state, notes: state.notes.filter((n) => n.id !== action.noteId) };
    case "note/move": {
      const i = noteIndex(state, action.noteId);
      if (action.toIndex >= state.notes.length) throw new ActionError(`Can't move to position ${action.toIndex + 1}`);
      return { ...state, notes: state.notes.toSpliced(i, 1).toSpliced(action.toIndex, 0, state.notes[i]) };
    }

    case "case/update": {
      return { ...state, case: { ...state.case, ...action.patch } };
    }

    case "map/setInformants": {
      const map = getMap(state, action.mapId);
      for (const inf of action.informants) zoneIndex(map, inf.zoneId);
      return setMap(state, { ...map, informants: action.informants });
    }
    case "map/setAdjacency":
      return setMap(state, { ...getMap(state, action.mapId), adjacency: action.adjacency });

    case "paper/add":
      if (state.papers[action.paper.id]) throw new ActionError(`Paper "${action.paper.id}" already exists`);
      return { ...state, papers: { ...state.papers, [action.paper.id]: action.paper } };
    case "paper/update": {
      const p = getPaper(state, action.paperId);
      const next = { ...state, papers: { ...state.papers, [p.id]: { ...p, ...action.patch } } };
      // The case's own paper sets the case date.
      if (state.newspaper.paperId === p.id && action.patch.date !== undefined) {
        return { ...next, case: { ...next.case, paperDate: action.patch.date } };
      }
      return next;
    }
    case "paper/delete": {
      getPaper(state, action.paperId);
      const { [action.paperId]: _deleted, ...papers } = state.papers;
      const n = state.newspaper;
      const newspaper = {
        ...n,
        paperId: n.paperId === action.paperId ? null : n.paperId,
        showing: n.showing === action.paperId ? null : n.showing,
      };
      return { ...state, papers, newspaper };
    }
    case "newspaper/update": {
      const { patch } = action;
      if (patch.paperId) getPaper(state, patch.paperId);
      if (patch.showing) getPaper(state, patch.showing);
      const next = { ...state, newspaper: { ...state.newspaper, ...patch } };
      if (patch.paperId) {
        const date = state.papers[patch.paperId].date;
        if (date) return { ...next, case: { ...next.case, paperDate: date } };
      }
      return next;
    }

    case "scoring/update":
      for (const id of action.patch.freeStepIds ?? []) checkStepExists(state, id);
      return { ...state, scoring: { ...state.scoring, ...action.patch } };

    case "layout/save":
      return { ...state, layouts: { ...state.layouts, [action.layout.id]: action.layout } };
    case "layout/delete": {
      if (!state.layouts[action.layoutId]) throw new ActionError(`No layout "${action.layoutId}"`);
      const { [action.layoutId]: _deleted, ...layouts } = state.layouts;
      const remaining = Object.keys(layouts);
      if (!remaining.length) throw new ActionError("Can't delete the last layout");
      const layoutId = state.overlay.layoutId === action.layoutId ? remaining[0] : state.overlay.layoutId;
      return { ...state, layouts, overlay: { ...state.overlay, layoutId } };
    }
    case "theme/set":
      return { ...state, theme: action.theme };
    case "overlay/setLayout":
      if (!state.layouts[action.layoutId]) throw new ActionError(`No layout "${action.layoutId}"`);
      return { ...state, overlay: { ...state.overlay, layoutId: action.layoutId } };

    case "overlay/setFocus": {
      const { focus } = state.overlay;
      if (focus === action.focus) return state;
      return { ...state, overlay: { ...state.overlay, focus: action.focus, focusPrev: focus } };
    }
    case "overlay/returnFocus": {
      const { focus, focusPrev } = state.overlay;
      return { ...state, overlay: { ...state.overlay, focus: focusPrev === focus ? "map" : focusPrev, focusPrev: "map" } };
    }
    case "overlay/configure":
      return { ...state, overlay: { ...state.overlay, ...action.patch } };

    case "overlay/setMapView":
      return { ...state, overlay: { ...state.overlay, mapView: action.mode } };
    case "overlay/setMap":
      if (action.mapId && !state.case.mapIds.includes(action.mapId)) {
        throw new ActionError(`Map "${action.mapId}" is not used in this case`);
      }
      return { ...state, overlay: { ...state.overlay, mapId: action.mapId } };
  }
}

type Trail = AppState["trail"];

function characterIndex(state: AppState, characterId: string): number {
  const i = state.characters.findIndex((c) => c.id === characterId);
  if (i < 0) throw new ActionError(`No character "${characterId}"`);
  return i;
}

function keyIndex(state: AppState, letter: string): number {
  const i = state.keys.findIndex((k) => k.letter === letter.toUpperCase());
  if (i < 0) throw new ActionError(`No key ${letter}`);
  return i;
}

function getPortrait(state: AppState, portraitId: string) {
  const p = state.portraits[portraitId];
  if (!p) throw new ActionError(`No portrait "${portraitId}" in the library`);
  return p;
}

/** A place reference (character address, note place) must name an existing zone. */
function checkPlace(state: AppState, place: { mapId: string; zoneId: string } | null): void {
  if (place) zoneIndex(getMap(state, place.mapId), place.zoneId);
}

function getPaper(state: AppState, paperId: string) {
  const p = state.papers[paperId];
  if (!p) throw new ActionError(`No paper "${paperId}" in the library`);
  return p;
}

function noteIndex(state: AppState, noteId: string): number {
  const i = state.notes.findIndex((n) => n.id === noteId);
  if (i < 0) throw new ActionError(`No note "${noteId}"`);
  return i;
}

/** Every link on a note must point at something that exists. */
function checkNoteLinks(
  state: AppState,
  links: { stepIds?: string[]; characterIds?: string[]; places?: { mapId: string; zoneId: string }[] },
): void {
  for (const id of links.stepIds ?? []) checkStepExists(state, id);
  for (const id of links.characterIds ?? []) characterIndex(state, id);
  for (const p of links.places ?? []) checkPlace(state, p);
}

function checkStepExists(state: AppState, stepId: string): void {
  if (!allSteps(state).some((t) => t.id === stepId)) throw new ActionError(`No step "${stepId}" in the trail`);
}

/** Applies a trail change to the draft if one exists, else to the live trail. */
function editTrail(state: AppState, change: (trail: Trail) => Trail): AppState {
  if (state.trailDraft) return { ...state, trailDraft: change(state.trailDraft) };
  return commitTrail(state, change(state.trail));
}

/**
 * Replaces the live trail and repairs everything that points at step ids:
 * a key unlocked on a removed step stays unlocked, re-stamped to the nearest
 * earlier surviving step; notes and the free-step list drop removed ids.
 */
function commitTrail(state: AppState, next: Trail): AppState {
  const kept = new Set(next.map((t) => t.id));
  const prevOrder = state.trail.map((t) => t.id);
  const restamp = (stepId: string | null) => {
    if (!stepId || kept.has(stepId)) return stepId;
    for (let i = prevOrder.indexOf(stepId) - 1; i >= 0; i--) if (kept.has(prevOrder[i])) return prevOrder[i];
    return null;
  };
  return {
    ...state,
    trail: next,
    keys: state.keys.map((k) => (kept.has(k.unlockedAtStep ?? "") ? k : { ...k, unlockedAtStep: restamp(k.unlockedAtStep) })),
    notes: state.notes.map((n) => (n.stepIds.every((id) => kept.has(id)) ? n : { ...n, stepIds: n.stepIds.filter((id) => kept.has(id)) })),
    scoring: { ...state.scoring, freeStepIds: state.scoring.freeStepIds.filter((id) => kept.has(id)) },
  };
}

function stepIndex(trail: Trail, stepId: string): number {
  const index = trail.findIndex((t) => t.id === stepId);
  if (index < 0) throw new ActionError(`No step "${stepId}" in the trail`);
  return index;
}

/** A step is either on a visitable zone of a case map, or off-map with a label. */
function checkStep(state: AppState, step: TrailStep, checkPlace: boolean): void {
  const unknown = step.characterIds.find((id) => !state.characters.some((c) => c.id === id));
  if (unknown) throw new ActionError(`No character "${unknown}"`);
  const onMap = step.mapId !== null || step.zoneId !== null;
  if (onMap && step.customLabel) throw new ActionError("A step is either on the map or off-map with a label, not both");
  if (!onMap && !step.customLabel) throw new ActionError("An off-map step needs a label");
  if (!onMap || !checkPlace) return;
  if (!step.mapId || !step.zoneId) throw new ActionError("An on-map step needs both a map and a zone");
  const map = getMap(state, step.mapId);
  if (!state.case.mapIds.includes(map.id)) throw new ActionError(`Map "${map.id}" is not used in this case`);
  const zone = map.zones[zoneIndex(map, step.zoneId)];
  if (!zone.visitable) throw new ActionError(`${zone.label} is marked not visitable`);
}

function getMap(state: AppState, mapId: string): MapDef {
  const map = state.maps[mapId];
  if (!map) throw new ActionError(`No map with id "${mapId}"`);
  return map;
}

function setMap(state: AppState, map: MapDef): AppState {
  return { ...state, maps: { ...state.maps, [map.id]: map } };
}

function withCaseMap(state: AppState, mapId: string): AppState {
  if (state.case.mapIds.includes(mapId)) return state;
  return { ...state, case: { ...state.case, mapIds: [...state.case.mapIds, mapId] } };
}

function zoneIndex(map: MapDef, zoneId: string): number {
  const index = map.zones.findIndex((z) => z.id === zoneId);
  if (index < 0) throw new ActionError(`No zone "${zoneId}" on map "${map.id}"`);
  return index;
}

/** Live and staged steps: neither may lose its map or zone. */
function allSteps(state: AppState): Trail {
  return state.trailDraft ? [...state.trail, ...state.trailDraft] : state.trail;
}

function trailUsesMap(state: AppState, mapId: string): boolean {
  return allSteps(state).some((step) => step.mapId === mapId);
}

function zoneUsedBy(state: AppState, mapId: string, zoneId: string): string | null {
  const at = (p: { mapId: string | null; zoneId: string | null } | null) => p?.mapId === mapId && p.zoneId === zoneId;
  if (allSteps(state).some(at)) return "a trail step";
  if (state.notes.some((n) => n.places.some(at))) return "a note";
  if (state.characters.some((c) => at(c.address))) return "a character's address";
  return null;
}
