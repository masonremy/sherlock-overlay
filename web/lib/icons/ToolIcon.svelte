<script lang="ts">
  import type { ToolItem } from "../focus";
  import { customIcons, loadCustomIcons } from "./customIcons.svelte";
  // Toolkit icons: folded map, folded newspaper, notebook, directory (thumb-
  // indexed book) and informants (a calling card with a bust; placeholders). Ink line, 2 px
  // stroke at 48 px, sepia fill; "open" is the lit state of the item in focus.
  // A wax dot marks something unseen.

  interface Props {
    kind: ToolItem;
    size?: number;
    state?: "folded" | "open";
    dot?: boolean;
  }

  let { kind, size = 48, state = "folded", dot = false }: Props = $props();
  const open = $derived(state === "open");

  // The streamer's own artwork (icons/<kind>.png) replaces the drawing when present.
  loadCustomIcons();
  const custom = $derived(customIcons[kind]);
</script>

{#if custom}
  <span class="custom" class:open style:width="{size}px" style:height="{size}px" aria-hidden="true">
    <img src={custom} alt="" draggable="false" />
    {#if dot}<span class="cdot"></span>{/if}
  </span>
{:else}
<svg class="icon" class:open width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
  {#if kind === "map"}
    {#if open}
      <path class="fill" d="M5 12 L17 8 L31 12 L43 8 V38 L31 42 L17 38 L5 42 Z" />
      <path class="line" d="M17 8 V38 M31 12 V42" />
      <path class="accent" d="M10 30 C15 24 20 32 26 25 S35 20 38 16" />
      <circle class="seal" cx="38" cy="16" r="3" />
    {:else}
      <path class="fill" d="M13 10 L25 6 L35 10 V40 L25 44 L13 40 Z" />
      <path class="line" d="M25 6 V44" />
      <path class="faint" d="M17 18 H22 M28 20 H32 M17 26 H21" />
    {/if}
  {:else if kind === "newspaper"}
    {#if open}
      <rect class="fill" x="5" y="8" width="38" height="32" rx="1.5" />
      <path class="line" d="M24 8 V40" />
      <path class="accent" d="M9 13 H39" />
      <path class="faint" d="M9 19 H20 M9 23 H20 M9 27 H20 M9 31 H18 M28 19 H39 M28 23 H39 M28 27 H39 M28 31 H36" />
    {:else}
      <path class="fill" d="M11 9 H37 V39 H11 Z" />
      <path class="line" d="M11 24 H37" />
      <path class="accent" d="M15 14 H33" />
      <path class="faint" d="M15 18 H29 M15 29 H33 M15 33 H27" />
    {/if}
  {:else if kind === "directory"}
    {#if open}
      <path class="fill" d="M4 10 C11 8 18 9 24 12 C30 9 37 8 44 10 V40 C37 38 30 39 24 42 C18 39 11 38 4 40 Z" />
      <path class="line" d="M24 12 V42" />
      <path class="faint" d="M8 17 H14 M8 21 H20 M8 25 H20 M8 29 H20 M8 33 H17 M28 17 H40 M28 21 H40 M28 25 H40 M28 29 H36" />
      <path class="accent" d="M44 14 V20 M44 24 V30" />
    {:else}
      <rect class="fill" x="10" y="6" width="26" height="36" rx="2" />
      <path class="line" d="M15 6 V42" />
      <path class="tab" d="M36 9 H40 V15 H36 M36 18 H40 V24 H36 M36 27 H40 V33 H36" />
      <path class="accent" d="M20 14 H31" />
      <path class="faint" d="M20 19 H29 M20 23 H31 M20 27 H27" />
    {/if}
  {:else if kind === "informants"}
    {#if open}
      <rect class="fill" x="4" y="10" width="40" height="28" rx="2" />
      <circle class="line" cx="15" cy="21" r="4" />
      <path class="line" d="M8 32 C9 27 21 27 22 32" />
      <path class="faint" d="M27 18 H39 M27 23 H39 M27 28 H35" />
      <path class="accent" d="M8 14 H40" />
    {:else}
      <rect class="fill" x="8" y="12" width="32" height="24" rx="2" />
      <circle class="line" cx="18" cy="21" r="3.5" />
      <path class="line" d="M12 31 C13 27 23 27 24 31" />
      <path class="faint" d="M28 19 H35 M28 24 H35" />
      <path class="accent" d="M12 15.5 H36" />
    {/if}
  {:else if open}
    <path class="fill" d="M4 12 C11 9 18 10 24 13 C30 10 37 9 44 12 V40 C37 37 30 38 24 41 C18 38 11 37 4 40 Z" />
    <path class="line" d="M24 13 V41" />
    <path class="faint" d="M8 18 H20 M8 23 H20 M8 28 H18 M28 18 H40 M28 23 H40 M28 28 H37" />
  {:else}
    <rect class="fill" x="11" y="6" width="27" height="36" rx="2" />
    <path class="line" d="M16 6 V42" />
    <path class="accent" d="M33 6 V42" />
    <path class="faint" d="M20 15 H32 M20 20 H30" />
  {/if}
  {#if dot}<circle class="dot" cx="41" cy="8" r="5" />{/if}
</svg>
{/if}

<style>
  .custom {
    position: relative;
    display: block;
  }
  .custom img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    /* Folded (not in focus): colour a little muted (the toolkit fades it too). */
    filter: saturate(0.75);
    transition:
      transform 300ms,
      filter 300ms,
      opacity 300ms;
  }
  /* Open (in focus): full colour, a touch larger, with a warm glow. */
  .custom.open img {
    filter: drop-shadow(0 0 3px rgb(176 141 43 / 0.7));
    opacity: 1;
    transform: scale(1.08);
  }
  .cdot {
    position: absolute;
    top: 0;
    right: 0;
    width: 22%;
    height: 22%;
    border-radius: 50%;
    background: var(--wax);
    box-shadow: 0 0 0 2px var(--paper-light);
  }
  .icon {
    display: block;
    overflow: visible;
  }
  .fill {
    fill: var(--sepia-light);
    stroke: var(--ink);
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .open .fill {
    fill: var(--paper-light);
  }
  .line {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
  }
  .faint {
    fill: none;
    stroke: var(--sepia);
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .accent {
    fill: none;
    stroke: var(--wax);
    stroke-width: 2;
    stroke-linecap: round;
  }
  .tab {
    fill: var(--wax);
    stroke: var(--ink);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .seal {
    fill: var(--wax);
  }
  .dot {
    fill: var(--wax);
    stroke: var(--paper-light);
    stroke-width: 2;
  }
</style>
