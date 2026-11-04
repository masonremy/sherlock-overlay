<script lang="ts">
  import { COMPONENT_LABELS, COMPONENTS } from "../../shared/layout";
  import type { Layout } from "../../shared/schema";

  // Setup aid: outlines every layout box on stream (components and reserved
  // areas) so the scene can be lined up before going live.

  let { layout }: { layout: Layout } = $props();
</script>

{#each COMPONENTS as id (id)}
  {@const r = layout.components[id]}
  <div class="guide" class:off={!r.visible} style="left:{r.x}px;top:{r.y}px;width:{r.w}px;height:{r.h}px">
    <span>{COMPONENT_LABELS[id]} · {r.w}×{r.h}</span>
  </div>
{/each}
{#each layout.reserved as r (r.id)}
  <div class="guide reserved" style="left:{r.x}px;top:{r.y}px;width:{r.w}px;height:{r.h}px">
    <span>Reserved: {r.name || r.id}</span>
  </div>
{/each}

<style>
  .guide {
    position: absolute;
    z-index: 100;
    box-sizing: border-box;
    border: 3px dashed #1e5aa0;
    pointer-events: none;
  }
  .guide.off {
    border-color: #888;
    opacity: 0.6;
  }
  .guide.reserved {
    border-color: #b8860b;
    background: repeating-linear-gradient(45deg, rgb(184 134 11 / 0.18) 0 12px, transparent 12px 24px);
  }
  span {
    position: absolute;
    left: 4px;
    top: 4px;
    padding: 2px 8px;
    background: #1e5aa0;
    color: #fff;
    font: 600 16px system-ui, sans-serif;
  }
  .reserved span {
    background: #b8860b;
  }
</style>
