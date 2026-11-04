import { expect, test, type Page } from "@playwright/test";

// Both pages, end to end: set up a made-up grid map (no game content), record
// moves and a pinned note from the panel, and check the overlay shows them.

const PORT = 7790;

/** Sends actions straight to the server, like the panel does. */
async function send(actions: unknown[]) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)));
  for (const action of actions) ws.send(JSON.stringify({ type: "action", action }));
  await new Promise((r) => setTimeout(r, 300));
  ws.close();
}

/** A 2000×1400 grid of numbered blocks, drawn in the browser. */
async function gridImage(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 2000;
    c.height = 1400;
    const g = c.getContext("2d")!;
    g.fillStyle = "#e9dcbc";
    g.fillRect(0, 0, 2000, 1400);
    g.strokeStyle = "#7a6040";
    g.lineWidth = 3;
    g.font = "36px serif";
    g.fillStyle = "#3a2a18";
    for (let x = 0; x < 10; x++)
      for (let y = 0; y < 7; y++) {
        g.strokeRect(x * 200 + 10, y * 200 + 10, 180, 180);
        g.fillText(`${x + y * 10}`, x * 200 + 80, y * 200 + 115);
      }
    return c.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(b64, "base64");
}

test("record moves and a note in the panel; the overlay follows", async ({ browser, request }) => {
  const control = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const overlay = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // A synthetic map with 70 zones.
  const up = await request.post("/api/maps/images", { data: await gridImage(control), headers: { "Content-Type": "image/png" } });
  const { file } = await up.json();
  const zones = [];
  for (let x = 0; x < 10; x++)
    for (let y = 0; y < 7; y++) {
      const [x0, y0, x1, y1] = [(x * 200 + 10) / 2000, (y * 200 + 10) / 1400, (x * 200 + 190) / 2000, (y * 200 + 190) / 1400];
      zones.push({ id: `z${x + y * 10}`, label: `${x + y * 10} WC`, district: "WC", shape: "rect", points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], anchor: [(x0 + x1) / 2, (y0 + y1) / 2] });
    }
  await send([
    { type: "map/import", map: { id: "grid", name: "Grid", image: file, imageSize: [2000, 1400], zones }, replace: true },
    { type: "case/update", patch: { title: "The Smoke Test", number: "1", box: "Test Box" } },
    { type: "overlay/setMapView", mode: "full" },
  ]);

  await control.goto("/control");
  await overlay.goto("/overlay?bg=checker&motion=off");
  await expect(control.getByText("Connected")).toBeVisible();

  // Record two moves through zone search: Enter selects, Enter records.
  for (const q of ["14wc", "26wc"]) {
    await control.locator(".search input").fill(q);
    await control.locator(".search input").press("Enter");
    await control.locator(".search input").press("Enter");
  }
  // A pinned note from the quick-entry box.
  await control.locator(".quick input").fill("! Muddy boots, size 10");
  await control.locator(".quick input").press("Enter");

  await expect(overlay.locator("header")).toContainText("Case 1 · The Smoke Test");
  await expect(overlay.locator("header")).toContainText("Leads 2");
  await expect(overlay.locator(".trail .pin text")).toHaveText(["1", "2"]);
  await expect(overlay.locator(".strip")).toContainText("Muddy boots, size 10");

  // Expanding notes swaps the focus area; Esc brings the map back.
  await control.locator("body").click({ position: { x: 700, y: 5 } });
  await control.keyboard.press("e");
  await expect(overlay.locator(".notes h2")).toHaveText("Case notes");
  await expect(control.locator('footer .tool.on[title^="Notes"]')).toBeVisible(); // the panel has caught up
  await control.keyboard.press("Escape");
  await expect(overlay.locator(".mapbox")).toBeVisible();

  await overlay.waitForTimeout(800); // fonts and images settle
  await expect(overlay).toHaveScreenshot("overlay.png");
});
