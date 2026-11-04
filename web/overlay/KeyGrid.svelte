<script lang="ts">
  import type { LetterKey, TrailStep } from "../../shared/schema";

  // Letter tiles: locked ones show a padlock; unlocking flips the tile to a
  // gold edge and stamps "from step N". Columns reflow with the box width.

  interface Props {
    keys: LetterKey[];
    trail: TrailStep[];
    width: number;
    height: number;
    /** False for the first render, so loading the page doesn't replay every flip. */
    animate: boolean;
  }

  let { keys, trail, width, height, animate }: Props = $props();

  const PAD = 12;
  const GAP = 10;
  const n = $derived(Math.max(1, keys.length));
  // Largest tile that fits every key in the box.
  const tile = $derived.by(() => {
    for (let size = 84; size > 30; size -= 2) {
      const cols = Math.max(1, Math.floor((width - 2 * PAD + GAP) / (size + GAP)));
      const rows = Math.ceil(n / cols);
      if (rows * (size * 1.3 + GAP) - GAP <= height - 2 * PAD) return size;
    }
    return 30;
  });
  const stepNo = (id: string | null) => (id ? trail.findIndex((t) => t.id === id) + 1 : 0);

  function flipIn(_node: Element, { enabled }: { enabled: boolean }) {
    if (!enabled) return { duration: 0 };
    return {
      duration: 650,
      css: (t: number) => `transform: perspective(400px) rotateY(${(1 - t) * 180}deg); filter: brightness(${1 + (1 - t) * 0.6})`,
    };
  }
</script>

<div class="grid" style:padding="{PAD}px" style:gap="{GAP}px">
  {#each keys as k (k.letter)}
    <div class="slot" style:width="{tile}px">
      {#key k.unlocked}
        <div class="tile" class:unlocked={k.unlocked} style:width="{tile}px" style:height="{tile}px" in:flipIn={{ enabled: animate && k.unlocked }}>
          <span class="letter" style:font-size="calc({tile * 0.55}px * var(--fs, 1))">{k.letter}</span>
          {#if !k.unlocked}
            <svg class="lock" viewBox="0 0 24 24" width={tile * 0.32} height={tile * 0.32} aria-hidden="true">
              <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.4" />
              <rect x="4.5" y="10" width="15" height="11" rx="2" fill="currentColor" />
            </svg>
          {/if}
        </div>
      {/key}
      <small style:font-size="{Math.max(12, tile * 0.2)}px">
        {k.unlocked && stepNo(k.unlockedAtStep) ? `from step ${stepNo(k.unlockedAtStep)}` : " "}
      </small>
    </div>
  {/each}
</div>

<style>
  .grid {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
  }
  .slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .tile {
    position: relative;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    border-radius: 6px;
    background: #d9cdb2;
    border: 2px solid #a8977a;
    color: #8a7a62;
  }
  .tile.unlocked {
    background: linear-gradient(145deg, #fffaf0, #f3e3b8);
    border: 3px solid #b08d2b;
    box-shadow: 0 0 0 2px rgb(176 141 43 / 0.25), 0 3px 8px rgb(0 0 0 / 0.25);
    color: #2b2118;
  }
  .letter {
    font-family: var(--font-display);
    line-height: 1;
  }
  .lock {
    position: absolute;
    right: 4px;
    bottom: 4px;
    color: #6b5a44;
  }
  small {
    color: #6b5a44;
    white-space: nowrap;
  }
</style>
