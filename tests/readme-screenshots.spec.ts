import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// The README's screenshots: a demo case built from invented content only (a
// drawn town, made-up people and clues; nothing from the game), photographed
// on the overlay and the control panel. Run with `npm run screenshots`; it's
// skipped in normal test runs. Writes docs/screenshots/.

const PORT = 7790;
const OUT = "docs/screenshots";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 (npm run screenshots)");

async function send(actions: unknown[]) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)));
  for (const action of actions) ws.send(JSON.stringify({ type: "action", action }));
  await new Promise((r) => setTimeout(r, 400));
  ws.close();
}

// An invented town: a river, streets and numbered blocks in four districts.
const COLS = 8;
const ROWS = 5;
const W = 2400;
const H = 1500;
const district = (col: number, row: number) => (row < 2 ? (col < 4 ? "NW" : "NE") : col < 4 ? "SW" : "SE");
const block = (col: number, row: number) => {
  const x0 = 140 + col * 270;
  const y0 = 120 + row * 240 + (row >= 2 ? 120 : 0); // the river runs between rows 1 and 2
  return [x0, y0, x0 + 210, y0 + 170] as const;
};

async function townImage(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(
    ({ COLS, ROWS, W, H }) => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d")!;
      g.fillStyle = "#eadfc4";
      g.fillRect(0, 0, W, H);
      // The river.
      g.strokeStyle = "#9fb4b8";
      g.lineWidth = 70;
      g.beginPath();
      g.moveTo(0, 640);
      g.bezierCurveTo(600, 560, 1300, 760, W, 600);
      g.stroke();
      // Blocks with house numbers.
      g.font = "italic 30px Georgia, serif";
      g.textAlign = "center";
      for (let col = 0; col < COLS; col++)
        for (let row = 0; row < ROWS; row++) {
          const x0 = 140 + col * 270;
          const y0 = 120 + row * 240 + (row >= 2 ? 120 : 0);
          g.fillStyle = "#d9c9a3";
          g.strokeStyle = "#7a6040";
          g.lineWidth = 3;
          g.fillRect(x0, y0, 210, 170);
          g.strokeRect(x0, y0, 210, 170);
          g.fillStyle = "#4a3820";
          g.fillText(String(col + row * COLS + 1), x0 + 105, y0 + 95);
        }
      // District names.
      g.font = "bold 44px Georgia, serif";
      g.fillStyle = "rgba(90, 60, 30, 0.35)";
      for (const [t, x, y] of [["NORTH WEST", 600, 90], ["NORTH EAST", 1700, 90], ["SOUTH WEST", 600, 1470], ["SOUTH EAST", 1700, 1470]] as const)
        g.fillText(t, x, y);
      return c.toDataURL("image/png").split(",")[1];
    },
    { COLS, ROWS, W, H },
  );
  return Buffer.from(b64, "base64");
}

test("README screenshots", async ({ browser, request }) => {
  mkdirSync(OUT, { recursive: true });
  const control = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const up = await request.post("/api/maps/images", { data: await townImage(control), headers: { "Content-Type": "image/png" } });
  const { file } = await up.json();
  const zones = [];
  for (let col = 0; col < COLS; col++)
    for (let row = 0; row < ROWS; row++) {
      const [x0, y0, x1, y1] = block(col, row);
      const n = col + row * COLS + 1;
      zones.push({
        id: `b${n}`,
        label: String(n),
        district: district(col, row),
        shape: "rect",
        points: [[x0 / W, y0 / H], [x1 / W, y0 / H], [x1 / W, y1 / H], [x0 / W, y1 / H]],
        anchor: [(x0 + x1) / 2 / W, (y0 + y1) / 2 / H],
      });
    }
  const at = "1887-10-03T10:00:00.000Z";
  const step = (id: string, zone: number, kind = "lead") => ({ type: "trail/add", step: { id, mapId: "town", zoneId: `b${zone}`, kind, at } });
  const character = (id: string, name: string, role: string, status: string, cameo: object) => ({
    type: "character/add",
    character: { id, name, role, status, cameo },
  });
  await send([
    { type: "map/import", map: { id: "town", name: "Thornbury", image: file, imageSize: [W, H], zones }, replace: true },
    { type: "case/update", patch: { title: "The Vanished Clockmaker", number: "7", box: "Demo case" } },
    { type: "overlay/setMapView", mode: "full" },
    step("s1", 3),
    step("s2", 12),
    step("s3", 22, "deadEnd"),
    step("s4", 30),
    step("s5", 37),
    character("c1", "Mrs. Hester Pyke", "Landlady", "witness", { head: 1, top: "bun", face: "none" }),
    character("c2", "Silas Crane", "Clockmaker", "victim", { head: 0, top: "tophat", face: "moustache" }),
    character("c3", "Inspector Dunmore", "Police", "ally", { head: 2, top: "helmet", face: "moustache" }),
    character("c4", "Jem Ollerton", "Apprentice", "suspect", { head: 3, top: "bowler", face: "beard" }),
    { type: "key/add", letter: "A", unlocked: true, stepId: "s2" },
    { type: "key/add", letter: "B", unlocked: true, stepId: "s4" },
    { type: "key/add", letter: "C" },
    { type: "key/add", letter: "D" },
    { type: "note/add", note: { id: "n1", text: "Workshop door was bolted from the inside", tag: "clue", pinned: true, stepIds: ["s2"] } },
    { type: "note/add", note: { id: "n2", text: "Who wound the clocks after Tuesday?", tag: "question", pinned: true } },
    { type: "note/add", note: { id: "n3", text: "Brass key stamped with an O, found by the river", tag: "clue", pinned: true, characterIds: ["c4"] } },
    { type: "note/add", note: { id: "n4", text: "Crane owed money to someone at the docks", tag: "theory", pinned: true, characterIds: ["c2"] } },
  ]);

  // The overlay, on a plain backdrop (it's transparent in OBS).
  const overlay = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await overlay.goto("/overlay?bg=paper&motion=off");
  await expect(overlay.locator(".trail .pin")).toHaveCount(5); // the dead end's pin is hollow, without a number
  await overlay.waitForTimeout(1500); // fonts and images settle
  await overlay.screenshot({ path: `${OUT}/overlay.jpg`, quality: 88 });

  // The control panel, with the trail.
  await control.goto("/control#trail");
  await expect(control.getByText("Connected")).toBeVisible();
  await control.waitForTimeout(1200);
  await control.screenshot({ path: `${OUT}/control-panel.png` });

  // The notes, expanded into the focus area.
  await send([{ type: "overlay/setFocus", focus: "notes" }]);
  await expect(overlay.locator(".notes h2")).toHaveText("Case notes");
  await overlay.waitForTimeout(1500);
  await overlay.screenshot({ path: `${OUT}/notes.jpg`, quality: 88 });
});
