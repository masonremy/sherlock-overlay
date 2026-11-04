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

/**
 * Keeps the image covering the viewport where it's bigger than the viewport,
 * and centred along an axis where it's smaller.
 */
export function clampToImage(view: View, imgW: number, imgH: number, vpW: number, vpH: number): View {
  const axis = (t: number, img: number, vp: number) => (img <= vp ? (vp - img) / 2 : Math.min(0, Math.max(vp - img, t)));
  return { scale: view.scale, tx: axis(view.tx, imgW * view.scale, vpW), ty: axis(view.ty, imgH * view.scale, vpH) };
}

/** Frames an image-pixel box [x0, y0, x1, y1] in the viewport, within zoom limits. */
export function frameBox(
  box: [number, number, number, number],
  imgW: number,
  imgH: number,
  vpW: number,
  vpH: number,
  minScale: number,
  maxScale: number,
): View {
  const [x0, y0, x1, y1] = box;
  const fit = Math.min(vpW / Math.max(1, x1 - x0), vpH / Math.max(1, y1 - y0));
  const scale = Math.min(maxScale, Math.max(minScale, fit));
  const v = centerOn({ scale, tx: 0, ty: 0 }, (x0 + x1) / 2, (y0 + y1) / 2, vpW, vpH);
  return clampToImage(v, imgW, imgH, vpW, vpH);
}

/** The image-pixel box visible in the viewport. */
export function visibleBox(view: View, vpW: number, vpH: number): [number, number, number, number] {
  const [x0, y0] = toImage(view, 0, 0);
  const [x1, y1] = toImage(view, vpW, vpH);
  return [x0, y0, x1, y1];
}

/** Puts image point (ix, iy) at the centre of the viewport. */
export function centerOn(view: View, ix: number, iy: number, vpW: number, vpH: number, scale = view.scale): View {
  return { scale, tx: vpW / 2 - ix * scale, ty: vpH / 2 - iy * scale };
}
