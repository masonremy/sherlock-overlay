<script lang="ts">
  import type { Note } from "../../../shared/schema";

  // Tag marks for notes: clue (magnifying glass), question (?), theory (∴).

  let { tag, size = 20 }: { tag: NonNullable<Note["tag"]>; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" class={tag} role="img" aria-label={tag}>
  <circle cx="12" cy="12" r="11" class="disc" />
  {#if tag === "clue"}
    <circle cx="10.5" cy="10.5" r="4.5" class="line" />
    <path d="M14 14 L18 18" class="line thick" />
  {:else if tag === "question"}
    <path d="M9 9.5 C9 6.5 15 6.5 15 9.5 C15 11.5 12 12 12 14" class="line" />
    <circle cx="12" cy="17.5" r="1.3" class="ink" />
  {:else}
    <circle cx="12" cy="7.5" r="1.8" class="ink" />
    <circle cx="7.5" cy="15.5" r="1.8" class="ink" />
    <circle cx="16.5" cy="15.5" r="1.8" class="ink" />
  {/if}
</svg>

<style>
  svg {
    display: inline-block;
    flex: none;
    vertical-align: -0.2em;
  }
  .disc {
    fill: var(--paper-light);
    stroke-width: 1.8;
  }
  .clue .disc {
    stroke: var(--wax);
  }
  .question .disc {
    stroke: #2b6cb0;
  }
  .theory .disc {
    stroke: var(--gold);
  }
  .line {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
    stroke-linecap: round;
  }
  .thick {
    stroke-width: 2.6;
  }
  .ink {
    fill: var(--ink);
  }
</style>
