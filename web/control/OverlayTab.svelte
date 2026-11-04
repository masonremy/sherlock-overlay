<script lang="ts">
  import type { Connection } from "../lib/socket";

  let { conn }: { conn: Connection } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch } = conn;

  const app = $derived($snapshot?.state);
  const caseMaps = $derived(app ? app.case.mapIds.map((id) => app.maps[id]).filter(Boolean) : []);

  const MODES = [
    { id: "full", label: "Full map", hint: "Always shows the whole map." },
    { id: "auto-frame", label: "Auto-frame", hint: "Zooms to the last 3 steps and follows each new one." },
    { id: "mirror", label: "Mirror panel", hint: "Shows exactly what the panel map shows, live." },
  ] as const;
</script>

{#if app}
  <div class="tab">
    <fieldset>
      <legend>Overlay map view</legend>
      {#each MODES as m (m.id)}
        <label>
          <input
            type="radio"
            name="mapView"
            checked={app.overlay.mapView === m.id}
            onchange={() => dispatch({ type: "overlay/setMapView", mode: m.id })}
          />
          <span><strong>{m.label}</strong> <small>{m.hint}</small></span>
        </label>
      {/each}
    </fieldset>

    {#if caseMaps.length > 1}
      <label class="stack">
        Map shown on the overlay
        <select
          value={app.overlay.mapId ?? ""}
          onchange={(e) => dispatch({ type: "overlay/setMap", mapId: e.currentTarget.value || null })}
        >
          <option value="">Follow the trail (latest step's map)</option>
          {#each caseMaps as m (m.id)}<option value={m.id}>{m.name || m.id}</option>{/each}
        </select>
        <small>In mirror mode the overlay shows whichever map the panel is on.</small>
      </label>
    {/if}
  </div>
{/if}

<style>
  .tab {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  fieldset {
    margin: 0;
    padding: 8px 10px;
    border: 1px solid #d8c9aa;
    border-radius: 6px;
  }
  legend {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b5a44;
  }
  label {
    display: flex;
    gap: 8px;
    align-items: baseline;
    padding: 4px 0;
    font-size: 14px;
  }
  small {
    display: block;
    color: #6b5a44;
    font-size: 12px;
  }
  .stack {
    flex-direction: column;
    gap: 4px;
  }
  select {
    width: 100%;
    padding: 6px;
    font: inherit;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
  }
</style>
