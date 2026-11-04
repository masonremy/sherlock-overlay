// Portraits are cropped to a square and downscaled to 256 px in the browser,
// then uploaded to portraits/ (content-addressed, like map images).

import { uploadImage } from "./mapImage";

export const PORTRAIT_SIZE = 256;

export interface SquareCrop {
  /** Top-left and side length, in the image's natural pixels. */
  x: number;
  y: number;
  size: number;
}

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

export function centerCrop(img: HTMLImageElement): SquareCrop {
  const size = Math.min(img.naturalWidth, img.naturalHeight);
  return { x: (img.naturalWidth - size) / 2, y: (img.naturalHeight - size) / 2, size };
}

export async function cropToBlob(img: HTMLImageElement, crop: SquareCrop): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PORTRAIT_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.9));
  if (!blob) throw new Error("The browser could not encode the portrait");
  return blob;
}

export function uploadPortrait(blob: Blob): Promise<string> {
  return uploadImage("portraits", blob);
}

/** The first image on the clipboard or in a drop, if any. */
export function imageFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of data.items ?? []) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return [...(data.files ?? [])].find((f) => f.type.startsWith("image/")) ?? null;
}
