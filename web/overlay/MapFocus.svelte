<script lang="ts">
  import { Tween } from "svelte/motion";
  import { cubicInOut } from "svelte/easing";
  import type { Point } from "../../shared/geometry";
  import type { MirrorView } from "../../shared/protocol";
  import type { Character, MapDef, TrailStep } from "../../shared/schema";
  import { fitView, frameBox, type View } from "../lib/mapMath";
  import { frameAnchors } from "../lib/trail";
  import TrailLayer from "../lib/TrailLayer.svelte";

  interface Props {
    map: MapDef;
    trail: TrailStep[];
    mode: "full" | "auto-frame" | "mirror";
    mirror: MirrorView | null;
    width: number;
    height: number;
    faces: Record<string, Character[]>;
    rings: string[];
  }

  let { map, trail, mode, mirror, width, height, faces, rings }: Props = $props();

  const [W, H] = $derived(map.imageSize);
  const fit = $derived(fitView(W, H, width, height, 6));

  // What the viewport should show; the tween animates toward it.
  const target = $derived.by((): View => {
    if (mode === "mirror" && mirror?.mapId === map.id) {
      const [x0, y0, x1, y1] = mirror.rect;
      return frameBox([x0 * W, y0 * H, x1 * W, y1 * H], W, H, width, height, fit.scale, fit.scale * 8);
    }
    if (mode === "auto-frame") {
      const anchors = Object.fromEntries(map.zones.map((z) => [z.id, z.anchor])) as Record<string, Point>;
      const pts = frameAnchors(trail, map.id, anchors, 3).map(([x, y]) => [x * W, y * H]);
      if (pts.length) {
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        // Pad around the steps; never zoom in so far that a single step fills the view.
        const padX = Math.max((Math.max(...xs) - Math.min(...xs)) * 0.35, W * 0.08);
        const padY = Math.max((Math.max(...ys) - Math.min(...ys)) * 0.35, H * 0.08);
        const box: [number, number, number, number] = [
          Math.min(...xs) - padX,
          Math.min(...ys) - padY,
          Math.max(...xs) + padX,
          Math.max(...ys) + padY,
        ];
        return frameBox(box, W, H, width, height, fit.scale, fit.scale * 5);
      }
    }
    return fit;
  });

  const view = new Tween<View>({ scale: 1, tx: 0, ty: 0 }, { easing: cubicInOut });
  let placed = false;
  $effect(() => {
    const t = target;
    // First frame jumps; afterwards ease, quickly when following the panel live.
    view.set(t, { duration: !placed ? 0 : mode === "mirror" ? 250 : 900 });
    placed = true;
  });
</script>

<div class="mapbox" style:width="{width}px" style:height="{height}px">
  <div
    class="content"
    style:width="{W}px"
    style:height="{H}px"
    style:transform="translate({view.current.tx}px, {view.current.ty}px) scale({view.current.scale})"
  >
    <img src="/maps/{map.image}" width={W} height={H} alt="" />
  </div>
  <TrailLayer {trail} {map} {faces} {rings} view={view.current} {width} {height} pinSize={15} idPrefix="ov" />
</div>

<style>
  .mapbox {
    position: relative;
    overflow: hidden;
    border-radius: 3px;
  }
  .content {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }
  img {
    display: block;
  }
</style>
