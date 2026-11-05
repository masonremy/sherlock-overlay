# Consulting Detective Stream Overlay — Design

Nov 1, 2026 · @Mason

## Overview

A local web app with two views: a read-only **overlay** that OBS shows on stream, and a **control panel** the streamer drives off-camera. Both share one case state, synced live, saved to disk per case.

**Goals**

- Viewers can follow the investigation at a glance: where the streamer has been, who they've met, what they've unlocked.
- The streamer can log a lead in under 5 seconds without leaving the game.
- Map zones are defined once per map image and reused across every case.

**In scope:** case notes, a character roster with face icons, a letter-key unlock tracker, an ordered trail of visited locations on the stock map, a pop-out case newspaper, a zone editor, and a drag-and-resize layout editor.

**Not in scope (v1):** Twitch chat integration, viewer voting, cloud hosting, or shipping any game content. The streamer loads their own map image and portraits; nothing from the game ships with the app.

## Architecture

A small local server owns the state; the overlay and the control panel are thin clients over one WebSocket. OBS browser sources run in their own process, so browser-only tricks (BroadcastChannel, shared localStorage) can't bridge the two views. A server can.

&#91;embedded content: architecture · 3 processes, 1 store\]

**Pieces**

- **Server** (`localhost:7777`): serves both pages, holds the authoritative case state, applies actions, broadcasts snapshots, writes `cases/<id>/state.json` on every change (debounced 500 ms) and serves uploaded images from `cases/<id>/assets/`.
- **Overlay** (`/overlay`): an OBS Browser Source at 1920×1080 with a transparent background. Never takes input.
- **Control panel** (`/control`): added as an OBS *Custom Browser Dock*, so it lives inside OBS next to the scene list. Also works in a normal browser tab or on a tablet on the LAN.

**Sync model**

1. Panel sends an action: `{type: "trail/add", zoneId: "wc-14"}`.
2. Server validates it, applies it with a pure reducer, bumps `rev`, appends to an undo stack.
3. Server broadcasts `{rev, state}` to every client; the overlay re-renders and animates the diff.

Full snapshots are fine: one case's state is a few KB. A pure reducer shared between server and clients keeps undo/redo trivial and makes the logic testable without a browser.

**Visibility controls** live in state too: the streamer can hide a note, a character, or the whole map from the overlay (e.g. while reading a spoiler-sensitive paragraph) without deleting anything.

## Data model

Two files: a **map definition** reused across cases, and a **case state** per playthrough. Zone coordinates are stored normalised (0–1) so the map image can be swapped for a higher-res scan without redrawing zones.

```json
// maps/london.json — built once in the zone editor
{
  "id": "london",
  "image": "london.jpg",
  "imageSize": [4000, 2800],
  "zones": [
    {
      "id": "wc-14",
      "label": "14 WC",
      "district": "WC",
      "shape": "polygon",
      "points": [[0.412, 0.338], [0.431, 0.338], [0.431, 0.356], [0.412, 0.356]],
      "anchor": [0.421, 0.347]
    }
  ]
}
```

```json
// cases/<id>/state.json
{
  "rev": 42,
  "case": { "title": "Case 3", "mapIds": ["london"], "campaignId": null, "paperDate": "1889-03-14", "players": [], "timesheet": false, "startedAt": "2026-11-01T20:00:00Z" },
  "trail": [
    { "id": "t1", "mapId": "london", "zoneId": "wc-14", "kind": "lead", "customLabel": null, "note": "Met the landlady", "characterIds": ["c2"], "by": "p1", "clock": null, "at": "..." }
  ],
  "characters": [
    { "id": "c2", "name": "Mrs. Example", "role": "Landlady", "portrait": "assets/c2.png", "status": "witness", "address": null, "notes": "", "hidden": false }
  ],
  "keys": [
    { "letter": "A", "unlocked": true, "unlockedAtStep": "t1", "note": "" }
  ],
  "notes": [
    { "id": "n1", "text": "Muddy boots, size 10", "tag": "clue", "pinned": true, "hidden": false, "stepIds": ["t1"], "characterIds": ["c2"], "places": [{ "mapId": "london", "zoneId": "sw-13" }] }
  ],
  "newspaper": { "image": "assets/paper.png", "showing": "self", "zoom": null, "opened": false },
  "scoring": { "series1": null, "series2": null, "holmesLeads": null, "freeStepIds": [] },
  "overlay": { "layoutId": "full", "focus": "map", "focusPrev": "map", "mapView": "auto-frame", "notesScroll": 0, "notesAutoScroll": true }
}
```

