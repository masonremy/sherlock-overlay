# Consulting Detective Stream Overlay: user guide

A stream overlay for *Sherlock Holmes Consulting Detective*. Two pages run in your browser, served by a small program on your own computer:

- **Overlay** (`http://localhost:7777/overlay`): what viewers see. Add it to OBS as a Browser Source, 1920 × 1080. Its background is transparent.
- **Control panel** (`http://localhost:7777/control`): where you run the game. Open it in a browser, or add it to OBS as a custom dock.

Everything you do in the panel shows on the overlay at once. Every change can be undone, and it's all saved automatically.

## Getting started

1. Install **Node.js** version 22 or newer from <https://nodejs.org> (the LTS version is fine).
2. Unzip the folder anywhere.
3. Run the start script:
   - **Windows:** double-click `start.bat`.
   - **Mac or Linux:** run `./start.sh` in a terminal.

   The first run installs what it needs, which takes a minute or two. Later runs start in a few seconds. The control panel opens in your browser.
4. In OBS, add a **Browser Source** with the URL `http://localhost:7777/overlay`, width 1920, height 1080.
5. Leave the start script's window open while you play. Close it to stop the overlay.

Add `?bg=checker` to the overlay's address in a normal browser to see where it's transparent.

### Your game files

The box's PDFs (newspapers, directory, informants, map) live in the `artifacts/` folder. They're found automatically when the program starts. If you add or replace PDFs, restart the start script.

### Setting up a case

1. Open **Zones** (top of the panel), pick the **London** map and tick **Used in this case**.
2. Go back to **Play**. Open the **Case** tab and fill in the case's number, title and newspaper date.
3. In the **Paper** tab, press **Use** next to this case's paper.

**Map zones:** to record moves by clicking the map, the map needs a box (zone) drawn for each address. Draw them in **Zones**: the **Bulk** tool drops a box per click and counts the label up (1, 2, 3…). Set each box's **District** (WC, EC…) so "1 WC" and "1 EC" are told apart. Zones are saved with the map and shared by every case.

## Playing a case

### Recording moves (map and Trail tab)

- Click a zone on the map, or press `/` and type it ("14 wc"), then press **Record move** or `Enter`.
- Each step can be a lead, a free lead, a re-read or a dead end; only leads count towards the score.
- A step that isn't on the map (a telegram, an advert) can be recorded as an *off-map* step.
- **Edit trail** (Trail tab) lets you fix, insert, reorder or delete steps. Viewers keep seeing the old trail until you press **Apply**.

### Notes (quick-note box and Notes tab)

- Press `N` and type a note, then `Enter`.
- Start a note with `!` to pin it on stream, or with `?` to mark it as a question.
- Type `@` to mention a character, `#` to mention a place ("#22 WC") or an informant ("#scotland"). Mentions become links.
- Clue notes can be shown on stream as an **evidence card** (*Show card* in the Notes tab).

### Characters (Cast tab)

- Press `C` (or *Add* in the Cast tab) to add a character: name, role, status, address and a portrait (from the library, an upload, or a cameo silhouette).
- New characters get a short introduction on stream. Hide a character to keep them off the overlay.

### Letter keys (Keys tab)

- Add the case's letter keys, then unlock one with `Alt` + that letter. It's stamped with the latest step.

### The newspaper (Paper tab)

- **Use** sets this case's paper. The rules allow it plus earlier-dated papers (the shelf); later papers are greyed out and never shown.
- **Open on the overlay** (or `Ctrl` + `2`) unfolds it into the focus area. A dot on its toolkit icon shows until it has been opened once.
- The shelf buttons switch to an earlier paper.
- Drag a box over an article on the page preview to zoom the overlay onto it. **Whole page** zooms back out.
- Dates and titles in the list can be corrected by hand.

### Searching documents: newspapers, directory, informants (Documents tab)

- One search box covers the directory, the informants and the newspapers the rules allow: this case's paper and earlier ones. Later papers never appear.
- Click a result to zoom the preview onto it. Every match is highlighted, and the one you clicked is outlined.
- In the preview: scroll to move, `Ctrl` + scroll to zoom, drag to pan, ‹ › to turn pages. For the directory, **Jump to…** goes to a letter or a trade.
- A directory line with an address shows **Show on the map** when that address has a zone.
- **Show on stream** puts the document on the overlay. While it's on stream the overlay follows your preview live. Before that, only you can see the preview.

### The focus area and toolkit

The big area on the overlay shows one thing at a time: the map, the newspaper, the notes, the directory or the informants. The toolkit bar under it shows which one is open, and the buttons at the bottom of the panel switch between them (see the hotkeys below). Pressing the same one again puts back what was there before.

### End of the case (Case tab)

- Fill in the scoring and the verdict shows on stream.
- **Cases** lets you start a new case, switch case, export a case as JSON, or save a snapshot PNG of the overlay.
- Optional: list the players for a lead investigator who changes each turn, or turn on **Timesheet** for Queen's Park cases.

### Overlay settings and layout

- **Overlay** tab: hide the map, hide everything, reduced motion, paper texture, and which map the overlay follows.
- **Layout** tab: drag and resize every part of the overlay, save layouts by name and switch between them, and choose fonts.

## Hotkeys

Single keys only work when you're not typing in a text box.

| Key | What it does |
| --- | --- |
| `/` | Search zones on the map |
| `Enter` | Record the selected zone as a move |
| `Esc` | Step back: clear the insert point, then the selection, then put the map back in the focus area |
| `0` | Fit the map to the panel |
| `N` | Write a quick note |
| `C` | Add a character |
| `E` | Show or hide the notes on stream |
| `H` | Hide everything on the overlay (panic switch); again to show it |
| `1` to `9` | Switch to saved layout 1 to 9 |
| `Ctrl` + `1` | Map in the focus area |
| `Ctrl` + `2` | Newspaper |
| `Ctrl` + `3` | Notes |
| `Ctrl` + `4` | Directory |
| `Ctrl` + `5` | Informants |
| `Alt` + a letter | Unlock or lock that letter key |
| `Ctrl` + `Z` | Undo |
| `Ctrl` + `Shift` + `Z` | Redo |

In search lists: `↑` `↓` to choose, `Enter` (or `Tab` for mentions) to pick, `Esc` to close.

**Zone editor (Zones):**

| Key | What it does |
| --- | --- |
| `V` | Select tool: click a zone, drag it or its handles |
| `R` | Rectangle tool: drag to draw |
| `P` | Polygon tool: click points, `Enter` or click the first point to close |
| `B` | Bulk tool: click to drop a box; the label counts up |
| `Space` + drag | Pan |
| `Backspace` | Remove the last polygon point, or delete the selected zone |
| `Delete` | Delete the selected zone |
| `Esc` | Cancel the drawing, or clear the selection |
| `0` | Fit the map |

## Good to know

- **Undo** covers everything, and **History** (bottom of the panel) jumps back to any earlier point.
- Your data is kept in the folder: `cases/` (your games), `maps/`, `portraits/`, `fonts/`, `icons/`, `layouts.json` and `theme.json`. Back up the folder to keep it.
- **Custom toolkit icons:** put `map.png`, `newspaper.png`, `notes.png`, `directory.png` or `informants.png` in `icons/`.
- **Another port:** if 7777 is taken, set the `PORT` environment variable before running the start script (for example `set PORT=7800` on Windows), and use that port in the addresses.
- **Overlay address options:** `?only=focus,toolkit` shows only those parts (for one OBS source per part), `?layout=<name>` fixes a saved layout, and `?motion=off` turns off animation.
