<script lang="ts">
  import Avatar from "../lib/Avatar.svelte";
  import { newId, STATUS_COLORS, STATUS_LABELS } from "../lib/cast";
  import { centerCrop, cropToBlob, loadImage, uploadPortrait } from "../lib/portraitImage";
  import type { Connection } from "../lib/socket";
  import { stepPlace } from "../lib/trail";

  let { conn, onAdd, onEdit }: { conn: Connection; onAdd: () => void; onEdit: (id: string) => void } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch, sendCue } = conn;

  const app = $derived($snapshot?.state);
  const trail = $derived(app?.trail ?? []);

  // First appearance first (hidden ones included here, marked), unmet last.
  const roster = $derived.by(() => {
    if (!app) return [];
    const first = new Map<string, number>();
    trail.forEach((t, i) => t.characterIds.forEach((id) => first.has(id) || first.set(id, i)));
    return app.characters
      .map((c, i) => ({ c, i, steps: trail.flatMap((t, n) => (t.characterIds.includes(c.id) ? [n + 1] : [])) }))
      .sort((a, b) => (first.get(a.c.id) ?? Infinity) - (first.get(b.c.id) ?? Infinity) || a.i - b.i);
  });

  const placeLabel = (p: { mapId: string; zoneId: string } | null) =>
    p && app ? stepPlace({ mapId: p.mapId, zoneId: p.zoneId, customLabel: null } as never, app.maps) : "";

  // --- Portrait library -----------------------------------------------------------
  let showLibrary = $state(false);
  let libTags = $state("");
  let libBusy = $state<string | null>(null);
  let editingTags = $state<string | null>(null);
  const usedFiles = $derived(new Set(app?.characters.map((c) => c.portrait) ?? []));
  const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12);

  async function addToLibrary(files: FileList | null) {
    if (!files?.length) return;
    const tags = parseTags(libTags);
    let n = 0;
    for (const file of files) {
      libBusy = `Adding ${++n} of ${files.length}…`;
      try {
        const img = await loadImage(file);
        const blob = await cropToBlob(img, centerCrop(img));
        URL.revokeObjectURL(img.src);
        const stored = await uploadPortrait(blob);
        if (!Object.values(app?.portraits ?? {}).some((p) => p.file === stored)) {
          dispatch({ type: "portrait/add", portrait: { id: newId("p"), file: stored, tags } });
        }
      } catch {
        // skip files that aren't images
      }
    }
    libBusy = null;
  }
</script>