```json
// layouts.json — global, edited in the Layout tab; rects in overlay pixels
{
  "full": {
    "header":    { "x": 0,   "y": 0,   "w": 1920, "h": 60,  "z": 1, "visible": true },
    "focus":     { "x": 820, "y": 60,  "w": 1100, "h": 780, "z": 1, "visible": true, "lockAspect": true },
    "cast":      { "x": 0,   "y": 60,  "w": 360,  "h": 780, "z": 1, "visible": true },
    "keys":      { "x": 0,   "y": 840, "w": 360,  "h": 220, "z": 1, "visible": true },
    "notes":     { "x": 820, "y": 840, "w": 1100, "h": 220, "z": 1, "visible": true },
    "toolkit":   { "x": 400, "y": 980, "w": 400,  "h": 70,  "z": 2, "visible": true, "items": ["map", "newspaper", "notes", "directory", "informants"] }
  }
}
```

- **Trail entries are ordered and can repeat a zone.** Revisits get a second number on the map, which is the interesting part for viewers.
- **`customLabel`** covers leads that aren't on the map (a telegram, a newspaper ad) so they still count as a step.
- **Character `status`** is a small enum (suspect, witness, ally, victim, cleared) that drives a coloured ring on the portrait.
- **Letter keys default to A–Z** in the schema, but the panel starts each case empty: letters are added as the game hands them out (Baker Street Irregulars).

## Game rules coverage

