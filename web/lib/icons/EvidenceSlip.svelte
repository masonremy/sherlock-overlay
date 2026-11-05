<script lang="ts">
  // Evidence slip: a paper tag with a punched hole and string, for clue cards.
  // Ink line, 2 px at 48 px, sepia fill, like the rest of the icon set.

  let { size = 24 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
  <path class="string" d="M15 15 C9 9 6 6 3 6" />
  <path class="slip" d="M12 18 L18 9 H43 V41 H18 L12 32 Z" />
  <circle class="hole" cx="18.5" cy="25" r="2.6" />
  <path class="lines" d="M24 19 H38 M24 25 H38 M24 31 H34" />
</svg>

<style>
  svg {
    display: inline-block;
    flex: none;
    vertical-align: -0.2em;
  }
  .slip {
    fill: var(--sepia-light, #e3d3ad);
    stroke: var(--ink, #2b2118);
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .hole {
    fill: var(--paper-light, #fbf6ea);
    stroke: var(--ink, #2b2118);
    stroke-width: 1.5;
  }
  .lines {
    fill: none;
    stroke: var(--sepia, #8a7354);
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .string {
    fill: none;
    stroke: var(--wax, #9b1c1c);
    stroke-width: 1.6;
  }
</style>
