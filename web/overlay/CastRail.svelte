<script lang="ts">
  import { flip } from "svelte/animate";
  import { fly } from "svelte/transition";
  import type { Character, MapDef } from "../../shared/schema";
  import Avatar from "../lib/Avatar.svelte";
  import { STATUS_COLORS, STATUS_LABELS } from "../lib/cast";
  import { ms } from "../lib/motion.svelte";

  // Portraits in order of first appearance. Goes vertical or horizontal with
  // the box's shape and shrinks cards to fit everyone.

  interface Props {
    characters: Character[];
    maps: Record<string, MapDef>;
    width: number;
    height: number;
  }

  let { characters, maps, width, height }: Props = $props();

  const PAD = 12;
  const GAP = 8;
  const vertical = $derived(height >= width);
  const n = $derived(Math.max(1, characters.length));
  // Vertical: rows of avatar + text. Horizontal: columns of avatar over name.
  const card = $derived(
    vertical
      ? Math.min(110, Math.max(54, (height - 2 * PAD - GAP * (n - 1)) / n))
      : Math.min(150, Math.max(70, (width - 2 * PAD - GAP * (n - 1)) / n)),
  );
  const avatar = $derived(vertical ? card - 8 : Math.min(card - 10, height - 2 * PAD - 44));

  const address = (c: Character) => {
    const a = c.address;
    return a ? (maps[a.mapId]?.zones.find((z) => z.id === a.zoneId)?.label ?? "") : "";
  };
</script>

<div class="rail" class:vertical style:padding="{PAD}px" style:gap="{GAP}px">
  {#each characters as c (c.id)}
    <div
      class="card"
      style:--size="{card}px"
      animate:flip={{ duration: ms(400) }}
      in:fly={{ x: vertical ? -120 : 0, y: vertical ? 0 : 60, duration: ms(500) }}
    >
      <Avatar character={c} size={avatar} />
      <div class="text">
        <strong>{c.name}</strong>
        {#if c.role}<span>{c.role}</span>{/if}
        <span class="status" style:color={STATUS_COLORS[c.status]}>
          {STATUS_LABELS[c.status]}{#if address(c)}<em> · {address(c)}</em>{/if}
        </span>
      </div>
    </div>
  {/each}
</div>

<style>
  .rail {
    display: flex;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .rail.vertical {
    flex-direction: column;
  }
  .card {
    display: flex;
    flex: none;
    gap: 10px;
    align-items: center;
  }
  .vertical .card {
    height: var(--size);
  }
  .rail:not(.vertical) .card {
    flex-direction: column;
    width: var(--size);
    text-align: center;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.15;
  }
  strong {
    overflow: hidden;
    font-family: var(--font-display);
    font-size: calc(24px * var(--fs, 1));
    font-weight: 400;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  span {
    overflow: hidden;
    font-size: calc(17px * var(--fs, 1));
    color: #4a3b2a;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .status {
    font-size: calc(15px * var(--fs, 1));
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  em {
    color: #6b5a44;
    font-style: normal;
    font-weight: 400;
    text-transform: none;
  }
</style>
