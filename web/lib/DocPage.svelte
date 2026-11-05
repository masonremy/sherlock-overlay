<script lang="ts">
  import { onDestroy } from "svelte";
  import { Tween } from "svelte/motion";
  import { cubicInOut } from "svelte/easing";
  import type { PDFPageProxy, RenderTask } from "pdfjs-dist";
  import type { Box } from "./docSearch";
  import { loadPdf } from "./docs";
  import { ms } from "./motion.svelte";

  // One page of a PDF, showing the part given by `rect` ([x0, y0, x1, y1] in
  // page units; null = the whole page), with search
  // highlights laid over the words. Interactive in the panel: wheel scrolls,
  // Ctrl+wheel zooms, drag pans; each change is reported through onView.

  interface Props {
    file: string;
    page: number;
    rect: [number, number, number, number] | null;
    width: number;
    height: number;
    /** Every match on the page (faint) and the one being pointed at (strong). */
    highlights?: Box[];
    active?: Box[];
    onView?: (rect: [number, number, number, number]) => void;
    /** Ease view changes (overlay); the panel follows the pointer directly. */
    smooth?: boolean;
  }

  let { file, page, rect, width, height, highlights = [], active = [], onView, smooth = false }: Props = $props();

  let pdfPage = $state<PDFPageProxy | null>(null);
  let aspect = $state(1.4); // page height / width
  let canvas: HTMLCanvasElement;
  let renderTask: RenderTask | null = null;
  let renderedWidth = 0;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const f = file;
    const n = page;
    let cancelled = false;
    loadPdf(f)
      .then((doc) => doc.getPage(Math.min(n, doc.numPages)))
      .then((p) => {
        if (cancelled) return;
        const vp = p.getViewport({ scale: 1 });
        aspect = vp.height / vp.width;
        renderedWidth = 0;
        pdfPage = p;
      })
      .catch((err) => console.warn("[docs] could not open page", err));
    return () => (cancelled = true);
  });

  // Page width on screen and offset: fit the rect inside the viewport, centred.
  const target = $derived.by(() => {
    const [x0, y0, x1, y1] = rect ?? [0, 0, 1, 1];
    const pw = Math.max(1e-3, x1 - x0);
    const ph = Math.max(1e-3, y1 - y0);
    const P = Math.min(width / pw, height / (ph * aspect));
    // Centre the rect, then keep the page filling the frame where it's big enough to.
    const [X, Y] = clamp(-x0 * P + (width - pw * P) / 2, -y0 * P * aspect + (height - ph * P * aspect) / 2, P);
    return { P, X, Y };
  });
  const view = new Tween({ P: 1, X: 0, Y: 0 }, { easing: cubicInOut });
  let placed = false;
  $effect(() => {
    const t = target;
    view.set(t, { duration: placed && smooth ? ms(600) : 0 });
    placed = true;
  });

  // Re-render sharply when the zoom changes noticeably (not on every frame).
  $effect(() => {
    const p = pdfPage;
    const P = target.P;
    if (!p) return;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render(p, P), renderedWidth ? 180 : 0);
  });

  async function render(p: PDFPageProxy, P: number) {
    const dpr = window.devicePixelRatio || 1;
    const want = Math.min(4096, Math.round(P * dpr));
    if (renderedWidth && Math.abs(want - renderedWidth) / renderedWidth < 0.2) return;
    renderTask?.cancel();
    const base = p.getViewport({ scale: 1 });
    const viewport = p.getViewport({ scale: want / base.width });
    const off = document.createElement("canvas");
    off.width = Math.round(viewport.width);
    off.height = Math.round(viewport.height);
    const ctx = off.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, off.width, off.height);
    renderTask = p.render({ canvas: off, canvasContext: ctx, viewport });
    try {
      await renderTask.promise;
    } catch {
      return; // cancelled by a newer render
    }
    // Swap in one go, so the page never flashes blank.
    canvas.width = off.width;
    canvas.height = off.height;
    canvas.getContext("2d")!.drawImage(off, 0, 0);
    renderedWidth = want;
  }

  onDestroy(() => {
    clearTimeout(renderTimer);
    renderTask?.cancel();
  });

  // --- Panel interaction ---------------------------------------------------------------
  function currentRect(X: number, Y: number, P: number): [number, number, number, number] {
    const x0 = -X / P;
    const y0 = -Y / (P * aspect);
    return [x0, y0, x0 + width / P, y0 + height / (P * aspect)];
  }
  function clamp(X: number, Y: number, P: number) {
    const w = P;
    const h = P * aspect;
    const cx = w <= width ? (width - w) / 2 : Math.min(0, Math.max(width - w, X));
    const cy = h <= height ? (height - h) / 2 : Math.min(0, Math.max(height - h, Y));
    return [cx, cy] as const;
  }
  function emit(X: number, Y: number, P: number) {
    const [cx, cy] = clamp(X, Y, P);
    onView?.(currentRect(cx, cy, P));
  }
  function wheel(e: WheelEvent) {
    if (!onView) return;
    e.preventDefault();
    const { P, X, Y } = target;
    if (e.ctrlKey || e.metaKey) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const nextP = Math.min(width * 6, Math.max(width * 0.5, P * Math.exp(-e.deltaY * 0.002)));
      const k = nextP / P;
      emit(mx - (mx - X) * k, my - (my - Y) * k, nextP);
    } else {
      emit(X - e.deltaX, Y - e.deltaY, P);
    }
  }
  let drag: { x: number; y: number; X: number; Y: number } | null = null;
  function down(e: PointerEvent) {
    if (!onView) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, X: target.X, Y: target.Y };
  }
  function move(e: PointerEvent) {
    if (drag) emit(drag.X + e.clientX - drag.x, drag.Y + e.clientY - drag.y, target.P);
  }

  const pct = (b: Box) => `left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%`;
</script>

<div
  class="viewport"
  class:interactive={!!onView}
  style:width="{width}px"
  style:height="{height}px"
  onwheel={wheel}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={() => (drag = null)}
  role="presentation"
>
  <div
    class="page"
    style:width="{view.current.P}px"
    style:height="{view.current.P * aspect}px"
    style:transform="translate({view.current.X}px, {view.current.Y}px)"
  >
    <canvas bind:this={canvas}></canvas>
    {#each highlights as b, i (i)}<span class="hl" style={pct(b)}></span>{/each}
    {#each active as b, i (i)}<span class="hl active" style={pct(b)}></span>{/each}
  </div>
</div>

<style>
  .viewport {
    position: relative;
    overflow: hidden;
    background: #d9cfbc;
  }
  .viewport.interactive {
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .page {
    position: absolute;
    left: 0;
    top: 0;
    background: #fff;
    box-shadow: 0 3px 12px rgb(0 0 0 / 0.3);
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .hl {
    position: absolute;
    border-radius: 2px;
    background: rgb(255 214 0 / 0.38);
    mix-blend-mode: multiply;
    pointer-events: none;
  }
  .hl.active {
    background: rgb(255 170 0 / 0.55);
    outline: 3px solid rgb(214 69 45 / 0.85);
    outline-offset: 2px;
    animation: ping 1.4s ease-out 2;
  }
  @keyframes ping {
    0% {
      outline-offset: 12px;
      outline-color: rgb(214 69 45 / 0);
    }
    100% {
      outline-offset: 2px;
    }
  }
</style>
