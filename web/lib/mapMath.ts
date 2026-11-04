// Pan/zoom maths for map views. A view maps image pixels to screen pixels:
// screen = image * scale + (tx, ty).

export interface View {
  scale: number;
  tx: number;
  ty: number;
}

export function fitView(imgW: number, imgH: number, vpW: number, vpH: number, pad = 16): View {
  const scale = Math.min((vpW - 2 * pad) / imgW, (vpH - 2 * pad) / imgH);
  return { scale, tx: (vpW - imgW * scale) / 2, ty: (vpH - imgH * scale) / 2 };
}

export function toImage(view: View, sx: number, sy: number): [number, number] {
  return [(sx - view.tx) / view.scale, (sy - view.ty) / view.scale];
}

/** Zooms by `factor` keeping the image point under (sx, sy) in place. */
export function zoomAt(view: View, sx: number, sy: number, factor: number, min: number, max: number): View {
  const scale = Math.min(max, Math.max(min, view.scale * factor));
  const [ix, iy] = toImage(view, sx, sy);
  return { scale, tx: sx - ix * scale, ty: sy - iy * scale };
}

/** Puts image point (ix, iy) at the centre of the viewport. */
export function centerOn(view: View, ix: number, iy: number, vpW: number, vpH: number, scale = view.scale): View {
  return { scale, tx: vpW / 2 - ix * scale, ty: vpH / 2 - iy * scale };
}