What the published rulebooks (Thames Murders, Jack the Ripper, Carlton House & Queen's Park, Baker Street Irregulars) ask players to track, and where the overlay handles it.

| Game element | How the game uses it | Overlay feature |
| --- | --- | --- |
| Leads followed | Each paragraph read is a lead; you note it and the total is compared to Holmes's at the end | Map trail, lead counter in header |
| Free leads, re-reads, dead ends | Re-reading a followed lead is free; some leads are declared free in the solution; an address with no paragraph costs nothing | Step **kind** on each trail entry; only `lead` counts |
| Scoring | Question points (two series), minus 5 per lead over Holmes's count, plus 5 per lead under; Holmes always scores 100 | End-of-case scoring screen and verdict card |
| Areas and addresses | Five areas (NW, WC, SW, EC, SE) with numbered blocks, e.g. 42 NW; some addresses (E, S, QP) are off-limits unless a case says otherwise | Zone `district`; zones can be marked not visitable |
| Lettered keys | Baker Street Irregulars: a lead can tell you to circle a letter; letters gate other leads, per case. Re-reading a gated lead once you hold its letter is free | Letter keys grid, unlock stamped to the step |
| Informants | A fixed list of recurring helpers with addresses (Scotland Yard, the medical examiner, Holmes himself, etc.) | Informant shortcuts in the panel |
| Directory | Alphabetical and by-profession address book | Out of scope; streamer uses the book, then records the move |
| Newspapers | The case's paper plus all earlier-dated papers in the same set may hold clues | Newspaper focus item with a shelf of earlier papers |
| Extra maps | Whitechapel map (Jack the Ripper cases 1–4), Carlton House floor plans (GF/FF/BF rooms), Queen's Park map | Multiple maps per case, switchable in the focus area |
| Timesheet | Queen's Park: 3 days, 9 a.m. to 10 p.m., 15 min per area crossed plus each lead's stated duration | Optional timesheet mode with a clock |
| Campaigns | Linked cases (Ripper 1–4; Irregulars 5–9 feed case 10) | Campaigns carry cast, notes and papers forward |
| Lead investigator | The book passes left each turn; current investigator has the final say | Optional player rotation, shown in header |

## Features

### Title bar

The Header component becomes a full-width title bar across the top of the overlay.

- **Left:** case number and title, typed by the streamer at case setup (e.g. *Case 3 · The Tin Soldier*), in the display serif, with the box name in small caps underneath.
- **Centre:** the case's in-game date, taken from its newspaper date (*14 March 1889*), and, in timesheet mode, the day and clock.
- **Right:** lead counter, current lead investigator (if players are set) and elapsed real time.
- **Behaviour:** the title can be edited at any time from the panel; it plays a short ink-in when a case starts. Like every component, its size and position are set in the layout editor.

### Focus area & toolkit

The overlay's largest component is a **focus area** that shows one thing at a time: the map, the newspaper, expanded notes, the directory or the informants. The **toolkit bar** holds an icon for each; selecting one brings its full version into the focus area.

- **Icons:** Map (folded map), Newspaper (folded paper), Notes (notebook), Directory (thumb-indexed book) and Informants (calling card); the last two appear when their PDFs are in `artifacts/`. The active one is lit; the others sit folded. A dot marks unseen newspaper pages or new notes. Icons shrink to fit the toolkit box, and labels drop out when there's no room.
- **Switching:** panel toolkit buttons or `Ctrl+1` to `Ctrl+5` (map, newspaper, notes, directory, informants). The outgoing item folds down into its icon and the incoming one unfolds out of its icon (\~500 ms).
- **Default and return:** the map is the default. Dismissing the newspaper or contracting notes returns the focus area to whatever was there before, usually the map.
- **Recording still works off-focus:** the streamer can record a move while the newspaper or notes are in focus; the map shows the new pin when it comes back.
- **Placement:** the focus area is a normal layout component, so its position, size and layer are set in the layout editor. It can be sized to overlap other components when the streamer wants a big view.

### Map trail

The centrepiece: the stock map with numbered pins joined by a path, in visit order.

**Looking is separate from recording.** The panel map is in browse mode by default; nothing is written until the streamer presses an explicit button.

- **Navigate:** scroll-wheel or pinch to zoom (1×–8×), drag to pan, double-click to zoom in on a spot, `0` resets to fit. A small minimap inset shows the current viewport on the full map.
- **Select:** clicking a zone only *selects* it: outline highlight plus a label card ("14 WC"). Zone search (`/`) also selects and pans to it. `Esc` clears.
- **Record:** a large, always-visible **Record move → 14 WC** button at the bottom of the map commits the selection as the next step (also `Enter`). Disabled and greyed when nothing is selected. A second button, **Record off-map lead**, opens a one-line label prompt.
- **Confirm feedback:** after recording, the button flashes the new step number and an **Undo** chip appears for 5 s.
- **Overlay viewport:** the overlay map does not follow private browsing. It has three modes set in the Overlay tab: *full map*, *auto-frame last 3 steps*, or *mirror panel* (sends the panel's current zoom/pan live, for when the streamer wants to show viewers a spot).

On the overlay:

- Each step renders a numbered pin at the zone's `anchor`; consecutive pins are joined by a curved line that draws itself in (\~600 ms).
- The latest step pulses; older steps fade slightly so the current position reads first.
- Revisits stack numbers on one pin ("3 · 7") rather than overlapping.
- Off-map leads appear in a small "Elsewhere" strip under the map, numbered in sequence.
- Panel trail list: drag to reorder, click to edit note or linked characters, delete, undo (`Ctrl+Z`).

### Editing the trail

Mistakes are fixed in place. Nothing about a wrong step ever requires starting a new case or reloading the overlay.

- **Edit mode:** an **Edit trail** toggle in the Trail tab. The list gains handles and per-step controls, and the map's Record button turns into **Replace step 4 → 32 SE** while a step is selected.
- **Per step:** change its zone (pick on the map or search), change its kind (lead, free, re-read, dead end), edit its note, linked characters, investigator and time, or delete it.
- **Insert:** *Insert before* / *Insert after* on any step, for a lead that was read but never recorded.
- **Reorder:** drag a step to a new position.
- **Stable references:** letter keys, notes and characters link to step **ids**, not numbers, so renumbering never breaks a link. If a deleted step had a key unlocked on it, the key stays unlocked and is re-stamped to the previous step, with a warning.
- **What viewers see:** edits are staged while edit mode is on, and the overlay keeps showing the last good trail. **Apply** pushes them in one change, with a quick re-number animation; **Discard** throws them away. A *live edit* switch skips staging.
- **History:** every action, including each applied edit, is in an undo stack, and a **History** drawer lists them with timestamps so the streamer can roll back to any earlier point. The server also keeps a rolling backup (`state.<n>.json`, last 20) so even a corrupted file is recoverable.

### Leads & scoring

- **Step kinds:** `lead` (counts), `free` (named free in the solution), `reread` (re-reading a followed lead, including one newly unlocked by a letter), `deadEnd` (an address with no paragraph this case). Only `lead` adds to the count. Re-reads and dead ends render as hollow pins with no number.
- **Header counter:** "Leads 7". Holmes's count stays hidden until the streamer enters it, to avoid spoilers.
- **Scoring screen** (panel, end of case): enter points for question series 1 and 2, enter Holmes's lead count, tick which trail steps the solution declares free. The panel computes the score: points − 5 × (leads − Holmes's leads), which also adds 5 per lead under.
- **Verdict card:** a focus-area item that reveals the final score against Holmes's 100, the lead comparison, and the trail; for a post-stream recap or screenshot.

### Zone editor

A panel mode for building `maps/<id>.json` once per map image.

- **Import:** the map is a single image: a screenshot (PNG, JPG, WebP) or a one-page PDF. PDFs are rasterised on upload at high resolution (long edge up to \~8000 px) so text stays crisp when zoomed; a multi-page PDF prompts for which page to use.
- **Several maps:** a case can use more than one map (London, Whitechapel, each Carlton House floor, Queen's Park). Each is its own map definition; the focus area's map item gets a small map switcher, and every trail step records which map it was on.
- Draw rectangles (drag) or polygons (click points, Enter to close). Set label, district and anchor (defaults to centroid; drag to move). Zones can be marked **not visitable** (e.g. E, S, QP addresses) so they show but can't be recorded.
- Bulk mode: type a label, click a spot, a default-sized rectangle is created, label auto-increments. Fast for numbered blocks.
- Import/export JSON so a map definition can be shared with other streamers who own the game. The image itself is never bundled.

### Characters

- **Met someone:** a **+ Character** button sits next to Record move (also `C`). It opens a compact form: name (required), role, status, portrait, address (optional). Saving links the character to the current step automatically, so the overlay shows their face at that pin.
- **Portrait picker:** in the form, a grid offers three sources: the **portrait library**, a **cameo** (with Shuffle), or **upload / paste / drag-drop**. Uploads are cropped to a square and downscaled to 256 px. The address field uses the same place picker as notes (type \`32 SE\` or pick on the map). Once set, typing the character's name in zone search or \`#\` jumps to their address, and the cast card shows it in small type.
- **Portrait library:** a pool of unassigned portraits the streamer prepares before the stream (e.g. a batch from an image generator), tagged loosely (*older man, maid, constable*). It's global, so leftovers carry over to the next case; a used portrait is marked so it isn't reused by accident in the same case.
- **Later changes:** portrait, status, role and notes stay editable from the Cast tab; swapping a portrait mid-case cross-fades on the overlay.
- **Meeting again:** when a character has an address, recording a step there offers a one-tap "also met: Mrs. Example?" chip to link them.
- **Overlay:** the cast rail lists portraits in order of first appearance with status rings and names. A new character arrives with a short **introduction**: the portrait slides in large over the focus area for \~2 s with name and role, then settles into the rail. The streamer can skip or replay it.

### Letter keys

- In the Baker Street Irregulars set, a lead can tell you to circle a letter; letters are per case and gate access to other leads. The grid models exactly that: letters start locked and are unlocked by a step.
- The panel shows only letters the streamer adds (type a letter to add it locked, or unlock straight away), so no case's letters are spoiled in advance. Sets without letters hide the panel.
- Unlocking stamps the current trail step; the overlay shows "from step 5" under the tile, with a short flip-and-gold flourish.
- Re-reading a gated lead after getting its letter is free, so recording that re-read defaults to kind `reread`.

### Notes

Notes have two states, switched by an **Expand / Contract** button in the panel's Notes tab (also `E`).

**Compact (always visible).** A small notes strip stays in the bottom section of the overlay in every focus state.

- Read-only on the overlay; shows pinned notes, newest first, in small type.
- Scrollable: when notes overflow, the strip scrolls. The streamer scrolls it from a mirrored preview in the panel (wheel or drag), and an optional slow auto-scroll cycles through when idle.
- A fade at the top and bottom edges plus a thin scroll indicator show there's more.

**Expanded (in the focus area).** Expanding moves the full notes view into the focus area; Contract folds it back to the notebook icon and restores the previous focus.

- Larger type, more lines, grouped by tag (clue, question, theory) or by trail step.
- The panel switches to a roomy editor at the same time: multi-line text, drag to reorder, pin/unpin, tag and link controls, all inline. Edits show live in the focus area.
- The compact strip stays visible below and keeps updating.

**Entry and privacy** (both states):

- Quick-entry box always focused at the top of the panel: type, Enter, done. Prefix shortcuts: `!` pins, `?` tags as a question.
- Pinned notes appear on the overlay; unpinned ones are private scratch. This is the main spoiler control.

**Linking characters and places.** Links are always optional: a plain note with no links is the normal case, and nothing ever asks for one. When wanted, a note can link any number of characters and places, including places not yet visited.

- **While typing:** `@` opens a character autocomplete (`@lan` → *Mrs. Example, Landlady*); `#` opens a place autocomplete that matches zone labels and informant names (`#13sw`, `#scotland` → *13 SW · Scotland Yard*). Pick with Enter; the link becomes a chip in the text. Several of each are fine. An unknown `@name` offers *Create character* on the spot.
- **After the fact:** each note has a link bar with **+ Character** and **+ Place** pickers (place picker = search box plus *pick on map*), and chips with × to unlink.
- **Suggestions only:** nothing is linked automatically. A note written right after recording a step shows a dismissible "Link to step 4?" suggestion chip; ignoring it leaves the note unlinked. A setting can turn the suggestion off.
- **Using the links:** clicking a character or place in the panel filters notes to it. On the overlay, linked notes show small portrait and place chips; the map can mark places that have notes but no visit yet with a faint dashed ring ("leads to follow"), toggleable for spoiler-free streams.

**Evidence cards.** Notes tagged `clue` can be shown as styled evidence cards: a paper slip with a typed-label look, the step it came from ("from 13 SW, step 4") and any linked character portraits. The panel has a **Show card** button that puts one card in the focus area for a moment of emphasis, and the expanded notes view can lay clues out as a card wall. The text on every card is the streamer's own summary; the app never ships or fetches case text.

### Documents: newspapers, directory, informants

The box's PDFs (from the streamer's own copy, never bundled) go in `artifacts/`, in any folder layout. At startup the server finds them, recognises each by name (`Journal`/`newspaper`, `Annuaire`/`directory`, `informateur`/`informant`) and indexes their text layer with pdf.js: lines with page positions, cached in `artifacts/.index/`. The pages themselves are drawn by pdf.js in the browser, so text stays sharp at any zoom.

- **Newspapers:** the paper library follows the newspaper PDFs: one entry per PDF, dated from its masthead. Dates and titles the streamer edits are kept; entries whose PDF is gone drop out. The case picks its own paper; the rules allow it plus earlier-dated papers (the shelf). Later papers are never shown or searched.
- **Directory:** the alphabetical part and the list by trade. Big letters and trade headings become a "Jump to…" list (A–Z, then trades), each landing on its heading.
- **Informants:** the list of informants and their addresses.
- **Documents tab (panel):** one search across the shelf, the directory and the informants (or just the open document). Results are grouped by document with the matching line; choosing one zooms the preview onto it, with every match highlighted and the chosen one marked. A directory line ending in an address ("22 WC") offers *Show on the map* when that address is zoned. The preview scrolls (wheel), zooms (Ctrl+wheel) and pans (drag); pages turn with ‹ ›.
- **On stream:** *Show on stream*, the toolkit, or `Ctrl+2`/`Ctrl+4`/`Ctrl+5`. The document unfolds into the focus area with a caption (title, search, page). While it's on stream the overlay follows the preview live (page, visible area, highlights); before that the preview is private. The view is a transient message like mirror mode: not in undo history, forgotten on restart (the overlay then shows page 1).
- **Dismiss:** the same button or hotkey again. The focus area returns to what was there before.
- **Cue:** a small dot on the newspaper icon until the paper has been opened once this case.

### Informants, timesheet & campaigns

- **Informant shortcuts:** a panel list of the recurring informants with their addresses. One tap selects that address on the map, ready to record. The streamer fills the list per box (it differs slightly between sets), and it's saved with the map definition.
- **Lead investigator (optional):** list the players at the table; each recorded step stores whose turn it was, and the header shows the current investigator. Turns advance automatically on record.
- **Timesheet mode (optional, per case):** for Queen's Park-style cases. The header shows *Day 1 · 10:15 a.m.*; recording a step adds travel time (15 min within or to an adjacent area, plus 15 for each area crossed, from an adjacency table in the map definition) and asks for the lead's stated duration. Dead ends cost 5 minutes. The day rolls over at 10 p.m., and the newspaper shelf unlocks the next day's paper.
- **Campaigns:** cases can belong to a campaign. Starting the next case carries the cast, pinned notes and newspaper library forward, with an empty trail and keys.

## Overlay layout & visual design

The overlay is one 1920×1080 page whose components the streamer positions, sizes and hides freely, so the same source works for a "full board" scene and a "camera + map" scene.

&#91;embedded content: full preset · 1920 x 1080 overlay\]

| Panel | Default position | Size (px) | Content |
| --- | --- | --- | --- |
| Focus area | right | 1100 × 780 | Map (default), newspaper, expanded notes, directory or informants; map shows pins, path, "Elsewhere" strip |
| Cast | left column | 360 × 780 | Portrait cards, status rings |
| Keys | bottom left | 360 × 220 | Letter tile grid |
| Notes | bottom right | 1100 × 220 | Compact notes: pinned, scrollable, read-only |
| Header | top | 1920 × 60 | Case title, step count, elapsed time |

The sizes above are only the starting layout; every component is placed and sized freely in the layout editor.

### Layout editor

A **Layout** tab in the control panel shows the 1920×1080 overlay scaled down, with every component as a box the streamer drags and resizes.

- **Components:** Header, Focus area, Cast, Keys, compact Notes strip, Toolkit bar.
- **Move and resize:** drag the body to move, corner and edge handles to resize. Snaps to an 8 px grid and to other boxes' edges; hold `Alt` to turn snapping off. Arrow keys nudge 1 px (8 with `Shift`).
- **Exact values:** an inspector shows x, y, w, h in overlay pixels for the selected box, plus visible on/off, opacity and a lock.
- **Aspect:** the Focus area can lock to the map image's aspect ratio; the newspaper and expanded notes fit inside it.
- **Layering:** a z-order list (bring forward / send back). When the Focus area is sized to overlap other components, raise it to the top; overlapped boxes show hatched in the editor.
- **Responsive components:** each component adapts to its box: the cast rail goes vertical or horizontal by aspect ratio, the key grid reflows its columns, the notes strip shows as many notes as fit.
- **Edit safely:** changes preview in the panel and go live only on **Apply** (or toggle *live edit*). A *show guides on overlay* switch outlines every box on stream, for setup before going live.
- **Saved layouts:** name and save layouts (e.g. *full*, *map-focus*, *corner*). They're global, not per case. Switch with `1`–`9` or pin one per OBS scene with `?layout=corner`.

**Look:** Victorian case-file. Aged-paper panels with soft edge shadows, a serif display face for headings and a clean sans for small text (defaults below). Pins are red wax-seal circles with white numerals; the path is a dashed ink line. Keep contrast high: chat will watch this compressed.

### Typography

**Defaults.** Two fonts, both open-licensed and bundled with the app (served locally, so there's no network dependency and no flash of fallback text on stream):

| Role | Default font | Used for |
| --- | --- | --- |
| Display | IM Fell English | Title bar, panel headings, character names, evidence-card titles, pin numerals |
| Body | Source Sans 3 | Notes, labels, counters, anything small: stays legible at 720p after compression |

**Font settings** live in a **Fonts** section of the Layout tab, in three levels. Each level inherits from the one above unless overridden.

1. **Master:** one display font and one body font. Changing these restyles everything that isn't overridden.
2. **Per component:** Title bar, Focus area (map labels, newspaper captions, expanded notes), Cast, Keys, Notes strip, Toolkit and Evidence cards each have *Display* and *Body* dropdowns set to **Inherit** by default, plus a size scale (50–200 %), weight and letter-spacing.
3. **Reset:** a ↺ next to any override returns it to Inherit; *Reset all* returns to the defaults.

**Font sources**

- A curated bundled set that suits the theme (e.g. IM Fell English, Playfair Display, Cormorant Garamond, Libre Baskerville, Special Elite for a typewriter look, Source Sans 3, Lato).
- **Upload your own:** drop a TTF, OTF or WOFF2 file; it's stored in `fonts/` and appears in every dropdown.
- **Google Fonts by name** (optional, needs internet): type a family name; the server downloads and caches it locally, so it becomes a bundled font from then on.

**Live updates, no restart**

- Font settings are part of the shared state, saved globally in `theme.json`, and can be saved as named themes like layouts.
- On change, the overlay loads the new font with the browser's FontFace API, waits until it's ready, then swaps the CSS variables (`--font-display`, `--font-body`, per-component overrides) in one frame: no blank text, no reload, no OBS source refresh.
- The panel shows a live sample line in each dropdown, and changes follow the layout editor's Apply / live-edit switch so experiments don't hit the stream by accident.

**Motion:** every state change animates once (pin drop, path draw, card slide, tile flip), 300–600 ms, no idle looping except the current-step pulse. Respect a `reducedMotion` flag.

### Icons & placeholder art

All UI art is hand-built SVG, generated in code during implementation; only character portraits come from outside (the streamer's uploads, e.g. from an image generator).

**Icon set** (one consistent style: ink line, 2 px stroke at 48 px, sepia fill, works at 24–96 px)

| Icon | Used in | States |
| --- | --- | --- |
| Folded map | Toolkit | folded / open (lit) |
| Folded newspaper | Toolkit | folded / open, unread dot |
| Notebook | Toolkit | closed / open, new-note dot |
| Thumb-indexed book | Toolkit (directory) | closed / open |
| Calling card with bust | Toolkit (informants) | folded / open |
| Wax-seal pin | Map trail | numbered, current (pulse), hollow (re-read / dead end) |
| Letter tile | Letter keys | locked (padlock) / unlocked (gold edge) |
| Evidence slip | Evidence cards | — |
| Tag marks | Notes | clue, question, theory |
| Status rings | Cast | suspect, witness, ally, victim, cleared |

- Icons live as Svelte components that take `size` and `state` props and read colours from the theme tokens, so a palette change restyles everything.
- Shared textures (paper grain, ink edge) are SVG filters defined once and referenced by id.

**Cameo silhouettes** (portrait placeholders)

- A Victorian cameo: an oval frame with a dark profile silhouette on a cream ground.
- Built from parts: 3–4 head shapes, a set of hats and hairstyles (top hat, bowler, bonnet, police helmet, bun, bare), optional moustache or beard.
- The panel shows the parts as pickers when adding a character; a **Shuffle** button picks a random combination. The frame takes the character's status colour.
- A real portrait upload replaces the cameo; removing the upload brings the cameo back. Cameos export as PNG for use elsewhere.

### Working alongside other overlays

This overlay is one layer among many. Donation alerts, follower goals, chat boxes and the like are separate OBS sources from other tools; OBS stacks sources in list order, so the streamer adds them above or below ours. Nothing here integrates with them, but the overlay is built not to get in their way:

- **Transparent by default:** the page background is always transparent; only drawn components cover anything. No full-screen dimming, not even when the newspaper is open.
- **Split into layers:** the overlay URL takes `?only=` and `?except=` component lists (e.g. `/overlay?only=title,cast` and `/overlay?only=focus`). Added as separate OBS sources, these let another overlay sit *between* our layers, such as an alert box above the map but below the title bar. All layers share the same state and stay in sync.
- **Reserved areas:** the layout editor can draw named, empty **reserved** boxes (e.g. *alerts, top-right*). They render nothing on stream; they only show as hatched guides in the editor and snap targets, so our components are kept clear of where other overlays appear.
- **Quiet:** no sound unless turned on, no idle animation beyond the current-step pulse, and rendering pauses when OBS hides the source, so it doesn't compete for GPU with other browser sources.

## Control panel UX & hotkeys

The panel is built for a narrow OBS dock (\~420 px wide) first, and expands to a two-column layout in a full browser tab.

**Dock layout, top to bottom**

1. Quick-note box (always focused after any other action)
2. Map: zoom and pan freely, click to select a zone, then the big Record move button commits it; zone search box above it ("14 WC" → highlights and Enter adds)
3. Tabs: Trail · Cast · Keys · Notes · Paper · Layout
4. Footer: undo/redo, "hide everything" panic toggle, connection dot

**Hotkeys** (panel focused; single-letter keys fire only when no text field has focus; also registerable as OBS hotkeys via a small WebSocket client script later)

| Key | Action |
| --- | --- |
| `/` | Focus zone search |
| `N` | Focus quick note |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `1`–`3` | Switch overlay layout preset |
| `H` | Toggle hide-all on overlay |
| `A`–`Z` with `Alt` | Toggle that letter key |

Also: `Enter` records the selected zone, `0` resets the map zoom, `Ctrl+1` to `Ctrl+5` put the map, newspaper, notes, directory or informants in the focus area, `E` expands or contracts notes, `Esc` returns the focus area to the previous item or clears the map selection.

### Live editing

**Rule: anything set live can be edited live, in two clicks or fewer, without leaving the case.** Every edit is an ordinary action, so it syncs instantly, animates gently on the overlay and can be undone.

- **Click to edit:** every item in the panel opens its editor on click; text fields edit inline (Enter saves, Esc cancels). No separate settings page.
- **Edit from the preview:** the panel's mini overlay preview is clickable. Click a face in the cast rail, a pin, a note or the title bar to jump straight to that item's editor.
- **Typos never ripple:** items link by id, so renaming a character updates every note `@mention`, step and card that shows them.
- **Gentle on stream:** a text fix cross-fades in place; it doesn't replay the item's entrance animation.

| Item | Editable live |
| --- | --- |
| Case title, number, date | Text, from the title bar or Case tab |
| Characters | Name, role, status, address, notes, portrait (library, cameo, upload), linked steps; delete |
| Trail steps | Zone, kind, note, characters, investigator, time; insert, reorder, delete (edit mode) |
| Letter keys | Add, rename, lock/unlock, re-stamp to another step; delete |
| Notes and evidence cards | Text, tag, pinned, linked steps and characters; delete |
| Newspaper and maps | Replace the image (zones are kept); re-crop; add or remove earlier papers |
| Zones | Label, shape, anchor, visitable flag, from the zone editor mid-case |
| Players, timesheet, scoring | All fields, any time |
| Layout | Any component, through the layout editor |

**Case management:** new case, duplicate (keeps cast, clears trail), export as a single JSON or a PNG snapshot of the overlay for a post-stream recap.

## Tech stack & project structure

TypeScript end to end, one repo, one `npm run dev`.

| Layer | Choice | Why |
| --- | --- | --- |
| Server | Node + Fastify + `ws` | Static files, uploads, one WebSocket; nothing heavier needed |
| Client | Vite + Svelte (or Preact) | Small bundles, easy transitions for overlay animation |
| Map rendering | SVG over an `<img>`, one `viewBox` in image pixels | Zones, pins and paths scale with the image; easy hit-testing |
| Shared logic | `shared/` package: types, reducer, actions | Same reducer on server and in tests |
| Validation | Zod schemas for state and actions | Rejects bad actions; migrates old state files |
| Images | `sharp` on upload | Square crop + 256 px portraits |
| Tests | Vitest for reducer, Playwright smoke test for both pages | Reducer is the risky part |

```text
sherlock-overlay/
  shared/        types.ts, actions.ts, reducer.ts, schema.ts
  server/        index.ts, store.ts (load/save/undo), uploads.ts
  web/
    overlay/     Overlay.svelte, MapPanel, CastRail, KeyGrid, NotesStrip
    control/     Control.svelte, MiniMap, TrailList, CastEditor, ZoneEditor
    lib/         socket.ts, mapMath.ts (normalised ↔ pixel, path curves)
  maps/          london.json, london.jpg   (user-supplied, git-ignored)
  cases/         <id>/state.json, assets/   (git-ignored)
```

Svelte vs Preact is a taste call; Svelte's built-in `transition:` and `animate:` make the overlay motion nearly free.

## Testing without going live

OBS is free and runs on Linux (`flatpak install flathub com.obsproject.Studio` or your distro's package). Nothing here needs a Twitch account: OBS only sends video anywhere when you press **Start Streaming**, and its preview shows exactly what viewers would see.

1. **Browser first.** Run the server and open `localhost:7777/control` and `localhost:7777/overlay` side by side in a normal browser. Record a move and watch the overlay react. Add `?bg=checker` to the overlay URL to draw a checkerboard so the transparent areas are visible.
2. **Add the overlay to OBS.** In OBS's *Sources* panel, press **+** → **Browser**, set the URL to `http://localhost:7777/overlay`, width 1920, height 1080. It appears in the preview canvas over whatever is behind it.
3. **Add something behind it.** Add a **Video Capture Device** source (your webcam) or an **Image** source (a photo of your table) and drag it below the overlay in the list, so you can judge readability.
4. **Add the control panel as a dock.** *Docks* menu → **Custom Browser Docks**, name it, URL `http://localhost:7777/control`. It opens as a panel inside the OBS window.
5. **Rehearse.** Play through a few steps of a case using only the dock. To see the result as a viewer would, press **Start Recording**; OBS writes a video file you can watch back. This also shows how text survives compression.
6. **Optional extras.** **Studio Mode** shows a preview and a program view side by side. A second scene with a different `?layout=` parameter lets you test switching layouts.

**Automated checks** (part of phase 6): Vitest runs the reducer tests; a Playwright test opens both pages headlessly, performs actions in the control panel, and screenshots the overlay at 1920×1080 to compare against saved images.

## Build plan

Six phases, each ending in something you can see in OBS. Export this doc as Markdown into the repo as `DESIGN.md` and point `CLAUDE.md` at it, then hand Claude Code one phase at a time.

1. **Skeleton & sync.** Repo scaffold, shared types and reducer, server with WebSocket and JSON persistence, overlay and panel that both display `rev`. *Done when:* clicking a button in the panel bumps a counter on the OBS source, and it survives a server restart.
2. **Zone editor.** Import a map image or one-page PDF, support several maps per case, draw/edit rect and polygon zones, bulk mode, save `maps/<id>.json`. *Done when:* you've zoned your real map.
3. **Map trail.** Panel map with zoom/pan, select-then-Record move button, zone search, step kinds and lead counter, trail edit mode (replace, insert, delete, reorder, staged Apply) with history and backups; overlay pins, path draw-in, revisit stacking, "Elsewhere" strip.
4. **Characters & keys.** Portrait upload/paste with crop, cameo silhouette builder, status rings, cast rail; letter-key grid with unlock flourish and step stamp.
5. **Focus, notes & visibility.** Focus area with toolkit switching and the SVG icon set; quick-entry with prefix shortcuts, compact scrolling strip, Expand/Contract into the focus area with the roomy editor, tags, pin-to-overlay, hide-all toggle, step-linked filtering.
6. **Layout, newspaper & polish.** Layout editor (drag/resize, inspector, saved layouts, URL param), newspaper in the focus area, hotkeys, case duplicate/export, PNG recap snapshot, scoring screen and verdict card, informant shortcuts, optional timesheet mode and campaigns, reduced-motion flag, Playwright smoke test.

**Prompt to start each phase:** "Read DESIGN.md. Implement phase N only. Write reducer tests first for any new actions. Stop and show me when the *Done when* check passes."

## Open questions

- [ ] Which box will you stream first? That decides which extras (letters, extra maps, timesheet, campaigns) to build early.
- [ ] Is the stream camera-on-table (overlay beside a camera feed) or a digital/scanned setup (overlay as the main view)? This sets the default layout.
- [ ] Should viewers ever see unpinned notes, or are notes strictly streamer-private unless pinned?
- [ ] One map for all cases, or do some cases need a different or supplementary map?
- [ ] Do you want Twitch chat hooks later (e.g. `!trail` posts the step list)? If so, reserve an action log in phase 1.
- [ ] Svelte or Preact for the client?

Phase 1 doesn't depend on any of these; answer them before phases 3–5.
