// Turns a dropped/picked file into an uploaded map image. PDFs are rasterised
// here in the browser (pdf.js), so the server only ever stores raster images.

import type { PDFDocumentProxy } from "pdfjs-dist";

export const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
/** Long edge for rasterised PDF pages: crisp text when zoomed in. */
export const PDF_LONG_EDGE = 8000;

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface UploadedImage {
  /** File name on the server, under maps/. */
  file: string;
  width: number;
  height: number;
  sourceName: string;
}

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
}

async function renderPage(doc: PDFDocumentProxy, pageNumber: number, longEdge: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: longEdge / Math.max(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // PDFs assume a white page
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}

export async function pdfThumbnail(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  return (await renderPage(doc, pageNumber, 240)).toDataURL("image/jpeg", 0.8);
}

export async function rasterizePdfPage(doc: PDFDocumentProxy, pageNumber: number): Promise<PreparedImage> {
  const canvas = await renderPage(doc, pageNumber, PDF_LONG_EDGE);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
  if (!blob) throw new Error("The browser could not encode the rendered page");
  const { width, height } = canvas;
  canvas.width = canvas.height = 0; // release the large backing store now
  return { blob, width, height };
}

export async function prepareRaster(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const prepared = { blob: file, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return prepared;
}

/** Uploads to the server and returns the stored file name. */
export async function uploadMapImage(image: PreparedImage): Promise<string> {
  return uploadImage("maps", image.blob);
}

/** Uploads image bytes to maps/ or portraits/; returns the stored file name. */
export async function uploadImage(route: "maps" | "portraits", blob: Blob): Promise<string> {
  const res = await fetch(`/api/${route}/images`, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status})`);
  return body.file as string;
}

export function formatBytes(n: number): string {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.ceil(n / 1e3)} KB`;
}
