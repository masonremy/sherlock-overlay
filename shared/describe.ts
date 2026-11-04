import type { Action } from "./actions";
import type { AppState, TrailStep } from "./schema";

/** A short human label for the history drawer, e.g. "Recorded step 5 → 14 WC". */
export function describeAction(action: Action, state: AppState): string {
  const mapName = (id: string) => state.maps[id]?.name || id;
  const zoneLabel = (mapId: string, zoneId: string) =>
    state.maps[mapId]?.zones.find((z) => z.id === zoneId)?.label ?? zoneId;
  const trail = state.trailDraft ?? state.trail;
  const draft = state.trailDraft ? " (draft)" : "";
  const stepNo = (stepId: string) => trail.findIndex((t) => t.id === stepId) + 1;
  const charName = (id: string) => state.characters.find((c) => c.id === id)?.name ?? id;
  const noteText = (id: string) => state.notes.find((n) => n.id === id)?.text ?? "";
  // Mention tokens read as names; long notes are cut short.
  const clip = (text: string) => {
    const plain = text
      .replace(/@\[([^\]]+)\]/g, (_m, id: string) => `@${charName(id)}`)
      .replace(/#\[([^/\]]+)\/([^\]]+)\]/g, (_m, m: string, z: string) => `#${zoneLabel(m, z)}`);
    return plain.length > 40 ? `${plain.slice(0, 39)}…` : plain;
  };
  const place = (s: Pick<TrailStep, "mapId" | "zoneId" | "customLabel">) =>
    s.mapId && s.zoneId ? zoneLabel(s.mapId, s.zoneId) : `“${s.customLabel}”`;

  switch (action.type) {
    case "case/setTitle":
      return `Case title → "${action.title}"`;
    case "debug/ping":
      return "Ping";
    case "case/addMap":
      return `Used map ${mapName(action.mapId)} in this case`;
    case "case/removeMap":
      return `Stopped using map ${mapName(action.mapId)}`;
    case "map/create":
      return `Created map ${action.map.name}`;
    case "map/import":
      return `Imported map ${action.map.name || action.map.id}`;
    case "map/rename":
      return `Renamed map ${mapName(action.mapId)} → ${action.name}`;
    case "map/setImage":
      return `Replaced image of ${mapName(action.mapId)}`;
    case "map/delete":
      return `Deleted map ${mapName(action.mapId)}`;
    case "zone/add":
      return `Added zone ${action.zone.label}`;
    case "zone/update":
      return `Edited zone ${zoneLabel(action.mapId, action.zoneId)}`;
    case "zone/delete":
      return `Deleted zone ${zoneLabel(action.mapId, action.zoneId)}`;
    case "trail/add": {
      const n = (action.index ?? trail.length) + 1;
      return `${action.index === undefined ? "Recorded" : "Inserted"} step ${n} → ${place(action.step)}${draft}`;
    }
    case "trail/update": {
      const step = trail.find((t) => t.id === action.stepId);
      const moved = "zoneId" in action.patch || "customLabel" in action.patch;
      const what = moved ? ` → ${place({ ...step!, ...action.patch })}` : "";
      return `Edited step ${stepNo(action.stepId)}${what}${draft}`;
    }
    case "trail/delete":
      return `Deleted step ${stepNo(action.stepId)}${draft}`;
    case "trail/move":
      return `Moved step ${stepNo(action.stepId)} to ${action.toIndex + 1}${draft}`;
    case "trail/beginEdit":
      return "Started editing the trail";
    case "trail/apply":
      return "Applied trail edits";
    case "trail/discard":
      return "Discarded trail edits";
    case "character/add":
      return `Added character ${action.character.name}${action.stepId ? ` at step ${stepNo(action.stepId)}` : ""}`;
    case "character/update":
      return `Edited character ${charName(action.characterId)}`;
    case "character/delete":
      return `Deleted character ${charName(action.characterId)}`;
    case "key/add":
      return `${action.unlocked ? "Unlocked" : "Added"} key ${action.letter}`;
    case "key/update":
      if (action.patch.unlocked === true) return `Unlocked key ${action.letter}`;
      if (action.patch.unlocked === false) return `Locked key ${action.letter}`;
      return `Edited key ${action.letter}`;
    case "key/delete":
      return `Deleted key ${action.letter}`;
    case "portrait/add":
      return "Added a portrait to the library";
    case "portrait/update":
      return "Retagged a library portrait";
    case "portrait/delete":
      return "Removed a library portrait";
    case "note/add":
      return `Added ${action.note.pinned ? "pinned " : ""}note “${clip(action.note.text)}”`;
    case "note/update": {
      const p = action.patch;
      const what =
        p.pinned === true ? "Pinned" : p.pinned === false ? "Unpinned" : p.hidden === true ? "Hid" : p.hidden === false ? "Showed" : "Edited";
      return `${what} note “${clip(noteText(action.noteId))}”`;
    }
    case "note/delete":
      return `Deleted note “${clip(noteText(action.noteId))}”`;
    case "note/move":
      return "Reordered notes";
    case "overlay/setFocus":
      return `Focus area → ${action.focus}`;
    case "overlay/returnFocus":
      return "Focus area → back";
    case "overlay/configure": {
      const p = action.patch;
      if (p.hideAll !== undefined) return p.hideAll ? "Hid everything on the overlay" : "Showed the overlay again";
      if (p.hideMap !== undefined) return p.hideMap ? "Hid the map" : "Showed the map";
      return "Changed overlay settings";
    }
    case "overlay/setMapView":
      return `Overlay map view: ${action.mode}`;
    case "overlay/setMap":
      return action.mapId ? `Overlay shows ${mapName(action.mapId)}` : "Overlay map follows the trail";
  }
}
