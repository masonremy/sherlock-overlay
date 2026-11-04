<script lang="ts">
  import { untrack } from "svelte";
  import type { Point } from "../../shared/geometry";
  import type { MapDef, TrailStep } from "../../shared/schema";
  import { centerOn, clampToImage, fitView, toImage, visibleBox, zoomAt, type View } from "../lib/mapMath";
  import TrailLayer from "../lib/TrailLayer.svelte";

  // The panel's map: browse freely (wheel/pinch zoom, drag pan, double-click),
  // click a zone to select it. Looking never records anything.

  interface Props {
    map: MapDef;
    trail: TrailStep[];
    selectedZoneId: string | null;
    onSelect: (zoneId: string | null) => void;
    /** Visible area, normalised, whenever the view changes (for mirror mode). */
    onView?: (rect: [number, number, number, number]) => void;
  }

  let { map, trail, selectedZoneId, onSelect, onView }: Props = $props();

  let vp: HTMLDivElement;
  let vpW = $state(0);
  let vpH = $state(0);
  let view = $state<View>({ scale: 1, tx: 0, ty: 0 });

  const [W, H] = $derived(map.imageSize);
  const fitScale = $derived(vpW && vpH ? fitView(W, H, vpW, vpH, 0).scale : 1);
  const zoomed = $derived(view.scale > fitScale * 1.05);
  const selected = $derived(map.zones.find((z) => z.id === selectedZoneId) ?? null);
  const visits = $derived(
    selected ? trail.flatMap((t, i) => (t.mapId === map.id && t.zoneId === selected.id ? [i + 1] : [])) : [],
  );

  function setView(v: View) {
    const scale = Math.min(fitScale * 8, Math.max(fitScale, v.scale));
    view = clampToImage({ ...v, scale }, W, H, vpW, vpH);
  }

  export function fit() {
    if (vpW && vpH) view = fitView(W, H, vpW, vpH, 0);
  }

  export function focusZone(zoneId: string) {
    const zone = map.zones.find((z) => z.id === zoneId);
    if (!zone || !vpW) return;
    const scale = Math.max(view.scale, fitScale * 3);
    setView(centerOn(view, zone.anchor[0] * W, zone.anchor[1] * H, vpW, vpH, scale));
  }

  // Refit when the map, its image or the panel size changes.
  let fittedKey = "";
  $effect(() => {
    const key = `${map.id}:${W}x${H}:${vpW}x${vpH}`;
    if (vpW > 0 && vpH > 0 && key !== fittedKey) {
      const sameMap = fittedKey.startsWith(`${map.id}:${W}x${H}:`);
      fittedKey = key;
      untrack(() => (sameMap ? setView(view) : fit()));
    }
  });

  $effect(() => {
    if (vpW && vpH && onView) {
      const [x0, y0, x1, y1] = visibleBox(view, vpW, vpH);
      onView([Math.max(0, x0 / W), Math.max(0, y0 / H), Math.min(1, x1 / W), Math.min(1, y1 / H)]);
    }
  });

  $effect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [sx, sy] = screen(e);
      setView(zoomAt(view, sx, sy, Math.exp(-e.deltaY * 0.0015), 0, Infinity));
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  });

  function screen(e: { clientX: number; clientY: number }): Point {
    const r = vp.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  // Pointer gestures: one finger/mouse pans (or clicks), two fingers pinch.
  const pointers = new Map<number, Point>();
  type Gesture =
    | { kind: "click"; s0: Point; view0: View; zoneId: string | null }
    | { kind: "pan"; s0: Point; view0: View }
    | { kind: "pinch"; d0: number; m0: Point; view0: View };
  let gesture: Gesture | null = null;
  let panning = $state(false);

  const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  function onPointerDown(e: PointerEvent) {
    vp.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, screen(e));
    const pts = [...pointers.values()];
    if (pts.length === 1) {
      const zoneId = (e.target as Element).closest<SVGElement>("[data-zone]")?.dataset.zone ?? null;
      gesture = { kind: "click", s0: pts[0], view0: view, zoneId };
    } else if (pts.length === 2) {
      gesture = { kind: "pinch", d0: dist(pts[0], pts[1]), m0: mid(pts[0], pts[1]), view0: view };
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, screen(e));
    const pts = [...pointers.values()];
    if (!gesture) return;
    if (gesture.kind === "pinch" && pts.length >= 2) {
      const m = mid(pts[0], pts[1]);
      const z = zoomAt(gesture.view0, ...gesture.m0, dist(pts[0], pts[1]) / gesture.d0, 0, Infinity);
      setView({ ...z, tx: z.tx + m[0] - gesture.m0[0], ty: z.ty + m[1] - gesture.m0[1] });
      return;
    }
    if (gesture.kind === "click") {
      if (dist(pts[0], gesture.s0) < 5) return;
      gesture = { kind: "pan", s0: gesture.s0, view0: gesture.view0 };
      panning = true;
    }
    if (gesture.kind === "pan") {
      const s = pts[0];
      setView({ ...gesture.view0, tx: gesture.view0.tx + s[0] - gesture.s0[0], ty: gesture.view0.ty + s[1] - gesture.s0[1] });
    }
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (gesture?.kind === "click") onSelect(gesture.zoneId);
    const rest = [...pointers.values()];
    // Lifting one finger of a pinch continues as a pan with the other.
    gesture = rest.length === 1 ? { kind: "pan", s0: rest[0], view0: view } : null;
    panning = gesture !== null;
  }

  function onDblClick(e: MouseEvent) {
    const [sx, sy] = screen(e);
    setView(zoomAt(view, sx, sy, 2, 0, Infinity));
  }

  // Minimap: click or drag to move the view there.
  const MINI = 120;
  const miniW = $derived(W >= H ? MINI : (MINI * W) / H);
  const miniH = $derived(W >= H ? (MINI * H) / W : MINI);
  const miniBox = $derived.by(() => {
    const [x0, y0, x1, y1] = vpW ? visibleBox(view, vpW, vpH) : [0, 0, W, H];
    const k = miniW / W;
    return { x: Math.max(0, x0 * k), y: Math.max(0, y0 * k), w: Math.min(miniW, (x1 - x0) * k), h: Math.min(miniH, (y1 - y0) * k) };
  });
  function miniMove(e: PointerEvent) {
    if (e.type === "pointermove" && !e.buttons) return;
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setView(centerOn(view, ((e.clientX - r.left) / miniW) * W, ((e.clientY - r.top) / miniH) * H, vpW, vpH));
  }

  const svgPoints = (points: Point[]) => points.map(([x, y]) => `${x * W},${y * H}`).join(" ");
