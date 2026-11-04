<script lang="ts">
  import type { Zone, ZonePatch } from "../../shared/schema";

  interface Props {
    zone: Zone;
    districts: string[];
    onUpdate: (patch: ZonePatch) => void;
    onDelete: () => void;
    onResetAnchor: () => void;
  }

  let { zone, districts, onUpdate, onDelete, onResetAnchor }: Props = $props();

  // Text fields commit on Enter/blur (change event); Esc restores the stored value.
  function commit(field: "label" | "district", input: HTMLInputElement) {
    const value = input.value.trim();
    if (field === "label" && !value) input.value = zone.label;
    else if (value !== zone[field]) onUpdate({ [field]: value });
  }

  function onKey(e: KeyboardEvent, field: "label" | "district") {
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      input.value = zone[field];
      input.blur();
    }
  }
</script>

<div class="inspector">
  <div class="row">
    <label>
      Label
      <input
        value={zone.label}
        maxlength="60"
        onchange={(e) => commit("label", e.currentTarget)}
        onkeydown={(e) => onKey(e, "label")}
      />
    </label>
    <label class="district">
      District
      <input
        value={zone.district}
        maxlength="30"
        list="zone-districts"
        onchange={(e) => commit("district", e.currentTarget)}
        onkeydown={(e) => onKey(e, "district")}
      />
    </label>
  </div>
  <datalist id="zone-districts">
    {#each districts as d}<option value={d}></option>{/each}
  </datalist>

  <label class="check">
    <input type="checkbox" checked={zone.visitable} onchange={(e) => onUpdate({ visitable: e.currentTarget.checked })} />
    Visitable <small>(untick for addresses that are off-limits, e.g. E, S, QP)</small>
  </label>

  <p class="meta">
    {zone.shape === "rect" ? "Rectangle" : `Polygon, ${zone.points.length} points`} · id <code>{zone.id}</code>
  </p>

  <div class="actions">
    {#if zone.shape === "rect"}
      <button type="button" onclick={() => onUpdate({ shape: "polygon" })} title="Lets you add and move points freely">
        Make polygon
      </button>
    {/if}
    <button type="button" onclick={onResetAnchor} title="The anchor is where pins sit">Centre anchor</button>
    <button type="button" class="danger" onclick={onDelete}>Delete</button>
  </div>
</div>

<style>
  .inspector {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .row label {
    flex: 1;
  }
  .row .district {
    flex: 0 0 90px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #6b5a44;
  }
  .check {
    flex-direction: row;
    align-items: center;
    gap: 6px;
    color: inherit;
    font-size: 13px;
  }
  small {
    color: #6b5a44;
  }
  .meta {
    margin: 0;
    font-size: 12px;
    color: #6b5a44;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .danger {
    margin-left: auto;
    border-color: #a33;
    color: #8b1e1e;
  }
</style>