{#if app}
  <div class="cast">
    <div class="head">
      <strong>{app.characters.length} character{app.characters.length === 1 ? "" : "s"}</strong>
      <button type="button" class="primary" onclick={onAdd} title="C">+ Character</button>
    </div>

    <ul>
      {#each roster as { c, steps } (c.id)}
        <li class:hidden={c.hidden}>
          <button type="button" class="row" onclick={() => onEdit(c.id)}>
            <Avatar character={c} size={44} />
            <span class="who">
              <strong>{c.name}</strong>
              <small>
                {c.role}{c.role && c.address ? " · " : ""}{placeLabel(c.address)}
                {#if steps.length}· step {steps.join(", ")}{/if}
              </small>
            </span>
          </button>
          <select
            value={c.status}
            style:border-color={STATUS_COLORS[c.status]}
            onchange={(e) =>
              dispatch({ type: "character/update", characterId: c.id, patch: { status: e.currentTarget.value as typeof c.status } })}
            aria-label="Status"
          >
            {#each Object.entries(STATUS_LABELS) as [k, label]}<option value={k}>{label}</option>{/each}
          </select>
          <button
            type="button"
            class="icon"
            title={c.hidden ? "Hidden from the overlay: click to show" : "Hide from the overlay"}
            onclick={() => dispatch({ type: "character/update", characterId: c.id, patch: { hidden: !c.hidden } })}
            >{c.hidden ? "◌" : "●"}</button
          >
          <button type="button" class="icon" title="Replay intro on the overlay" onclick={() => sendCue({ kind: "intro", characterId: c.id })}
            >▶</button
          >
        </li>
      {:else}
        <li class="empty">No characters yet. Press + Character (or C) when you meet someone.</li>
      {/each}
    </ul>
    <p class="hint">● shown on the overlay, ◌ hidden · ▶ replays the introduction · <button type="button" class="link" onclick={() => sendCue({ kind: "skipIntro" })}>Skip a playing intro</button></p>

    <section class="library">
      <button type="button" class="toggle" onclick={() => (showLibrary = !showLibrary)}>
        {showLibrary ? "▾" : "▸"} Portrait library ({Object.keys(app.portraits).length})
      </button>
      {#if showLibrary}
        <p class="hint">Prepare portraits before the stream; they're shared by every case. Tag them loosely so they're easy to find.</p>
        <div class="add">
          <input bind:value={libTags} placeholder="Tags for new portraits: older man, constable" />
          <label class="button">
            {libBusy ?? "Add images…"}
            <input type="file" accept="image/*" multiple hidden disabled={!!libBusy} onchange={(e) => addToLibrary(e.currentTarget.files)} />
          </label>
        </div>
        <div class="grid">
          {#each Object.values(app.portraits) as p (p.id)}
            <div class="tile" class:used={usedFiles.has(p.file)}>
              <img src="/portraits/{p.file}" alt="" />
              {#if editingTags === p.id}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  value={p.tags.join(", ")}
                  autofocus
                  onchange={(e) => dispatch({ type: "portrait/update", portraitId: p.id, tags: parseTags(e.currentTarget.value) })}
                  onblur={() => (editingTags = null)}
                  onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
              {:else}
                <button type="button" class="tags" onclick={() => (editingTags = p.id)} title="Edit tags">
                  {p.tags.join(", ") || "add tags"}
                </button>
              {/if}
              {#if usedFiles.has(p.file)}<span class="badge">used</span>{/if}
              <button type="button" class="del" title="Remove from library" onclick={() => dispatch({ type: "portrait/delete", portraitId: p.id })}>×</button>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .cast {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid #e3d7bd;
  }
  li.hidden .row {
    opacity: 0.5;
  }
  .row {
    display: flex;
    flex: 1;
    gap: 10px;
    align-items: center;
    min-width: 0;
    padding: 6px 2px;
    border: none;
    background: none;
    text-align: left;
  }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .who small {
    overflow: hidden;
    color: #6b5a44;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  select {
    padding: 4px;
    font: inherit;
    font-size: 13px;
    border: 2px solid;
    border-radius: 4px;
    background: #fffaf0;
  }
  .icon {
    padding: 4px 8px;
  }
  .empty {
    padding: 12px 4px;
    font-size: 13px;
    color: #6b5a44;
    border: none;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: #6b5a44;
  }
  .link {
    border: none;
    background: none;
    padding: 0;
    text-decoration: underline;
    font-size: 12px;
  }
  .library {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 6px;
    border-top: 1px solid #d8c9aa;
  }
  .toggle {
    align-self: start;
    border: none;
    background: none;
    padding: 4px 0;
    font-weight: 600;
  }
  .add {
    display: flex;
    gap: 6px;
  }
  .add input {
    flex: 1;
    min-width: 0;
    padding: 6px;
    font: inherit;
    font-size: 13px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
  }
  .button {
    padding: 6px 12px;
    border: 1px solid #8a7354;
    border-radius: 4px;
    background: #efe4cc;
    font-size: 14px;
    white-space: nowrap;
    cursor: pointer;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 8px;
  }
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
  }
  .tile img {
    width: 72px;
    height: 72px;
    border-radius: 50%;
  }
  .tile.used img {
    opacity: 0.5;
  }
  .tags,
  .tile input {
    width: 100%;
    padding: 2px;
    border: none;
    background: none;
    font-size: 11px;
    color: #6b5a44;
    text-align: center;
  }
  .badge {
    position: absolute;
    top: 28px;
    font-size: 11px;
    font-weight: 600;
  }
  .del {
    position: absolute;
    top: -4px;
    right: 0;
    padding: 0 6px;
    font-size: 14px;
  }
  .primary {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
</style>
