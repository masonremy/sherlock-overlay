<script lang="ts">
  import type { Cameo, Character } from "../../shared/schema";
  import Avatar from "../lib/Avatar.svelte";
  import {
    CAMEO_FACE_LABELS,
    CAMEO_FACES,
    CAMEO_TOP_LABELS,
    CAMEO_TOPS,
    defaultCameo,
    newId,
    randomCameo,
    STATUS_COLORS,
    STATUS_LABELS,
  } from "../lib/cast";
  import { svgToPng } from "../lib/cameo";
  import { imageFromTransfer, loadImage, uploadPortrait } from "../lib/portraitImage";
  import type { Connection } from "../lib/socket";
  import { searchZones, zoneName } from "../lib/trail";
  import PortraitCropper from "./PortraitCropper.svelte";

  interface Props {
    conn: Connection;
    /** Edit this character; omit to add a new one. */
    characterId?: string | null;
    /** For a new character: the step it gets linked to. */
    linkStep?: { id: string; n: number; place: string } | null;
    /** The zone selected on the panel map, offered as the address. */
    selectedPlace?: { mapId: string; zoneId: string } | null;
    onClose: () => void;
  }

  let { conn, characterId = null, linkStep = null, selectedPlace = null, onClose }: Props = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch, sendCue } = conn;

  const app = $derived($snapshot?.state);
  // svelte-ignore state_referenced_locally (the form edits a copy taken when it opens)
  const existing = app?.characters.find((c) => c.id === characterId) ?? null;
  const id = existing?.id ?? newId("c");
  const caseMaps = $derived(app ? app.case.mapIds.map((m) => app.maps[m]).filter(Boolean) : []);

  let name = $state(existing?.name ?? "");
  let role = $state(existing?.role ?? "");
  let status = $state<Character["status"]>(existing?.status ?? "witness");
  let portrait = $state<string | null>(existing?.portrait ?? null);
  let cameo = $state<Cameo>(existing?.cameo ?? defaultCameo(id));
  let address = $state(existing?.address ?? null);
  let notes = $state(existing?.notes ?? "");
  // svelte-ignore state_referenced_locally (default for the checkbox, taken when the form opens)
  let link = $state(!!linkStep);
  let tab = $state<"library" | "cameo" | "upload">(existing?.portrait ? "upload" : "cameo");
  let error = $state<string | null>(null);
  let confirmDelete = $state(false);

  const preview = $derived({ id, name: name || "?", portrait, cameo, status });
  const placeLabel = (p: { mapId: string; zoneId: string } | null) => {
    if (!p) return "";
    const map = app?.maps[p.mapId];
    const zone = map?.zones.find((z) => z.id === p.zoneId);
    return zone ? `${zoneName(zone)}${caseMaps.length > 1 ? ` (${map!.name || map!.id})` : ""}` : "?";
  };

  // --- Address picker ---------------------------------------------------------
  let addrQuery = $state("");
  const addrResults = $derived(searchZones(addrQuery, caseMaps, 6));

  // --- Library -----------------------------------------------------------------
  let libFilter = $state("");
  const usedFiles = $derived(new Set(app?.characters.filter((c) => c.id !== id).map((c) => c.portrait) ?? []));
  const library = $derived(
    Object.values(app?.portraits ?? {}).filter(
      (p) => !libFilter.trim() || p.tags.some((t) => t.toLowerCase().includes(libFilter.trim().toLowerCase())),
    ),
  );

  // --- Upload / paste / drop ----------------------------------------------------
  let cropping = $state<HTMLImageElement | null>(null);
  let uploading = $state(false);
  let dragging = $state(false);

  async function startCrop(file: File | null) {
    if (!file) return;
    error = null;
    tab = "upload";
    try {
      cropping = await loadImage(file);
    } catch {
      error = "That file couldn't be read as an image.";
    }
  }

  async function finishCrop(blob: Blob) {
    cropping = null;
    uploading = true;
    try {
      portrait = await uploadPortrait(blob);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      uploading = false;
    }
  }

  function onPaste(e: ClipboardEvent) {
    const file = imageFromTransfer(e.clipboardData);
    if (file) {
      e.preventDefault();
      startCrop(file);
    }
  }

  let cameoSvg = $state<SVGSVGElement>();
  async function downloadCameo() {
    if (!cameoSvg) return;
    const blob = await svgToPng(cameoSvg);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(name || "cameo").replace(/[^\w-]+/g, "_")}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // --- Save ---------------------------------------------------------------------
  function save() {
    if (!name.trim()) {
      error = "A name is required.";
      return;
    }
    const fields = { name: name.trim(), role: role.trim(), status, portrait, cameo, address, notes };
    if (!existing) {
      dispatch({ type: "character/add", character: { id, ...fields }, stepId: link && linkStep ? linkStep.id : undefined });
    } else {
      const patch = Object.fromEntries(
        Object.entries(fields).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(existing[k as keyof Character])),
      );
      if (Object.keys(patch).length) dispatch({ type: "character/update", characterId: id, patch });
    }
    onClose();
  }

  function remove() {
    dispatch({ type: "character/delete", characterId: id });
    onClose();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && !cropping) onClose();
  }
