<script lang="ts">
  import type { FocusItem, ToolItem } from "../lib/focus";
  import ToolIcon from "../lib/icons/ToolIcon.svelte";

  // The toolkit bar: one icon per focus item; the one in focus is lit.

  interface Props {
    items: ToolItem[];
    focus: FocusItem;
    dots: Partial<Record<ToolItem, boolean>>;
    /** Icon size in px; the overlay computes where each icon sits for fold animations. */
    iconSize: number;
    /** Names under the icons (off when the box is too small for them). */
    labels?: boolean;
  }

  let { items, focus, dots, iconSize, labels = true }: Props = $props();
  const LABELS: Record<ToolItem, string> = { map: "Map", newspaper: "Paper", notes: "Notes", directory: "Directory", informants: "Informants" };
</script>

<div class="toolkit">
  {#each items as item (item)}
    <div class="tool" class:on={item === focus}>
      <ToolIcon kind={item} size={iconSize} state={item === focus ? "open" : "folded"} dot={!!dots[item]} />
      {#if labels}<span>{LABELS[item]}</span>{/if}
    </div>
  {/each}
</div>

<style>
  .toolkit {
    display: flex;
    gap: 6px;
    justify-content: space-around;
    align-items: center;
    height: 100%;
    padding: 0 8px;
    box-sizing: border-box;
  }
  .tool {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 2px 6px 0;
    border-bottom: 3px solid transparent;
    opacity: 0.7;
    transition: opacity 300ms, border-color 300ms;
  }
  .tool.on {
    opacity: 1;
    border-bottom-color: var(--gold);
  }
  span {
    font-family: var(--font-body);
    font-size: calc(13px * var(--fs, 1));
    color: var(--ink);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }
</style>
