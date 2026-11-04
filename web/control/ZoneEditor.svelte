<script lang="ts">
  import type { Connection } from "../lib/socket";
  import type { MapDef, Zone, ZonePatch } from "../../shared/schema";
  import { centroid, incrementLabel, roundPoint, slugify, uniqueId, type Point } from "../../shared/geometry";
  import type { UploadedImage } from "../lib/mapImage";
  import ImageUpload from "./ImageUpload.svelte";
  import MapExtras from "./MapExtras.svelte";
  import ZoneCanvas from "./ZoneCanvas.svelte";
  import ZoneInspector from "./ZoneInspector.svelte";
  import { TOOLS, type Tool } from "./zoneTools";

  let { conn, active }: { conn: Connection; active: boolean } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, lastError, dispatch } = conn;

  const maps = $derived($snapshot?.state.maps ?? {});
  const caseMapIds = $derived($snapshot?.state.case.mapIds ?? []);
  const mapList = $derived(Object.values(maps).sort((a, b) => mapName(a).localeCompare(mapName(b))));

  let mapId = $state<string | null>(null);
  /** A map we just created/imported and want to show once its snapshot arrives. */
  let wantMapId: string | null = null;
  const map = $derived(mapId ? (maps[mapId] ?? null) : null);

  $effect(() => {
    if (wantMapId && maps[wantMapId]) {
      mapId = wantMapId;
      wantMapId = null;
    } else if (!wantMapId && !(mapId && maps[mapId])) {
      mapId = caseMapIds.find((id) => maps[id]) ?? mapList[0]?.id ?? null;
    }
  });
  $effect(() => {
    if ($lastError) wantMapId = null;
  });

  let tool = $state<Tool>("select");
  let selectedId = $state<string | null>(null);
  let nextLabel = $state("");
  let district = $state("");
  let showLabels = $state(true);
  let filter = $state("");
  let canvas = $state<ReturnType<typeof ZoneCanvas>>();
  /** Ids sent but maybe not yet confirmed, so quick bulk clicks never collide. */
  const issuedIds = new Set<string>();

  type Panel = "none" | "new" | "replace" | "import-conflict" | "delete";
  let panel = $state<Panel>("none");
  let newImage = $state<UploadedImage | null>(null);
  let newName = $state("");
  let pendingImport = $state<{ id: string } | null>(null);
  let notice = $state<string | null>(null);

  $effect(() => {
    mapId;
    selectedId = null;
    issuedIds.clear();
  });

  const selected = $derived(map?.zones.find((z) => z.id === selectedId) ?? null);
  const districts = $derived([...new Set((map?.zones ?? []).map((z) => z.district).filter(Boolean))].sort());
  const blockedCount = $derived(map?.zones.filter((z) => !z.visitable).length ?? 0);
  const listed = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    return (map?.zones ?? [])
      .filter((z) => !q || z.label.toLowerCase().includes(q) || z.district.toLowerCase().includes(q))
      .toSorted((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  });

  // Bulk boxes take the size of the most recent rectangle (or a small default).
  const bulkSize = $derived.by((): Point => {
    if (!map) return [0.02, 0.02];
    const last = map.zones.findLast((z) => z.shape === "rect");
    if (last) {
      const xs = last.points.map((p) => p[0]);
      const ys = last.points.map((p) => p[1]);
      return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    }
    return [0.025, (0.025 * map.imageSize[0]) / map.imageSize[1]];
  });

  function mapName(m: MapDef) {
    return m.name || m.id;
  }

  function addZone(shape: Zone["shape"], points: Point[]) {
    if (!map) return;
    const label = nextLabel.trim() || `Zone ${map.zones.length + 1}`;
    const id = uniqueId(slugify(label) || "zone", [...map.zones.map((z) => z.id), ...issuedIds]);
    issuedIds.add(id);
    dispatch({
      type: "zone/add",
      mapId: map.id,
      zone: { id, label, district: district.trim(), shape, points, anchor: roundPoint(centroid(points)) },
    });
    selectedId = id;
    nextLabel = incrementLabel(label);
  }

  function updateZone(id: string, patch: ZonePatch) {
    if (map) dispatch({ type: "zone/update", mapId: map.id, zoneId: id, patch });
  }

  function deleteZone(id: string) {
    if (!map) return;
    dispatch({ type: "zone/delete", mapId: map.id, zoneId: id });
    if (selectedId === id) selectedId = null;
  }

  function pickZone(id: string) {
    selectedId = id;
    canvas?.focusZone(id);
  }

  function openPanel(p: Panel) {
    panel = p;
    notice = null;
    newImage = null;
    newName = "";
  }

  function createMap() {
    if (!newImage || !newName.trim()) return;
    const id = uniqueId(slugify(newName) || "map", Object.keys(maps));
    dispatch({
      type: "map/create",
      map: { id, name: newName.trim(), image: newImage.file, imageSize: [newImage.width, newImage.height] },
    });
    wantMapId = id;
    openPanel("none");
  }

  function replaceImage(img: UploadedImage) {
    if (!map) return;
    const oldAspect = map.imageSize[0] / map.imageSize[1];
    const newAspect = img.width / img.height;
    dispatch({ type: "map/setImage", mapId: map.id, image: img.file, imageSize: [img.width, img.height] });
    openPanel("none");
    notice =
      Math.abs(oldAspect - newAspect) / oldAspect > 0.01
        ? `The new image has a different shape (${img.width} × ${img.height}), so zones may no longer line up. Undo to go back.`
        : `Image replaced (${img.width} × ${img.height}); zones kept.`;
  }

  let importInput: HTMLInputElement;
  async function onImportFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    notice = null;
    let raw: { id?: unknown };
    try {
      raw = JSON.parse(await file.text());
    } catch {
      notice = `${file.name} isn't valid JSON.`;
      return;
    }
    if (typeof raw?.id !== "string") {
      notice = `${file.name} doesn't look like a map definition (no "id").`;
      return;
    }
    if (maps[raw.id]) {
      pendingImport = raw as { id: string };
      panel = "import-conflict";
    } else {
      importMap(raw, false);
    }
  }

  function importMap(raw: { id?: unknown }, replace: boolean) {
    dispatch({ type: "map/import", map: raw as never, replace });
    wantMapId = raw.id as string;
    pendingImport = null;
    panel = "none";
  }

  function exportMap() {
    if (!map) return;
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${map.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function toggleInCase(e: Event & { currentTarget: HTMLInputElement }) {
    if (!map) return;
    const want = e.currentTarget.checked;
    dispatch({ type: want ? "case/addMap" : "case/removeMap", mapId: map.id });
    // Show the server's answer, not the click: a refused change must not stick.
    e.currentTarget.checked = caseMapIds.includes(map.id);
  }

  function rename(input: HTMLInputElement) {
    if (!map) return;
    const name = input.value.trim();
    if (!name) input.value = mapName(map);
    else if (name !== map.name) dispatch({ type: "map/rename", mapId: map.id, name });
  }

  function deleteMap() {
    if (!map) return;
    dispatch({ type: "map/delete", mapId: map.id });
    mapId = null;
    openPanel("none");
  }
</script>

<div class="editor">
  <header class="bar">
    <select
      value={mapId ?? ""}
      onchange={(e) => (mapId = e.currentTarget.value || null)}
      disabled={!mapList.length}
      aria-label="Map"
    >
      {#if !mapList.length}<option value="">No maps yet</option>{/if}
      {#each mapList as m (m.id)}
        <option value={m.id}>{mapName(m)}{caseMapIds.includes(m.id) ? " ●" : ""}</option>
      {/each}
    </select>
    <button type="button" onclick={() => openPanel(panel === "new" ? "none" : "new")}>New map</button>
    <button type="button" onclick={() => importInput.click()}>Import JSON</button>
    <input type="file" accept="application/json,.json" bind:this={importInput} onchange={onImportFile} hidden />
    {#if map}
      <button type="button" onclick={exportMap}>Export JSON</button>
    {/if}
  </header>

  {#if map}
    <div class="bar secondary">
      <label class="name">
        Name
        <input
          value={mapName(map)}
          maxlength="80"
          onchange={(e) => rename(e.currentTarget)}
          onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>
      <label class="check" title="Maps ticked here are used by the current case (● in the list)">
        <input type="checkbox" checked={caseMapIds.includes(map.id)} onchange={toggleInCase} />
        Used in this case
      </label>
      <button type="button" onclick={() => openPanel(panel === "replace" ? "none" : "replace")}>Replace image</button>
      <button type="button" class="danger" onclick={() => openPanel("delete")}>Delete map</button>
    </div>
  {/if}

  {#if panel === "new" || (!mapList.length && $snapshot)}
    <section class="card">
      <h3>New map</h3>
      {#if !newImage}
        <ImageUpload
          prompt="Add a map image"
          onDone={(img) => {
            newImage = img;
            newName = img.sourceName.replace(/\.[^.]+$/, "");
          }}
        />
      {:else}
        <p class="small">{newImage.sourceName}: {newImage.width} × {newImage.height} px, uploaded.</p>
        <div class="row">
          <label class="grow">
            Name
            <input
              bind:value={newName}
              maxlength="80"
              placeholder="London"
              onkeydown={(e) => e.key === "Enter" && createMap()}
            />
          </label>
          <button type="button" class="primary" onclick={createMap} disabled={!newName.trim()}>Create map</button>
        </div>
      {/if}
      {#if mapList.length}
        <button type="button" class="link" onclick={() => openPanel("none")}>Cancel</button>
      {/if}
    </section>
  {:else if panel === "replace" && map}
    <section class="card">
      <h3>Replace image for {mapName(map)}</h3>
      <p class="small">Zones are kept: they're stored relative to the image, so a sharper scan of the same map lines up.</p>
      <ImageUpload prompt="New image" onDone={replaceImage} />
      <button type="button" class="link" onclick={() => openPanel("none")}>Cancel</button>
    </section>
  {:else if panel === "import-conflict" && pendingImport}
    <section class="card">
      <h3>Map “{pendingImport.id}” already exists</h3>
      <p class="small">Replacing overwrites its zones with the imported ones (undo still works).</p>
      <div class="row">
        <button type="button" class="danger" onclick={() => importMap(pendingImport!, true)}>Replace it</button>
        <button type="button" onclick={() => openPanel("none")}>Cancel</button>
      </div>
    </section>
  {:else if panel === "delete" && map}
    <section class="card">
      <h3>Delete {mapName(map)}?</h3>
      <p class="small">
        Removes it from the library for every case. The file moves to <code>maps/.trash/</code>, and undo brings it back.
      </p>
      <div class="row">
        <button type="button" class="danger" onclick={deleteMap}>Delete map</button>
        <button type="button" onclick={() => openPanel("none")}>Cancel</button>
      </div>
    </section>
  {/if}

  {#if notice}
    <p class="notice">{notice} <button type="button" class="link" onclick={() => (notice = null)}>Dismiss</button></p>
  {/if}

  {#if map}
    <div class="bar tools">
      <div class="seg" role="radiogroup" aria-label="Tool">
        {#each TOOLS as t (t.id)}
          <button
            type="button"
            role="radio"
            aria-checked={tool === t.id}
            class:on={tool === t.id}
            onclick={() => (tool = t.id)}
            title="{t.label} ({t.key})">{t.label}</button
          >
        {/each}
      </div>
      <label class="small-field">
        Next label
        <input bind:value={nextLabel} maxlength="60" placeholder="14 WC" />
      </label>
      <label class="small-field district">
        District
        <input bind:value={district} maxlength="30" list="map-districts" placeholder="WC" />
      </label>
      <datalist id="map-districts">
        {#each districts as d}<option value={d}></option>{/each}
      </datalist>
      <label class="check"><input type="checkbox" bind:checked={showLabels} /> Labels</label>
      <button type="button" onclick={() => canvas?.fit()} title="Fit (0)">Fit</button>
    </div>

    <div class="work">
      <div class="canvas">
        <ZoneCanvas
          bind:this={canvas}
          {map}
          {selectedId}
          {tool}
          {bulkSize}
          {showLabels}
          {active}
          onSelect={(id) => (selectedId = id)}
          onAdd={addZone}
          onUpdate={updateZone}
          onDelete={deleteZone}
          onTool={(t) => (tool = t)}
        />
      </div>

      <aside>
        {#if selected}
          <section class="card">
            <ZoneInspector
              zone={selected}
              {districts}
              onUpdate={(patch) => updateZone(selected.id, patch)}
              onDelete={() => deleteZone(selected.id)}
              onResetAnchor={() => updateZone(selected.id, { anchor: roundPoint(centroid(selected.points)) })}
            />
          </section>
        {:else}
          <p class="small hint">
            Select a zone to edit it. New zones get the <em>Next label</em> and <em>District</em> above; the label counts
            up after each one.
          </p>
        {/if}

        <section class="card list">
          <div class="list-head">
            <strong>{map.zones.length} zones</strong>
            {#if blockedCount}<span class="small">({blockedCount} not visitable)</span>{/if}
            <input type="search" placeholder="Filter" bind:value={filter} aria-label="Filter zones" />
          </div>
          <ul>
            {#each listed as z (z.id)}
              <li>
                <button type="button" class:on={z.id === selectedId} class:blocked={!z.visitable} onclick={() => pickZone(z.id)}>
                  <span>{z.label}</span>
                  {#if z.district}<span class="small">{z.district}</span>{/if}
                </button>
              </li>
            {:else}
              <li class="small empty">{map.zones.length ? "No matches" : "No zones yet. Pick a tool and draw."}</li>
            {/each}
          </ul>
        </section>

        <MapExtras {conn} {map} {selected} />
      </aside>
    </div>
  {/if}
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    min-height: 0;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: end;
  }
  .bar select {
    flex: 1 1 140px;
    min-width: 0;
  }
  .name {
    flex: 1 1 140px;
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
    padding-bottom: 6px;
  }
  .small-field {
    flex: 1 1 90px;
    min-width: 0;
  }
  .small-field.district {
    flex: 0 1 70px;
  }
  .seg {
    display: flex;
  }
  .seg button {
    border-radius: 0;
    margin-left: -1px;
  }
  .seg button:first-child {
    border-radius: 4px 0 0 4px;
  }
  .seg button:last-child {
    border-radius: 0 4px 4px 0;
  }
  button.on {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
  .card {
    padding: 10px;
    background: #fbf6ea;
    border: 1px solid #d8c9aa;
    border-radius: 6px;
  }
  .card h3 {
    margin: 0 0 8px;
    font-size: 15px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: end;
  }
  .grow {
    flex: 1;
  }
  .small {
    font-size: 12px;
    color: #6b5a44;
  }
  .card .small {
    margin: 0 0 8px;
  }
  .hint {
    margin: 0;
  }
  .notice {
    margin: 0;
    padding: 8px;
    background: #fdf2c9;
    border-radius: 4px;
    font-size: 13px;
  }
  .link {
    border: none;
    background: none;
    padding: 4px 0;
    text-decoration: underline;
    font-size: 13px;
  }
  .primary {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
  .danger {
    border-color: #a33;
    color: #8b1e1e;
  }
  .work {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .canvas {
    height: 60vh;
    min-height: 280px;
    border: 1px solid #b9a787;
    border-radius: 6px;
    overflow: hidden;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow: auto;
  }
  .list {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .list-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .list-head input {
    margin-left: auto;
    width: 110px;
    padding: 4px 6px;
    font-size: 13px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 320px;
    overflow: auto;
  }
  li button {
    display: flex;
    justify-content: space-between;
    width: 100%;
    padding: 4px 6px;
    border: none;
    border-radius: 3px;
    background: none;
    text-align: left;
    font-size: 13px;
  }
  li button:hover:not(.on) {
    background: #efe4cc;
  }
  li button.blocked span:first-child {
    text-decoration: line-through;
    opacity: 0.7;
  }
  .empty {
    padding: 4px 6px;
  }
  input,
  select {
    padding: 6px;
    font: inherit;
    font-size: 14px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
    color: #2b2118;
  }

  /* Full browser tab: map beside the sidebar, filling the height. */
  @media (min-width: 900px) {
    .work {
      flex: 1;
      min-height: 0;
      flex-direction: row;
    }
    .canvas {
      flex: 1;
      height: auto;
    }
    aside {
      flex: 0 0 300px;
    }
    ul {
      max-height: none;
      flex: 1;
    }
  }
</style>
