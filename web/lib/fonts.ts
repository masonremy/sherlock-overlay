// Font loading for the theme. Bundled families are declared by @fontsource
// CSS; uploaded and Google-downloaded ones come from /api/fonts and are
// registered with the FontFace API. Callers wait for every family a theme uses
// to be ready before swapping CSS variables, so text never blanks on stream.

import "@fontsource/im-fell-english/400.css";
import "@fontsource/im-fell-english/400-italic.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/700.css";
import "@fontsource/libre-baskerville/400.css";
import "@fontsource/libre-baskerville/700.css";
import "@fontsource/special-elite/400.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import type { Theme } from "../../shared/schema";

export const BUNDLED_FONTS = [
  { family: "IM Fell English", kind: "display" },
  { family: "Playfair Display", kind: "display" },
  { family: "Cormorant Garamond", kind: "display" },
  { family: "Libre Baskerville", kind: "display" },
  { family: "Special Elite", kind: "display" },
  { family: "Source Sans 3", kind: "body" },
  { family: "Lato", kind: "body" },
] as const;

export interface ServerFont {
  family: string;
  source: "upload" | "google";
  files: { file: string; format: string; weight: number; style: "normal" | "italic" }[];
}

export async function fetchServerFonts(): Promise<ServerFont[]> {
  const res = await fetch("/api/fonts");
  return res.ok ? res.json() : [];
}

const registered = new Set<string>();

function register(font: ServerFont) {
  for (const f of font.files) {
    const key = `${font.family}|${f.file}`;
    if (registered.has(key)) continue;
    registered.add(key);
    const face = new FontFace(font.family, `url(/fonts/${f.file}) format("${f.format}")`, {
      weight: String(f.weight),
      style: f.style,
    });
    document.fonts.add(face);
  }
}

/** Every family a theme names (master and per-component). */
export function themeFamilies(theme: Theme): string[] {
  const all = [theme.display, theme.body];
  for (const style of Object.values(theme.components)) {
    if (style?.display) all.push(style.display);
    if (style?.body) all.push(style.body);
  }
  return [...new Set(all)];
}

/** Resolves once every family is loaded (or has failed, so a missing font never blocks). */
export async function ensureFonts(families: string[], serverFonts?: ServerFont[]): Promise<void> {
  const bundled = new Set<string>(BUNDLED_FONTS.map((f) => f.family));
  const extra = families.filter((f) => !bundled.has(f));
  if (extra.length) {
    const list = serverFonts ?? (await fetchServerFonts());
    for (const font of list) if (extra.includes(font.family)) register(font);
  }
  await Promise.all(
    families.flatMap((f) => [document.fonts.load(`400 24px "${f}"`), document.fonts.load(`700 24px "${f}"`)].map((p) => p.catch(() => null))),
  );
}

const cssFamily = (f: string, fallback: string) => `"${f.replace(/"/g, "")}", ${fallback}`;
export const DISPLAY_FALLBACK = "Georgia, serif";
export const BODY_FALLBACK = "system-ui, sans-serif";

/** CSS custom properties for a component (or the master, with no component). */
export function fontVars(theme: Theme, component?: keyof Theme["components"]): string {
  const style = component ? theme.components[component] : undefined;
  const vars = [
    `--font-display: ${cssFamily(style?.display ?? theme.display, DISPLAY_FALLBACK)}`,
    `--font-body: ${cssFamily(style?.body ?? theme.body, BODY_FALLBACK)}`,
    `--fs: ${style?.scale ?? 1}`,
    `letter-spacing: ${style?.letterSpacing ?? 0}em`,
  ];
  if (style?.weight) vars.push(`--fw: ${style.weight}`);
  return vars.join("; ");
}
