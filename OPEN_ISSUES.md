# Open issues

Gaps between `DESIGN.md` and what's built, after the six build phases. We
address them one at a time; tick an item (and note the commit) when it's done.

## Not built

- [x] **1. Evidence cards.** Clue notes as typed paper slips ("from 13 SW, step 4", linked portraits): a *Show card* button that puts one in the focus area, a card wall in the expanded notes view, and the evidence-slip icon. (DESIGN.md › Notes › Evidence cards; not assigned to a phase in the build plan.) Done: *Show card* on clue notes (Notes tab), card wall as a notes grouping, evidence-slip icon, *Evidence cards* font settings.
- [ ] **2. Clickable overlay preview in the panel.** A live mini overlay where clicking a face, pin, note or the title bar opens that item's editor. (DESIGN.md › Live editing › Edit from the preview.)
- [ ] **3. Named font themes.** Save and switch font setups by name, like layouts. (DESIGN.md › Typography › Live updates.)
- [x] **4. Paper and ink-edge textures.** Shared SVG filters for aged-paper panels with an inked edge. (DESIGN.md › Icons & placeholder art; Overlay layout & visual design › Look.) Done: grain and foxing tiles, inked-edge filter, *Paper texture* switch in the Overlay tab.
- [ ] **5. OBS hotkey registration** via a small WebSocket client script. (DESIGN.md › Control panel UX & hotkeys; the design defers this to "later".)

## Partly built

- [x] **6. `#` place mentions don't match informant names** in notes (`#scotland` → Scotland Yard). Zone search on the map does. Done: `#` matches informant names and shows them beside the address.
- [x] **7. A step's investigator can't be edited** in the trail editor (it's recorded automatically on each step). Done: investigator menu in the step editor; only players in the case are accepted.
- [ ] **8. Focus-area aspect lock** is a one-off "Match map shape" button, not a lock that follows the map.
- [ ] **9. Live font samples** show under the two master font menus only, not in every per-component menu.

## Decisions pending

- [x] **10. Custom toolkit icons.** Done: drop `map`, `newspaper`, `notes`, `directory` or `informants` (.png/.jpg/.webp/.svg) into the git-ignored `icons/` folder and the toolkit uses it, else the built-in drawing. Still open: an upload button in the panel, and separate folded/open artwork (one image per item for now; the lit state is a glow).
- [ ] **11. CLAUDE.md user-data list** doesn't mention `portraits/` and `papers/` (both git-ignored).
- [ ] **12. DESIGN.md open questions:** which box first; camera-on-table vs digital setup; Twitch chat hooks later.

Out of scope for v1 (per DESIGN.md): Twitch chat integration, viewer voting, cloud hosting.
