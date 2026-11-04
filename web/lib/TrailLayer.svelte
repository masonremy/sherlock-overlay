<script lang="ts">
  import { fade } from "svelte/transition";
  import type { Point } from "../../shared/geometry";
  import type { Character, MapDef, TrailStep } from "../../shared/schema";
  import Avatar from "./Avatar.svelte";
  import type { View } from "./mapMath";
  import { curvePath, pathSegments, pinGroups } from "./trail";

  // Pins and path for one map, drawn in screen space over a panned/zoomed map
  // so pins stay the same size at any zoom. Pointer events pass through.

  interface Props {
    trail: TrailStep[];
    map: MapDef;
    view: View;
    width: number;
    height: number;
    /** Pin radius in px. */
    pinSize?: number;
    /** Unique per page, for SVG mask ids. */
    idPrefix: string;
    /** Characters met at each zone, shown as small faces above the pin. */
    faces?: Record<string, Character[]>;
    /** Zones named in notes but not visited yet: drawn as faint dashed rings. */
    rings?: string[];
  }

  let { trail, map, view, width, height, pinSize = 14, idPrefix, faces = {}, rings = [] }: Props = $props();
  const MAX_FACES = 3;

  const anchors = $derived(Object.fromEntries(map.zones.map((z) => [z.id, z.anchor])) as Record<string, Point>);
  const groups = $derived(pinGroups(trail, map.id).filter((g) => anchors[g.zoneId]));
  const segments = $derived(pathSegments(trail, map.id).filter((s) => anchors[s.from] && anchors[s.to]));
  const latest = $derived(Math.max(-1, ...groups.map((g) => g.lastIndex)));

  const [W, H] = $derived(map.imageSize);
  const toScreen = (p: Point): Point => [p[0] * W * view.scale + view.tx, p[1] * H * view.scale + view.ty];
  const pillWidth = (label: string) => Math.max(2 * pinSize, label.length * pinSize * 0.62 + pinSize * 1.1);
  const maskId = (key: string) => `${idPrefix}-${key.replace(/[^\w-]/g, "_")}`;
</script>

<svg class="trail" {width} {height} style:--pin="{pinSize}px">
  {#each rings.filter((z) => anchors[z]) as zoneId (zoneId)}
    {@const [x, y] = toScreen(anchors[zoneId])}
    <circle class="ring" cx={x} cy={y} r={pinSize * 1.5} />
  {/each}

  {#each segments as seg (seg.key)}
    {@const d = curvePath(toScreen(anchors[seg.from]), toScreen(anchors[seg.to]))}
    <g class="segment" class:recent={seg.toIndex === latest}>
      <mask id={maskId(seg.key)} maskUnits="userSpaceOnUse" x="0" y="0" {width} {height}>
        <path {d} pathLength="1" class="reveal" />
      </mask>
      <path {d} class="halo" mask="url(#{maskId(seg.key)})" />
      <path {d} class="ink" mask="url(#{maskId(seg.key)})" />
    </g>
  {/each}

  {#each groups as g (g.zoneId)}
    {@const [x, y] = toScreen(anchors[g.zoneId])}
    {@const w = g.hollow ? 2 * pinSize : pillWidth(g.label)}
    {@const met = faces[g.zoneId] ?? []}
    <g transform="translate({x},{y})" class="pin" class:latest={g.lastIndex === latest}>
      <g class="drop">
        {#if met.length}
          {@const size = pinSize * 2.3}
          {@const step = size * 0.72}
          {@const shown = met.slice(0, MAX_FACES)}
          {@const x0 = (-(shown.length - 1) * step) / 2 - size / 2}
          <g class="faces">
            {#each shown as c, i (c.id)}
              <Avatar character={c} {size} x={x0 + i * step} y={-pinSize - size - 2} />
            {/each}
            {#if met.length > MAX_FACES}
              <text class="more" x={x0 + shown.length * step + size * 0.15} y={-pinSize - size / 2 - 2} font-size={pinSize}
                >+{met.length - MAX_FACES}</text
              >
            {/if}
          </g>
        {/if}
        {#if g.lastIndex === latest}
          <circle class="pulse" r={pinSize} />
        {/if}
        <rect x={-w / 2} y={-pinSize} width={w} height={2 * pinSize} rx={pinSize} class:hollow={g.hollow} />
        {#key g.label}
          <text in:fade={{ duration: 300 }} font-size={pinSize * 1.15}>{g.label}</text>
        {/key}
      </g>
    </g>
  {/each}
</svg>

<style>
  .trail {
    position: absolute;
    inset: 0;
    overflow: visible;
    pointer-events: none;
  }
  .reveal {
    fill: none;
    stroke: #fff;
    stroke-width: 24;
    stroke-dasharray: 1 1;
    animation: draw 600ms ease-out both;
  }
  .halo {
    fill: none;
    stroke: rgb(255 250 240 / 0.7);
    stroke-width: 7;
    stroke-linecap: round;
  }
  .ink {
    fill: none;
    stroke: #3a2416;
    stroke-width: 3.5;
    stroke-dasharray: 10 7;
    stroke-linecap: round;
  }
  .segment:not(.recent) {
    opacity: 0.7;
  }
  /* Older pins recede by colour, not transparency, so the map never shows through. */
  .pin:not(.latest) {
    filter: saturate(0.55) brightness(1.08);
  }
  .drop {
    animation: drop 450ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
  }
  rect {
    fill: #9b1c1c;
    stroke: #5e0f0f;
    stroke-width: 2.5;
    filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.45));
  }
  rect.hollow {
    fill: #fff8ec;
    stroke: #9b1c1c;
    stroke-width: 3.5;
  }
  text {
    fill: #fff;
    font-family: "IM Fell English", Georgia, serif;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: central;
  }
  .ring {
    fill: rgb(255 248 236 / 0.25);
    stroke: var(--wax, #9b1c1c);
    stroke-width: 2.5;
    stroke-dasharray: 5 4;
    opacity: 0.75;
    animation: fadein 600ms ease-out both;
  }
  @keyframes fadein {
    from {
      opacity: 0;
    }
  }
  .faces {
    filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.4));
  }
  text.more {
    fill: #2b2118;
    stroke: #fff8ec;
    stroke-width: 3px;
    paint-order: stroke;
    text-anchor: start;
  }
  .pulse {
    fill: none;
    stroke: #c0392b;
    stroke-width: 3;
    transform-box: fill-box;
    transform-origin: center;
    animation: pulse 1.8s ease-out infinite;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes drop {
    from {
      transform: translateY(calc(var(--pin) * -2.5));
      opacity: 0;
    }
  }
  @keyframes pulse {
    from {
      transform: scale(1);
      opacity: 0.8;
    }
    to {
      transform: scale(2.1);
      opacity: 0;
    }
  }
</style>
