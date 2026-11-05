// Client side of the documents: the list, each one's text index, and the PDF
// itself (rendered with pdf.js). Everything is fetched once per page and kept.

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { DocInfo, DocText } from "../../shared/docs";

let list: Promise<DocInfo[]> | null = null;
const texts = new Map<string, Promise<DocText>>();
const pdfs = new Map<string, Promise<PDFDocumentProxy>>();

export function loadDocList(): Promise<DocInfo[]> {
  list ??= fetch("/api/docs")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return list;
}

export function loadDocText(id: string): Promise<DocText> {
  let t = texts.get(id);
  if (!t) {
    t = fetch(`/api/docs/${encodeURIComponent(id)}/text`).then((r) => (r.ok ? r.json() : { id, pages: [] }));
    texts.set(id, t);
  }
  return t;
}

export const artifactUrl = (file: string) => `/artifacts/${file.split("/").map(encodeURIComponent).join("/")}`;

export function loadPdf(file: string): Promise<PDFDocumentProxy> {
  let p = pdfs.get(file);
  if (!p) {
    p = (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      return pdfjs.getDocument({ url: artifactUrl(file) }).promise;
    })();
    pdfs.set(file, p);
  }
  return p;
}
