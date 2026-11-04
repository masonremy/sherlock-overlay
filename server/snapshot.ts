// PNG snapshot of the overlay for a post-stream recap: renders /overlay in a
// headless copy of the installed Edge or Chrome (playwright-core drives it; no
// browser is downloaded).

import { chromium, type Browser } from "playwright-core";

async function launch(): Promise<Browser> {
  const path = process.env.CHROME_PATH;
  if (path) return chromium.launch({ executablePath: path });
  let last: unknown;
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel });
    } catch (err) {
      last = err;
    }
  }
  throw new Error(`No Edge or Chrome found for snapshots (set CHROME_PATH). ${last instanceof Error ? last.message : ""}`);
}

/** Screenshot of the overlay at 1920×1080. "paper" puts a plain background behind it. */
export async function snapshotOverlay(baseUrl: string, background: "transparent" | "paper"): Promise<Buffer> {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${baseUrl}/overlay?bg=${background === "paper" ? "paper" : "none"}&motion=off`, { waitUntil: "networkidle" });
    await page.waitForSelector(".stage");
    await page.waitForTimeout(1200); // fonts, images and any settling animation
    return await page.screenshot({ omitBackground: background === "transparent", type: "png" });
  } finally {
    await browser.close();
  }
}
