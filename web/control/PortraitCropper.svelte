<script lang="ts">
  import { onDestroy } from "svelte";
  import { cropToBlob, type SquareCrop } from "../lib/portraitImage";

  // Drag to position, wheel or slider to zoom; the square is what's kept.

  let { img, onDone, onCancel }: { img: HTMLImageElement; onDone: (blob: Blob) => void; onCancel: () => void } = $props();

  const BOX = 220;
  const w = $derived(img.naturalWidth);
  const h = $derived(img.naturalHeight);
  const minScale = $derived(BOX / Math.min(w, h));
  let zoom = $state(1); // 1 = the short side fills the box
  let ox = $state(0);
  let oy = $state(0);
  let busy = $state(false);
  const scale = $derived(minScale * zoom);

  function clamp() {
    ox = Math.min(0, Math.max(BOX - w * scale, ox));
    oy = Math.min(0, Math.max(BOX - h * scale, oy));
  }

  // Start centred.
  $effect(() => {
    ox = (BOX - w * minScale) / 2;
    oy = (BOX - h * minScale) / 2;
  });

  function setZoom(z: number, cx = BOX / 2, cy = BOX / 2) {
    const next = Math.min(4, Math.max(1, z));
    const k = (minScale * next) / scale;
    ox = cx - (cx - ox) * k;
    oy = cy - (cy - oy) * k;
    zoom = next;
    clamp();
  }

  let drag: { x: number; y: number; ox: number; oy: number } | null = null;
  function down(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, ox, oy };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    ox = drag.ox + e.clientX - drag.x;
    oy = drag.oy + e.clientY - drag.y;
    clamp();
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setZoom(zoom * Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top);
  }

  async function done() {
    busy = true;
    const crop: SquareCrop = { x: -ox / scale, y: -oy / scale, size: BOX / scale };
    try {
      onDone(await cropToBlob(img, crop));
    } finally {
      busy = false;
    }
  }

  onDestroy(() => URL.revokeObjectURL(img.src));
</script>

<div class="cropper">
  <div
    class="box"
    style:width="{BOX}px"
    style:height="{BOX}px"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={() => (drag = null)}
    onwheel={wheel}
    role="presentation"
  >
    <img
      src={img.src}
      alt=""
      draggable="false"
      style:width="{w * scale}px"
      style:height="{h * scale}px"
      style:transform="translate({ox}px, {oy}px)"
    />
    <span class="circle"></span>
  </div>
  <label class="zoom">
    Zoom
    <input type="range" min="1" max="4" step="0.01" value={zoom} oninput={(e) => setZoom(Number(e.currentTarget.value))} />
  </label>
  <div class="row">
    <button type="button" class="primary" onclick={done} disabled={busy}>{busy ? "Saving…" : "Use this crop"}</button>
    <button type="button" onclick={onCancel}>Cancel</button>
  </div>
</div>

<style>
  .cropper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .box {
    position: relative;
    overflow: hidden;
    background: #222;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  img {
    position: absolute;
    left: 0;
    top: 0;
    max-width: none;
  }
  .circle {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    box-shadow: 0 0 0 999px rgb(0 0 0 / 0.45);
    pointer-events: none;
  }
  .zoom {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .primary {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
</style>
