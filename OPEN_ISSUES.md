# Open issues

Gaps between `DESIGN.md` and what's built, after the six build phases. We
address them one at a time; tick an item (and note the commit) when it's done.

## Not built

- [ ] **1. Evidence cards.** Clue notes as typed paper slips ("from 13 SW, step 4", linked portraits): a *Show card* button that puts one in the focus area, a card wall in the expanded notes view, and the evidence-slip icon. (DESIGN.md › Notes › Evidence cards; not assigned to a phase in the build plan.)
- [ ] **2. Clickable overlay preview in the panel.** A live mini overlay where clicking a face, pin, note or the title bar opens that item's editor. (DESIGN.md › Live editing › Edit from the preview.)
- [ ] **3. Named font themes.** Save and switch font setups by name, like layouts. (DESIGN.md › Typography › Live updates.)
- [ ] **4. Paper and ink-edge textures.** Shared SVG filters for aged-paper panels with an inked edge. (DESIGN.md › Icons & placeholder art; Overlay layout & visual design › Look.)
- [ ] **5. OBS hotkey registration** via a small WebSocket client script. (DESIGN.md › Control panel UX & hotkeys; the design defers this to "later".)

## Partly built

- [ ] **6. `#` place mentions don't match informant names** in notes (`#scotland` → Scotland Yard). Zone search on the map does.
- [ ] **7. A step's investigator can't be edited** in the trail editor (it's recorded automatically on each step).
- [ ] **8. Focus-area aspect lock** is a one-off "Match map shape" button, not a lock that follows the map.
- [ ] **9. Live font samples** show under the two master font menus only, not in every per-component menu.

## Decisions pending

- [ ] **10. Custom toolkit icons.** Upload PNG/SVG artwork per toolkit item and state (stored in a git-ignored `icons/` folder), or keep editing `web/lib/icons/ToolIcon.svelte`.
- [ ] **11. CLAUDE.md user-data list** doesn't mention `portraits/` and `papers/` (both git-ignored).
- [ ] **12. DESIGN.md open questions:** which box first; camera-on-table vs digital setup; Twitch chat hooks later.

Out of scope for v1 (per DESIGN.md): Twitch chat integration, viewer voting, cloud hosting.
