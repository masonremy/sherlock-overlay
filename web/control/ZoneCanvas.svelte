<script lang="ts">
  import { untrack } from "svelte";
  import type { MapDef, Zone } from "../../shared/schema";
  import { anchorAfterReshape, clamp01, rectFromCorners, roundPoint, type Point } from "../../shared/geometry";
  import { centerOn, fitView, toImage, zoomAt, type View } from "../lib/mapMath";
  import { TOOLS, type Tool } from "./zoneTools";

  interface Props {
    map: MapDef;
    selectedId: string | null;
    tool: Tool;
    /** Width and height of bulk-mode boxes, normalised. */
    bulkSize: Point;
    showLabels: boolean;
    /** Whether keyboard shortcuts are live (the Maps tab is showing). */
    active: boolean;
    onSelect: (id: string | null) => void;
    onAdd: (shape: Zone["shape"], points: Point[]) => void;
    onUpdate: (id: string, patch: { points: Point[]; anchor: Point }) => void;
    onDelete: (id: string) => void;
    onTool: (tool: Tool) => void;
  }

  let { map, selectedId, tool, bulkSize, showLabels, active, onSelect, onAdd, onUpdate, onDelete, onTool }: Props =
    $props();

  type Drag =
    | { kind: "pan"; s0: Point; view0: View }
    | { kind: "click"; s0: Point; view0: View; zoneId: string | null } // becomes a pan if it moves
    | { kind: "rect"; s0: Point; a: Point; b: Point; zoneId: string | null }
    | { kind: "move"; id: string; s0: Point; p0: Point; points0: Point[]; anchor0: Point; moved: boolean }
    | { kind: "vertex"; id: string; index: number; shape: Zone["shape"]; points0: Point[]; anchor0: Point }
    | { kind: "anchor"; id: string; points0: Point[] };

  let vp: HTMLDivElement;
  let vpW = $state(0);
  let vpH = $state(0);
  let view = $state<View>({ scale: 1, tx: 0, ty: 0 });
  let drag = $state<Drag | null>(null);
  /** Shape shown instead of the stored one while dragging, until the server confirms. */
  let preview = $state<{ id: string; points: Point[]; anchor: Point } | null>(null);
  let draft = $state<Point[]>([]);
  let cursor = $state<Point | null>(null);
  let spaceDown = $state(false);
  let imgFailed = $state(false);

  const W = $derived(map.imageSize[0]);
  const H = $derived(map.imageSize[1]);
  const fitScale = $derived(vpW && vpH ? fitView(W, H, vpW, vpH).scale : 1);
  const minScale = $derived(fitScale * 0.8);
  const maxScale = $derived(Math.max(fitScale * 16, 2));
  const selected = $derived(map.zones.find((z) => z.id === selectedId) ?? null);
  const selectedShown = $derived(selected && shown(selected));
  const r = $derived(6 / view.scale); // handle radius: constant on screen

  // Fit once per map/image, as soon as the viewport has a size.
  let fittedKey = "";
  $effect(() => {
    const key = `${map.id}:${W}x${H}`;
    if (vpW > 0 && vpH > 0 && key !== fittedKey) {
      fittedKey = key;
      untrack(fit);
    }
  });

  // On resize: refit if the user hasn't moved the view, else keep its centre.
  let userMoved = false;
  let lastVp: Point = [0, 0];
  $effect(() => {
    const size: Point = [vpW, vpH];
    untrack(() => {
      const [pw, ph] = lastVp;
      lastVp = size;
      if (!pw || !ph || !size[0] || !size[1]) return;
      if (!userMoved) fit();
      else view = { ...view, tx: view.tx + (size[0] - pw) / 2, ty: view.ty + (size[1] - ph) / 2 };
    });
  });

  $effect(() => {
    map.image;
    imgFailed = false;
  });

  // A new snapshot of this map replaces the drag preview.
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    map;
    untrack(() => {
      if (!drag) preview = null;
    });
  });

  $effect(() => {
    tool;
    draft = [];
  });

  // Non-passive so the page doesn't scroll while zooming.
  $effect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [sx, sy] = screen(e);
      view = zoomAt(view, sx, sy, Math.exp(-e.deltaY * 0.0015), minScale, maxScale);
      userMoved = true;
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  });

  export function fit() {
    if (!vpW || !vpH) return;
    view = fitView(W, H, vpW, vpH);
    userMoved = false;
  }

  export function focusZone(id: string) {
    const zone = map.zones.find((z) => z.id === id);
    if (!zone) return;
    const xs = zone.points.map((p) => p[0] * W);
    const ys = zone.points.map((p) => p[1] * H);
    const scale = Math.max(view.scale, Math.min(maxScale, fitScale * 4));
    view = centerOn(view, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, vpW, vpH, scale);
    userMoved = true;
  }

  function shown(zone: Zone): Zone {
    return preview?.id === zone.id ? { ...zone, points: preview.points, anchor: preview.anchor } : zone;
  }

  function screen(e: MouseEvent): Point {
    const rect = vp.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function norm(e: MouseEvent): Point {
    const [x, y] = toImage(view, ...screen(e));
    return [clamp01(x / W), clamp01(y / H)];
  }

  function toScreen([x, y]: Point): Point {
    return [x * W * view.scale + view.tx, y * H * view.scale + view.ty];
  }

  const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const svgPoints = (points: Point[]) => points.map(([x, y]) => `${x * W},${y * H}`).join(" ");

  function onPointerDown(e: PointerEvent) {
    if (e.button > 2) return;
    vp.setPointerCapture(e.pointerId);
    const s = screen(e);
    const p = norm(e);
    if (e.button !== 0 || spaceDown) {
      drag = { kind: "pan", s0: s, view0: view };
      return;
    }
    const target = e.target as Element;
    const handle = target.closest<SVGElement>("[data-handle]");
    const zoneId = target.closest<SVGElement>("[data-zone]")?.dataset.zone ?? null;

    if (handle && selectedShown && draft.length === 0) {
      const { id, points, anchor, shape } = selectedShown;
      const index = Number(handle.dataset.index);
      if (handle.dataset.handle === "anchor") {
        drag = { kind: "anchor", id, points0: points };
      } else if (handle.dataset.handle === "vertex") {
        drag = { kind: "vertex", id, index, shape, points0: points, anchor0: anchor };
      } else {
        // Midpoint handle: insert a vertex there and drag it.
        const inserted = points.toSpliced(index + 1, 0, p);
        drag = { kind: "vertex", id, index: index + 1, shape: "polygon", points0: inserted, anchor0: anchor };
        preview = { id, points: inserted, anchor };
      }
      return;
    }

    if (tool === "select") {
      const zone = zoneId ? map.zones.find((z) => z.id === zoneId) : null;
      onSelect(zone?.id ?? null);
      if (zone) {
        const { points, anchor } = shown(zone);
        drag = { kind: "move", id: zone.id, s0: s, p0: p, points0: points, anchor0: anchor, moved: false };
      } else {
        drag = { kind: "pan", s0: s, view0: view };
      }
    } else if (tool === "rect") {
      drag = { kind: "rect", s0: s, a: p, b: p, zoneId };
    } else {
      drag = { kind: "click", s0: s, view0: view, zoneId };
    }
  }

  function onPointerMove(e: PointerEvent) {
    const s = screen(e);
    const p = norm(e);
    cursor = p;
    if (!drag) return;
    switch (drag.kind) {
      case "click":
        if (dist(s, drag.s0) <= 4) return;
        drag = { kind: "pan", s0: drag.s0, view0: drag.view0 };
      // falls through
      case "pan":
        view = { scale: view.scale, tx: drag.view0.tx + s[0] - drag.s0[0], ty: drag.view0.ty + s[1] - drag.s0[1] };
        userMoved = true;
        return;
      case "rect":
        drag.b = p;
        return;
      case "move": {
        if (!drag.moved && dist(s, drag.s0) < 3) return;
        drag.moved = true;
        const xs = drag.points0.map((q) => q[0]);
        const ys = drag.points0.map((q) => q[1]);
        // Keep the whole zone on the map.
        const dx = Math.min(1 - Math.max(...xs), Math.max(-Math.min(...xs), p[0] - drag.p0[0]));
        const dy = Math.min(1 - Math.max(...ys), Math.max(-Math.min(...ys), p[1] - drag.p0[1]));
        preview = {
          id: drag.id,
          points: drag.points0.map(([x, y]) => [x + dx, y + dy]),
          anchor: [drag.anchor0[0] + dx, drag.anchor0[1] + dy],
        };
        return;
      }
      case "vertex": {
        const points =
          drag.shape === "rect"
            ? rectFromCorners(p, drag.points0[(drag.index + 2) % 4])
            : drag.points0.with(drag.index, p);
        preview = { id: drag.id, points, anchor: anchorAfterReshape(drag.points0, drag.anchor0, points) };
        return;
      }
      case "anchor":
        preview = { id: drag.id, points: drag.points0, anchor: p };
        return;
    }
  }

  function onPointerUp(e: PointerEvent) {
    const d = drag;
    drag = null;
    if (!d) return;
    const s = screen(e);
    const p = norm(e);
    switch (d.kind) {
      case "rect":
        if (Math.abs(s[0] - d.s0[0]) > 6 && Math.abs(s[1] - d.s0[1]) > 6) {
          onAdd("rect", rectFromCorners(d.a, p).map(roundPoint));
        } else if (d.zoneId) {
          onSelect(d.zoneId);
        }
        return;
      case "click":
        if (tool === "polygon") polygonClick(p, s);
        else if (tool === "bulk") {
          if (d.zoneId) onSelect(d.zoneId);
          else onAdd("rect", bulkRect(p));
        }
        return;
      case "move":
      case "vertex":
      case "anchor":
        if (preview && (d.kind !== "move" || d.moved)) {
          onUpdate(preview.id, { points: preview.points.map(roundPoint), anchor: roundPoint(preview.anchor) });
          // Normally cleared by the next snapshot; this covers a rejected update.
          clearTimeout(previewTimer);
          previewTimer = setTimeout(() => !drag && (preview = null), 2000);
        } else {
          preview = null;
        }
        return;
    }
  }

  function onPointerCancel() {
    drag = null;
    preview = null;
  }

  function polygonClick(p: Point, s: Point) {
    if (draft.length >= 3 && dist(s, toScreen(draft[0])) < 10) closePolygon();
    else draft = [...draft, p];
  }

  function closePolygon() {
    if (draft.length < 3) return;
    onAdd("polygon", draft.map(roundPoint));
    draft = [];
  }

  function bulkRect([cx, cy]: Point): Point[] {
    const [w, h] = bulkSize;
    const x = Math.min(1 - w, Math.max(0, cx - w / 2));
    const y = Math.min(1 - h, Math.max(0, cy - h / 2));
    return rectFromCorners([x, y], [x + w, y + h]).map(roundPoint);
  }

  function onDblClick(e: MouseEvent) {
    if (tool !== "select" || (e.target as Element).closest("[data-zone],[data-handle]")) return;
    const [sx, sy] = screen(e);
    view = zoomAt(view, sx, sy, 2, minScale, maxScale);
    userMoved = true;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!active || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as HTMLElement).matches?.("input, textarea, select, [contenteditable]")) return;
    switch (e.key) {
      case " ":
        spaceDown = true;
        e.preventDefault();
        break;
      case "Enter":
        if (tool === "polygon") closePolygon();
        break;
      case "Escape":
        if (draft.length) draft = [];
        else if (drag) onPointerCancel();
        else onSelect(null);
        break;
      case "Backspace":
        e.preventDefault();
        if (draft.length) draft = draft.slice(0, -1);
        else if (selectedId) onDelete(selectedId);
        break;
      case "Delete":
        if (selectedId) onDelete(selectedId);
        break;
      case "0":
        fit();
        break;
      default: {
        const t = TOOLS.find((t) => t.key === e.key.toUpperCase());
        if (t) onTool(t.id);
      }
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={(e) => e.key === " " && (spaceDown = false)} />

<div
  class="viewport tool-{tool}"
  class:panning={spaceDown || drag?.kind === "pan"}
  bind:this={vp}
  bind:clientWidth={vpW}
  bind:clientHeight={vpH}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  onpointerleave={() => !drag && (cursor = null)}
  ondblclick={onDblClick}
  oncontextmenu={(e) => e.preventDefault()}
  role="application"
  aria-label="Zone editor map"
>
  <div
    class="content"
    style:width="{W}px"
    style:height="{H}px"
    style:transform="translate({view.tx}px, {view.ty}px) scale({view.scale})"
  >
    {#if !imgFailed}
      <img src="/maps/{map.image}" width={W} height={H} alt="" draggable="false" onerror={() => (imgFailed = true)} />
    {/if}
    <svg viewBox="0 0 {W} {H}" width={W} height={H}>
      {#each map.zones as z (z.id)}
        {@const zone = shown(z)}
        <polygon
          data-zone={zone.id}
          points={svgPoints(zone.points)}
          class:selected={zone.id === selectedId}
          class:blocked={!zone.visitable}
        />
      {/each}

      {#if showLabels}
        {#each map.zones as z (z.id)}
          {@const zone = shown(z)}
          <text
            x={zone.anchor[0] * W}
            y={zone.anchor[1] * H}
            font-size={12 / view.scale}
            stroke-width={3 / view.scale}>{zone.label}</text
          >
        {/each}
      {/if}

      {#if selectedShown && draft.length === 0}
        {@const pts = selectedShown.points}
        {@const [ax, ay] = selectedShown.anchor}
        {#if selectedShown.shape === "polygon"}
          {#each pts as a, i}
            {@const b = pts[(i + 1) % pts.length]}
            <circle
              class="handle mid"
              data-handle="mid"
              data-index={i}
              cx={((a[0] + b[0]) / 2) * W}
              cy={((a[1] + b[1]) / 2) * H}
              r={r * 0.7}
            />
          {/each}
        {/if}
        {#each pts as [x, y], i}
          <circle class="handle" data-handle="vertex" data-index={i} cx={x * W} cy={y * H} {r} />
        {/each}
        <g class="anchor" data-handle="anchor">
          <circle cx={ax * W} cy={ay * H} r={r * 1.4} />
          <path d="M{ax * W - r * 2},{ay * H}h{r * 4}M{ax * W},{ay * H - r * 2}v{r * 4}" />
        </g>
      {/if}

      {#if drag?.kind === "rect"}
        <polygon class="draft" points={svgPoints(rectFromCorners(drag.a, drag.b))} />
      {/if}
      {#if draft.length}
        <polyline class="draft" points={svgPoints(cursor ? [...draft, cursor] : draft)} />
        <circle class="handle close" cx={draft[0][0] * W} cy={draft[0][1] * H} r={r * 1.3} />
      {/if}
      {#if tool === "bulk" && cursor && !drag}
        <polygon class="draft ghost" points={svgPoints(bulkRect(cursor))} />
      {/if}
    </svg>
  </div>

  {#if imgFailed}
    <p class="missing">
      Image <code>{map.image}</code> isn't in your <code>maps/</code> folder. Use <strong>Replace image</strong> to load
      your copy; the zones are kept.
    </p>
  {/if}

  <div class="status">
    <span>{TOOLS.find((t) => t.id === tool)?.hint}</span>
    <span class="num">
      {Math.round((view.scale / fitScale) * 100)}%
      {#if cursor}· {Math.round(cursor[0] * W)}, {Math.round(cursor[1] * H)} px{/if}
    </span>
  </div>
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
    cursor: crosshair;
  }
  .viewport.tool-select {
    cursor: default;
  }
  .viewport.tool-bulk {
    cursor: cell;
  }
  .viewport.panning {
    cursor: grabbing;
  }
  .content {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    background: #f3ead7;
  }
  img,
  svg {
    position: absolute;
    inset: 0;
    display: block;
  }
  polygon {
    fill: rgb(139 46 34 / 0.1);
    stroke: #8b2e22;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  polygon.selected {
    fill: rgb(214 69 45 / 0.28);
    stroke: #d6452d;
    stroke-width: 2.5;
  }
  polygon.blocked {
    fill: rgb(40 40 40 / 0.28);
    stroke: #333;
    stroke-dasharray: 4 3;
  }
  .draft {
    fill: rgb(30 90 160 / 0.15);
    stroke: #1e5aa0;
    stroke-width: 2;
    stroke-dasharray: 6 4;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  polyline.draft {
    fill: none;
  }
  .ghost {
    stroke-dasharray: 3 3;
  }
  text {
    fill: #2b2118;
    stroke: #fffaf0;
    paint-order: stroke;
    text-anchor: middle;
    dominant-baseline: middle;
    font-family: system-ui, sans-serif;
    font-weight: 600;
    pointer-events: none;
  }
  .handle {
    fill: #fff;
    stroke: #d6452d;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    cursor: move;
  }
  .handle.mid {
    fill: #d6452d;
    stroke: #fff;
    opacity: 0.7;
    cursor: copy;
  }
  .handle.close {
    fill: #1e5aa0;
    stroke: #fff;
    pointer-events: none;
  }
  .anchor {
    cursor: move;
  }
  .anchor circle {
    fill: rgb(255 255 255 / 0.6);
    stroke: #1e5aa0;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .anchor path {
    stroke: #1e5aa0;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .missing {
    position: absolute;
    left: 50%;
    top: 40%;
    transform: translate(-50%, -50%);
    max-width: 80%;
    margin: 0;
    padding: 12px 16px;
    background: #fffaf0;
    border: 1px solid #b9a787;
    border-radius: 6px;
    font-size: 14px;
    text-align: center;
    pointer-events: none;
  }
  .status {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 8px;
    background: rgb(43 33 24 / 0.75);
    color: #f6f0e2;
    font-size: 12px;
    pointer-events: none;
  }
  .num {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
</style>
