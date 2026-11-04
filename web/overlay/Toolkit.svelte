<script lang="ts">
  import type { FocusItem } from "../lib/focus";
  import ToolIcon from "../lib/icons/ToolIcon.svelte";

  // The toolkit bar: one icon per focus item; the one in focus is lit.

  interface Props {
    items: FocusItem[];
    focus: FocusItem;
    dots: Partial<Record<FocusItem, boolean>>;
    /** Icon size in px; the overlay computes where each icon sits for fold animations. */
    iconSize: number;
  }

  let { items, focus, dots, iconSize }: Props = $props();
  const LABELS: Record<FocusItem, string> = { map: "Map", newspaper: "Paper", notes: "Notes" };
</script>

<div class="toolkit">
  {#each items as item (item)}
    <div class="tool" class:on={item === focus}>
      <ToolIcon kind={item} size={iconSize} state={item === focus ? "open" : "folded"} dot={!!dots[item]} />
      <span>{LABELS[item]}</span>
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
    font-size: 13px;
    color: var(--ink);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
</style>
