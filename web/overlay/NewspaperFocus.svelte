<script lang="ts">
  import { Tween } from "svelte/motion";
  import { cubicInOut } from "svelte/easing";
  import type { Paper } from "../../shared/schema";
  import { fitView, frameBox, type View } from "../lib/mapMath";
  import { ms } from "../lib/motion.svelte";

  // The open newspaper: the whole page, or zoomed onto one article. A shelf
  // underneath shows the earlier papers the rules allow, the open one lit.

  interface Props {
    paper: Paper;
    shelf: Paper[];
    zoom: { x: number; y: number; w: number; h: number } | null;
    width: number;
    height: number;
  }

  let { paper, shelf, zoom, width, height }: Props = $props();

  const SHELF_H = 54;
  const pageH = $derived(shelf.length > 1 ? height - SHELF_H : height);
  let size = $state<[number, number]>([1000, 1400]);
  const [W, H] = $derived(size);
  const fit = $derived(fitView(W, H, width, pageH, 6));
  const target = $derived(
    zoom ? frameBox([zoom.x * W, zoom.y * H, (zoom.x + zoom.w) * W, (zoom.y + zoom.h) * H], W, H, width, pageH, fit.scale, fit.scale * 8) : fit,
  );
  const view = new Tween<View>({ scale: 0.1, tx: 0, ty: 0 }, { easing: cubicInOut });
  let placed = false;
  $effect(() => {
    const t = target;
    view.set(t, { duration: placed ? ms(700) : 0 });
    placed = true;
  });

  const label = (p: Paper) =>
    p.date ? new Date(`${p.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : p.title || "Paper";
</script>

<div class="paper" style:width="{width}px" style:height="{height}px">
  <div class="page" style:height="{pageH}px">
    <img
      src="/papers/{paper.file}"
      alt=""
      onload={(e) => {
        const img = e.currentTarget as HTMLImageElement;
        size = [img.naturalWidth, img.naturalHeight];
      }}
      style:width="{W}px"
      style:height="{H}px"
      style:transform="translate({view.current.tx}px, {view.current.ty}px) scale({view.current.scale})"
    />
  </div>
  {#if shelf.length > 1}
    <div class="shelf" style:height="{SHELF_H}px">
      {#each shelf as p (p.id)}
        <span class:on={p.id === paper.id}>{label(p)}{#if p.title && p.date}<small> · {p.title}</small>{/if}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .paper {
    display: flex;
    flex-direction: column;
  }
  .page {
    position: relative;
    overflow: hidden;
  }
  img {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.35);
  }
  .shelf {
    display: flex;
    gap: 8px;
    align-items: center;
    overflow: hidden;
    padding-top: 8px;
    box-sizing: border-box;
    font-family: var(--font-body);
    font-size: calc(18px * var(--fs, 1));
    white-space: nowrap;
  }
  .shelf span {
    padding: 4px 12px;
    border: 1.5px solid var(--sepia);
    border-radius: 3px;
    color: var(--ink-soft);
  }
  .shelf span.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }
</style>