</script>

<div
  class="viewport"
  class:panning
  bind:this={vp}
  bind:clientWidth={vpW}
  bind:clientHeight={vpH}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  ondblclick={onDblClick}
  role="application"
  aria-label="Map: click a zone to select it"
>
  <div
    class="content"
    style:width="{W}px"
    style:height="{H}px"
    style:transform="translate({view.tx}px, {view.ty}px) scale({view.scale})"
  >
    <img src="/maps/{map.image}" width={W} height={H} alt="" draggable="false" />
    <svg viewBox="0 0 {W} {H}" width={W} height={H}>
      {#each map.zones as zone (zone.id)}
        <polygon
          data-zone={zone.id}
          points={svgPoints(zone.points)}
          class:selected={zone.id === selectedZoneId}
          class:blocked={!zone.visitable}
        />
      {/each}
    </svg>
  </div>

  <TrailLayer {trail} {map} {view} width={vpW} height={vpH} pinSize={11} idPrefix="panel" />

  {#if selected}
    <div class="card">
      <strong>{selected.label}</strong>
      {#if selected.district}<span>{selected.district}</span>{/if}
      {#if !selected.visitable}<span class="warn">not visitable</span>{/if}
      {#if visits.length}<span>visited: {visits.join(", ")}</span>{/if}
    </div>
  {/if}

  {#if zoomed}
    <div
      class="mini"
      style:width="{miniW}px"
      style:height="{miniH}px"
      onpointerdown={miniMove}
      onpointermove={miniMove}
      ondblclick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <img src="/maps/{map.image}" alt="" draggable="false" />
      <span style:left="{miniBox.x}px" style:top="{miniBox.y}px" style:width="{miniBox.w}px" style:height="{miniBox.h}px"
      ></span>
    </div>
  {/if}
</div>

<style>
  .viewport {
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 100%;
    background: #d9cfbc;
    touch-action: none;
    user-select: none;
    cursor: pointer;
  }
  .viewport.panning {
    cursor: grabbing;
  }
  .content {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }
  img,
  svg {
    position: absolute;
    inset: 0;
    display: block;
  }
  polygon {
    fill: transparent;
    stroke: transparent;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    pointer-events: all;
  }
  polygon:hover {
    stroke: rgb(139 46 34 / 0.6);
  }
  polygon.blocked:hover {
    stroke: #555;
    stroke-dasharray: 4 3;
  }
  polygon.selected {
    fill: rgb(214 69 45 / 0.22);
    stroke: #d6452d;
    stroke-width: 3;
  }
  .card {
    position: absolute;
    left: 8px;
    top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    align-items: baseline;
    max-width: calc(100% - 16px);
    padding: 6px 10px;
    background: #fffaf0;
    border: 1px solid #b9a787;
    border-radius: 6px;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.2);
    font-size: 13px;
    pointer-events: none;
  }
  .card strong {
    font-size: 16px;
  }
  .card span {
    color: #6b5a44;
  }
  .card .warn {
    color: #8b1e1e;
    font-weight: 600;
  }
  .mini {
    position: absolute;
    right: 8px;
    bottom: 8px;
    border: 1px solid #2b2118;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.3);
    background: #f3ead7;
    cursor: crosshair;
  }
  .mini img {
    width: 100%;
    height: 100%;
  }
  .mini span {
    position: absolute;
    border: 2px solid #d6452d;
    background: rgb(214 69 45 / 0.12);
    box-sizing: border-box;
    pointer-events: none;
  }
</style>
