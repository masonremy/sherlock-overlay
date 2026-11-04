import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listFonts, parseGoogleCss, saveUploadedFont, sniffFont } from "./fonts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sherlock-fonts-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const ttf = Buffer.from([0x00, 0x01, 0x00, 0x00, 1, 2, 3, 4]);
const woff2 = Buffer.concat([Buffer.from("wOF2"), Buffer.from([1, 2, 3])]);

describe("sniffFont", () => {
  it("recognises TTF, OTF, WOFF and WOFF2 by their bytes", () => {
    expect(sniffFont(ttf)).toBe("ttf");
    expect(sniffFont(Buffer.from("OTTO1234"))).toBe("otf");
    expect(sniffFont(Buffer.from("wOFF1234"))).toBe("woff");
    expect(sniffFont(woff2)).toBe("woff2");
    expect(sniffFont(Buffer.from("<html>"))).toBeNull();
  });
});

describe("uploaded fonts", () => {
  it("stores the file and lists the family", async () => {
    await saveUploadedFont(dir, ttf, "My Hand");
    await saveUploadedFont(dir, woff2, "My Hand");
    const fonts = await listFonts(dir);
    expect(fonts).toEqual([{ family: "My Hand", source: "upload", files: [expect.objectContaining({ format: "truetype" }), expect.objectContaining({ format: "woff2" })] }]);
    expect((await readdir(dir)).filter((f) => f !== "fonts.json")).toHaveLength(2);
  });

  it("rejects non-fonts and unsafe family names", async () => {
    await expect(saveUploadedFont(dir, Buffer.from("nope"), "X")).rejects.toThrow();
    await expect(saveUploadedFont(dir, ttf, "<script>")).rejects.toThrow();
  });
});

describe("parseGoogleCss", () => {
  it("keeps the latin faces with their weight and style", () => {
    const css = `/* cyrillic */
@font-face { font-family: 'Lora'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/a.woff2) format('woff2'); }
/* latin */
@font-face { font-family: 'Lora'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/b.woff2) format('woff2'); }
/* latin */
@font-face { font-family: 'Lora'; font-style: italic; font-weight: 700; src: url(https://fonts.gstatic.com/c.woff2) format('woff2'); }`;
    expect(parseGoogleCss(css)).toEqual([
      { url: "https://fonts.gstatic.com/b.woff2", weight: 400, style: "normal" },
      { url: "https://fonts.gstatic.com/c.woff2", weight: 700, style: "italic" },
    ]);
  });
});
