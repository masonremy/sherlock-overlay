import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveImage, sniffImage, UnsupportedImageError } from "./uploads";

const saveMapImage = (dir: string, buf: Buffer) => saveImage(dir, buf, "img");

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sherlock-uploads-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("sniffImage", () => {
  it("recognises png, jpg and webp by their bytes", () => {
    expect(sniffImage(png)).toBe("png");
    expect(sniffImage(jpg)).toBe("jpg");
    expect(sniffImage(webp)).toBe("webp");
    expect(sniffImage(Buffer.from("<svg></svg>"))).toBeNull();
  });
});

describe("saveMapImage", () => {
  it("stores the file under a content hash", async () => {
    const name = await saveMapImage(dir, png);
    expect(name).toMatch(/^img-[0-9a-f]{16}\.png$/);
    expect(await readFile(join(dir, name))).toEqual(png);
  });

  it("stores identical uploads once", async () => {
    const a = await saveMapImage(dir, png);
    const b = await saveMapImage(dir, png);
    expect(a).toBe(b);
    expect(await readdir(dir)).toHaveLength(1);
  });

  it("uses the given prefix (portraits are p-<hash>)", async () => {
    expect(await saveImage(dir, jpg, "p")).toMatch(/^p-[0-9a-f]{16}\.jpg$/);
  });

  it("rejects anything that is not an image", async () => {
    await expect(saveMapImage(dir, Buffer.from("hello"))).rejects.toThrow(UnsupportedImageError);
  });
});
