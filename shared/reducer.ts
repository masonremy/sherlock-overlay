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
      const map: MapDef = { ...action.map, zones: [] };
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
