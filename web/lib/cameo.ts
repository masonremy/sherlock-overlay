// Victorian cameo silhouettes, drawn in a 100×100 box facing right. Built
// from parts (head shape, hat or hair, facial hair) so a character can be
// given a recognisable placeholder in a couple of clicks.

import type { Cameo } from "../../shared/schema";

interface Head {
  nose: [number, number];
  chin: number;
  back: number;
  crown: number;
  neckBack: number;
  neckFront: number;
}

// 0 standard, 1 strong nose, 2 round head and soft chin, 3 slender with a long neck.
const HEADS: Head[] = [
  { nose: [74, 48], chin: 67, back: 31, crown: 21, neckBack: 42, neckFront: 58 },
  { nose: [77.5, 49], chin: 66, back: 30, crown: 20, neckBack: 43, neckFront: 59 },
  { nose: [72.5, 47], chin: 64, back: 28, crown: 22, neckBack: 41, neckFront: 57 },
  { nose: [72, 47], chin: 66, back: 33, crown: 22, neckBack: 45, neckFront: 56 },
];

function headPath(h: Head): string {
  const [nx, ny] = h.nose;
  return [
    `M22 100 C24 84 34 78 ${h.neckBack} 74`,
    `L${h.neckBack} 66`,
    `C${h.back} 60 ${h.back - 2} 48 ${h.back} 38`,
    `C${h.back + 2} 27 40 ${h.crown} 51 ${h.crown}`,
    `C61 ${h.crown} 67 27 67 34`,
    `L68 40 L${nx} ${ny} L68 ${ny + 3} L69 ${ny + 6} L67.5 ${ny + 8} L68.5 ${ny + 10}`,
    `L${h.chin} ${ny + 15}`,
    `C${h.chin - 3} ${ny + 18} 60 ${ny + 18} 58 ${ny + 17}`,
    `L${h.neckFront} 74 C66 78 76 84 80 100 Z`,
  ].join(" ");
}

const TOPS: Record<Cameo["top"], string> = {
  bare: "",
  tophat: "M32 22 h39 v3.5 h-39 Z M38 23 L39 3 h25 L65 23 Z",
  bowler: "M30 25 C30 22.5 72 22.5 72 25 C72 27.5 30 27.5 30 25 Z M37 25 C37 9 65 9 65 25 Z",
  bonnet:
    "M26 55 C19 36 29 13 52 13 C65 13 73 22 74 31 L68 33 C62 24 50 22 44 28 C38 34 38 46 42 57 Z M43 56 L62 67 L60 70 L41 59 Z",
  helmet: "M32 27 h37 v4 h-37 Z M35 28 C35 12 44 3 51 3 C58 3 67 12 67 28 Z M49 3 h4 v-3 h-4 Z",
  bun: "M21 33 a8.5 8.5 0 1 0 17 0 a8.5 8.5 0 1 0 -17 0 Z",
};

function facePath(face: Cameo["face"], h: Head): string {
  const y = h.nose[1];
  if (face === "moustache") return `M66 ${y + 3} C70 ${y + 2.5} 74.5 ${y + 4.5} 75 ${y + 7.5} C71 ${y + 6.5} 68 ${y + 6.5} 66 ${y + 6.5} Z`;
  if (face === "beard") return `M56 ${y + 10} L68.5 ${y + 9} C73 ${y + 14} 71 ${y + 25} 60 ${y + 27} C55 ${y + 25} 53 ${y + 18} 54 ${y + 13} Z`;
  return "";
}

/** All silhouette parts as one SVG path. */
export function cameoPath(cameo: Cameo): string {
  const h = HEADS[cameo.head] ?? HEADS[0];
  return [headPath(h), TOPS[cameo.top], facePath(cameo.face, h)].filter(Boolean).join(" ");
}

/** Renders an <svg> element to a PNG blob (for "download cameo"). */
export async function svgToPng(svg: SVGSVGElement, size = 512): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Could not render the cameo");
  return blob;
}