</script>

<svelte:window onpaste={onPaste} onkeydown={onKey} />

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div
    class="sheet"
    role="dialog"
    tabindex="-1"
    aria-label={existing ? "Edit character" : "New character"}
    class:dragging
    ondragover={(e) => {
      e.preventDefault();
      dragging = true;
    }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => {
      e.preventDefault();
      dragging = false;
      startCrop(imageFromTransfer(e.dataTransfer));
    }}
  >
    <header>
      <div class="face"><Avatar character={preview} size={72} /></div>
      <h2>{existing ? `Edit ${existing.name}` : "New character"}</h2>
      <button type="button" class="x" onclick={onClose} aria-label="Close">×</button>
    </header>

    <div class="grid">
      <label class="full">
        Name
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={name} maxlength="60" placeholder="Mrs. Example" autofocus onkeydown={(e) => e.key === "Enter" && save()} />
      </label>
      <label>
        Role
        <input bind:value={role} maxlength="60" placeholder="Landlady" onkeydown={(e) => e.key === "Enter" && save()} />
      </label>
      <label>
        Status
        <select bind:value={status} style:border-color={STATUS_COLORS[status]}>
          {#each Object.entries(STATUS_LABELS) as [k, label]}<option value={k}>{label}</option>{/each}
        </select>
      </label>
    </div>

    <fieldset>
      <legend>Address <small>(optional)</small></legend>
      {#if address}
        <div class="row">
          <strong>{placeLabel(address)}</strong>
          <button type="button" class="link" onclick={() => (address = null)}>Clear</button>
        </div>
      {:else}
        <div class="row">
          <input bind:value={addrQuery} placeholder="Type a zone, e.g. 32 SE" class="grow" />
          {#if selectedPlace}
            <button type="button" onclick={() => (address = selectedPlace)}>Use {placeLabel(selectedPlace)}</button>
          {/if}
        </div>
        {#if addrQuery.trim()}
          <div class="chips">
            {#each addrResults as m (m.mapId + m.zone.id)}
              <button type="button" onclick={() => ((address = { mapId: m.mapId, zoneId: m.zone.id }), (addrQuery = ""))}>
                {zoneName(m.zone)}
              </button>
            {:else}
              <small>No zone matches</small>
            {/each}
          </div>
        {/if}
      {/if}
    </fieldset>

    <fieldset>
      <legend>Portrait</legend>
      <div class="tabs">
        <button type="button" class:on={tab === "library"} onclick={() => (tab = "library")}>Library</button>
        <button type="button" class:on={tab === "cameo"} onclick={() => (tab = "cameo")}>Cameo</button>
        <button type="button" class:on={tab === "upload"} onclick={() => (tab = "upload")}>Upload / paste</button>
        {#if portrait}
          <button type="button" class="link right" onclick={() => (portrait = null)} title="Go back to the cameo">
            Remove portrait
          </button>
        {/if}
      </div>

      {#if tab === "library"}
        <input bind:value={libFilter} placeholder="Filter by tag (maid, constable…)" />
        <div class="library">
          {#each library as p (p.id)}
            <button
              type="button"
              class:on={portrait === p.file}
              class:used={usedFiles.has(p.file)}
              title={usedFiles.has(p.file) ? "Already used in this case" : p.tags.join(", ")}
              onclick={() => (portrait = p.file)}
            >
              <img src="/portraits/{p.file}" alt={p.tags.join(", ")} />
              {#if usedFiles.has(p.file)}<span>used</span>{/if}
            </button>
          {:else}
            <small>
              {Object.keys(app?.portraits ?? {}).length
                ? "No portraits match."
                : "The library is empty. Add portraits before the stream in the Cast tab."}
            </small>
          {/each}
        </div>
      {:else if tab === "cameo"}
        <div class="cameo">
          <Avatar character={{ id, name, portrait: null, cameo, status }} size={120} bind:svgEl={cameoSvg} />
          <div class="parts">
            <label>
              Head
              <select bind:value={cameo.head}>
                {#each [0, 1, 2, 3] as h}<option value={h}>Shape {h + 1}</option>{/each}
              </select>
            </label>
            <label>
              Hat / hair
              <select bind:value={cameo.top}>
                {#each CAMEO_TOPS as t}<option value={t}>{CAMEO_TOP_LABELS[t]}</option>{/each}
              </select>
            </label>
            <label>
              Face
              <select bind:value={cameo.face}>
                {#each CAMEO_FACES as f}<option value={f}>{CAMEO_FACE_LABELS[f]}</option>{/each}
              </select>
            </label>
            <div class="row">
              <button type="button" onclick={() => (cameo = randomCameo())}>Shuffle</button>
              <button type="button" onclick={downloadCameo}>PNG</button>
            </div>
          </div>
        </div>
        {#if portrait}<small>An uploaded portrait is set; it shows instead of the cameo until you remove it.</small>{/if}
      {:else if cropping}
        <PortraitCropper img={cropping} onDone={finishCrop} onCancel={() => (cropping = null)} />
      {:else}
        <label class="drop">
          <input type="file" accept="image/*" onchange={(e) => startCrop(e.currentTarget.files?.[0] ?? null)} hidden />
          <strong>{uploading ? "Uploading…" : "Choose, drop or paste an image"}</strong>
          <small>Cropped to a square, saved at 256 px.</small>
        </label>
      {/if}
    </fieldset>

    {#if existing}
      <label class="full">
        Notes <small>(private)</small>
        <textarea bind:value={notes} rows="2" maxlength="2000"></textarea>
      </label>
    {:else if linkStep}
      <label class="check">
        <input type="checkbox" bind:checked={link} /> Met at step {linkStep.n} ({linkStep.place}): show their face on that pin
      </label>
    {/if}

    {#if error}<p class="error">{error}</p>{/if}

    <footer>
      {#if existing}
        {#if confirmDelete}
          <button type="button" class="danger" onclick={remove}>Really delete</button>
          <button type="button" onclick={() => (confirmDelete = false)}>Keep</button>
        {:else}
          <button type="button" class="danger" onclick={() => (confirmDelete = true)}>Delete</button>
          <button type="button" onclick={() => sendCue({ kind: "intro", characterId: id })} title="Play the introduction on the overlay again">
            Replay intro
          </button>
        {/if}
      {/if}
      <span class="spacer"></span>
      <button type="button" onclick={onClose}>Cancel</button>
      <button type="button" class="primary" onclick={save} disabled={uploading}>{existing ? "Save" : "Add character"}</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: start center;
    overflow: auto;
    padding: 16px 8px;
    background: rgb(43 33 24 / 0.45);
  }
  .sheet {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(460px, 100%);
    box-sizing: border-box;
    padding: 14px;
    background: #f6f0e2;
    border-radius: 8px;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.35);
  }
  .sheet.dragging {
    outline: 3px dashed #8b2e22;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  header h2 {
    flex: 1;
    margin: 0;
    font-size: 18px;
  }
  .face {
    display: flex;
  }
  .x {
    padding: 0 8px;
    border: none;
    background: none;
    font-size: 22px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .full {
    grid-column: 1 / -1;
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
  input,
  select,
  textarea {
    box-sizing: border-box;
    padding: 7px;
    font: inherit;
    font-size: 15px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
    color: #2b2118;
  }
  select {
    border-width: 2px;
  }
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 8px 10px 10px;
    border: 1px solid #d8c9aa;
    border-radius: 6px;
  }
  legend {
    font-size: 12px;
    color: #6b5a44;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .tabs button.on,
  .library button.on {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
  .right {
    margin-left: auto;
  }
  .library {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: 6px;
    max-height: 210px;
    overflow: auto;
  }
  .library button {
    position: relative;
    padding: 3px;
  }
  .library img {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
  }
  .library button.used {
    opacity: 0.45;
  }
  .library span {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 2px;
    font-size: 10px;
    text-align: center;
  }
  .cameo {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .parts {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }
  .drop {
    align-items: center;
    padding: 18px;
    border: 2px dashed #b9a787;
    border-radius: 6px;
    background: #fffaf0;
    color: inherit;
    cursor: pointer;
  }
  small {
    color: #6b5a44;
    font-size: 12px;
  }
  .link {
    border: none;
    background: none;
    padding: 2px 4px;
    text-decoration: underline;
    font-size: 13px;
  }
  .error {
    margin: 0;
    padding: 6px 8px;
    background: #f7d9d4;
    border-radius: 4px;
    font-size: 13px;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .spacer {
    flex: 1;
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
</style>
