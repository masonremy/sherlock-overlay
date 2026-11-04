<svelte:options namespace="svg" />

<script lang="ts">
  import { fade } from "svelte/transition";
  import type { Character } from "../../shared/schema";
  import { defaultCameo, STATUS_COLORS } from "./cast";
  import { cameoPath } from "./cameo";

  // A character's face: their portrait in a status-coloured ring, or a cameo
  // silhouette in a status-coloured oval frame. Renders its own <svg>, so it
  // works in HTML and nested inside another SVG (pins on the map).

  interface Props {
    character: Pick<Character, "id" | "name" | "portrait" | "cameo" | "status">;
    size: number;
    x?: number;
    y?: number;
    /** Draw the status ring/frame. */
    ring?: boolean;
    svgEl?: SVGSVGElement;
  }

  let { character, size, x, y, ring = true, svgEl = $bindable() }: Props = $props();

  const uid = `av${Math.random().toString(36).slice(2, 9)}`;
  const color = $derived(STATUS_COLORS[character.status]);
  const cameo = $derived(character.cameo ?? defaultCameo(character.id));
</script>

<svg bind:this={svgEl} {x} {y} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={character.name}>
  <defs>
    <clipPath id="{uid}-c"><circle cx="50" cy="50" r="45" /></clipPath>
    <clipPath id="{uid}-e"><ellipse cx="50" cy="50" rx="38" ry="46" /></clipPath>
  </defs>
  {#if character.portrait}
    <circle cx="50" cy="50" r="47" fill="#f1e6cc" />
    {#key character.portrait}
      <image
        href="/portraits/{character.portrait}"
        x="5"
        y="5"
        width="90"
        height="90"
        preserveAspectRatio="xMidYMid slice"
        clip-path="url(#{uid}-c)"
        in:fade={{ duration: 500 }}
      />
    {/key}
    {#if ring}<circle cx="50" cy="50" r="46" fill="none" stroke={color} stroke-width="7" />{/if}
  {:else}
    <ellipse cx="50" cy="50" rx="40" ry="48" fill="#f1e6cc" />
    <path d={cameoPath(cameo)} fill="#2b2118" clip-path="url(#{uid}-e)" />
    {#if ring}<ellipse cx="50" cy="50" rx="40" ry="47.5" fill="none" stroke={color} stroke-width="6" />{/if}
  {/if}
</svg>
