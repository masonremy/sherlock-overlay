// Aged-paper textures. Grain and foxing are SVG turbulence filters rendered
// into small tiles once (as data-URI images) and repeated, so the browser
// rasterises them a single time instead of re-running a filter every frame;
// that keeps the overlay cheap next to other OBS sources. The inked edge is a
// live filter defined once in PaperFilters.svelte and referenced by id.

function svgTile(size: number, filter: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>${filter}</filter>` +
    `<rect width='100%' height='100%' filter='url(#f)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Fine fibre grain: low-alpha sepia speckle. */
export const GRAIN = svgTile(
  256,
  "<feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/>" +
    "<feColorMatrix values='0 0 0 0 0.30  0 0 0 0 0.22  0 0 0 0 0.12  0 0 0 0.55 -0.18'/>",
);

/** Foxing: large, faint brown blotches of age. */
export const FOXING = svgTile(
  512,
  "<feTurbulence type='fractalNoise' baseFrequency='0.008' numOctaves='3' seed='11' stitchTiles='stitch'/>" +
    "<feColorMatrix values='0 0 0 0 0.45  0 0 0 0 0.30  0 0 0 0 0.12  0 0 0 0.8 -0.42'/>",
);

/** Exposes the tiles as CSS variables used by paper.css. */
export function installTextures(root: HTMLElement = document.documentElement): void {
  root.style.setProperty("--tex-grain", GRAIN);
  root.style.setProperty("--tex-foxing", FOXING);
}
