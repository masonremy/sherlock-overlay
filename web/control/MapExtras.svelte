<script lang="ts">
  import type { Informant, MapDef, Zone } from "../../shared/schema";
  import { newId } from "../lib/cast";
  import type { Connection } from "../lib/socket";

  // Per-map extras saved with the map definition: informant shortcuts (the
  // recurring helpers and their addresses) and, for timesheet mode, which
  // areas border which.

  let { conn, map, selected }: { conn: Connection; map: MapDef; selected: Zone | null } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { dispatch } = conn;

  let name = $state("");
  const setInformants = (informants: Informant[]) => dispatch({ type: "map/setInformants", mapId: map.id, informants });
  function add() {
    if (!name.trim() || !selected) return;
    setInformants([...map.informants, { id: newId("i"), name: name.trim(), zoneId: selected.id }]);
    name = "";
  }
  const zoneLabel = (id: string) => map.zones.find((z) => z.id === id)?.label ?? "?";

  const districts = $derived([...new Set(map.zones.map((z) => z.district).filter(Boolean))].sort());
  function setNeighbours(d: string, text: string) {
    const list = text.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter((s) => s && s !== d);
    const adjacency = { ...map.adjacency, [d]: [...new Set(list)] };
    if (!adjacency[d].length) delete adjacency[d];
    dispatch({ type: "map/setAdjacency", mapId: map.id, adjacency });
  }
</script>

<section class="card">
  <strong>Informants</strong>
  <p class="hint">Recurring helpers with fixed addresses. They show as one-tap shortcuts above the map while playing.</p>
  <ul>
    {#each map.informants as i (i.id)}
      <li>
        {i.name} <small>{zoneLabel(i.zoneId)}</small>
        <button type="button" aria-label="Remove {i.name}" onclick={() => setInformants(map.informants.filter((x) => x.id !== i.id))}>×</button>
      </li>
    {/each}
  </ul>
  <div class="row">
    <input bind:value={name} placeholder="Scotland Yard" maxlength="60" onkeydown={(e) => e.key === "Enter" && add()} />
    <button type="button" onclick={add} disabled={!name.trim() || !selected} title={selected ? "" : "Select the zone first"}>
      at {selected?.label ?? "selected zone"}
    </button>
  </div>
</section>

{#if districts.length > 1}
  <section class="card">
    <strong>Area adjacency (timesheet)</strong>
    <p class="hint">Which areas border each one, e.g. WC: EC, NW. Moving costs 15 min within or to a neighbouring area, plus 15 per area crossed.</p>
    {#each districts as d (d)}
      <label>
        <span>{d}</span>
        <input value={(map.adjacency[d] ?? []).join(", ")} placeholder="neighbours" onchange={(e) => setNeighbours(d, e.currentTarget.value)} />
      </label>
    {/each}
  </section>
{/if}

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    background: #fbf6ea;
    border: 1px solid #d8c9aa;
    border-radius: 6px;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: #6b5a44;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 13px;
  }
  li {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  li small {
    color: #6b5a44;
  }
  li button {
    margin-left: auto;
    padding: 0 6px;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  input {
    flex: 1;
    min-width: 0;
    padding: 5px;
    font: inherit;
    font-size: 13px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
  }
  label {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 13px;
  }
  label span {
    width: 40px;
    font-weight: 600;
  }
</style>
