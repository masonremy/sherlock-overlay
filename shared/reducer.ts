import { z } from "zod";
import type { Action } from "./actions";
import { Zone, type AppState, type MapDef } from "./schema";

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
  }
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

function trailUsesMap(state: AppState, mapId: string): boolean {
  return state.trail.some((step) => step.mapId === mapId);
}

function zoneUsedBy(state: AppState, mapId: string, zoneId: string): string | null {
  const at = (p: { mapId: string | null; zoneId: string | null } | null) => p?.mapId === mapId && p.zoneId === zoneId;
  if (state.trail.some(at)) return "a trail step";
  if (state.notes.some((n) => n.places.some(at))) return "a note";
  if (state.characters.some((c) => at(c.address))) return "a character's address";
  return null;
}
