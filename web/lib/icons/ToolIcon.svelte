<script lang="ts">
  // Toolkit icons: folded map, folded newspaper, notebook. Ink line, 2 px
  // stroke at 48 px, sepia fill; "open" is the lit state of the item in focus.
  // A wax dot marks something unseen.

  interface Props {
    kind: "map" | "newspaper" | "notes";
    size?: number;
    state?: "folded" | "open";
    dot?: boolean;
  }

  let { kind, size = 48, state = "folded", dot = false }: Props = $props();
  const open = $derived(state === "open");
</script>

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

<style>
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
  .seal {
    fill: var(--wax);
  }
  .dot {
    fill: var(--wax);
    stroke: var(--paper-light);
    stroke-width: 2;
  }
</style>
