<script lang="ts">
  import type { ActionInput } from "../../shared/actions";
  import type { Character, Note } from "../../shared/schema";
  import { DEFAULT_LAYOUT } from "../../shared/layout";
  import Avatar from "../lib/Avatar.svelte";
  import { newId } from "../lib/cast";
  import EvidenceSlip from "../lib/icons/EvidenceSlip.svelte";
  import TagMark from "../lib/icons/TagMark.svelte";
  import {
    autoLinks,
    filterNotes,
    fromDisplay,
    isOnStream,
    linksInText,
    TAG_LABELS,
    toDisplay,
    type MentionLink,
  } from "../lib/notes";
  import NotesStrip from "../lib/NotesStrip.svelte";
  import NoteText from "../lib/NoteText.svelte";
  import type { Connection } from "../lib/socket";
  import { searchZones, stepPlace, zoneName } from "../lib/trail";
  import MentionInput from "./MentionInput.svelte";
  import type { PlayState } from "./play.svelte";

  let { conn, play }: { conn: Connection; play: PlayState } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch, notesScroll, sendNotesScroll } = conn;

  const app = $derived($snapshot?.state);
  const notes = $derived(app?.notes ?? []);
  const trail = $derived(app ? (app.trailDraft ?? app.trail) : []);
  const caseMaps = $derived(app ? app.case.mapIds.map((id) => app.maps[id]).filter(Boolean) : []);
  const expanded = $derived(app?.overlay.focus === "notes");
  const shown = $derived(filterNotes(notes, play.noteFilter));
  const onStream = $derived(notes.filter(isOnStream));

  // --- Mirrored preview of the overlay strip --------------------------------
  const STRIP = DEFAULT_LAYOUT.notes;
  let previewW = $state(0);
  const previewScale = $derived(previewW ? previewW / STRIP.w : 0.3);

  // --- Filter ---------------------------------------------------------------------
  const filterLabel = $derived.by(() => {
    const f = play.noteFilter;
    if (!f || !app) return "";
    if (f.kind === "character") return app.characters.find((c) => c.id === f.id)?.name ?? "?";
    if (f.kind === "step") {
      const i = trail.findIndex((t) => t.id === f.id);
      return i < 0 ? "a removed step" : `step ${i + 1} (${stepPlace(trail[i], app.maps)})`;
    }
    return app.maps[f.mapId]?.zones.find((z) => z.id === f.zoneId)?.label ?? "?";
  });

  // --- Editing --------------------------------------------------------------------
  let editing = $state<string | null>(null);
  let draft = $state("");
  let picked: MentionLink[] = [];
  let openLinks = $state<string | null>(null);

  function startEdit(n: Note) {
    if (!app) return;
    editing = n.id;
    draft = toDisplay(n.text, app.characters, app.maps);
    picked = [];
  }

  function saveEdit(n: Note) {
    if (!app || !draft.trim()) return;
    const typed = autoLinks(draft, app.characters, caseMaps);
    const charIds = [...n.characterIds, ...picked.flatMap((l) => ("characterId" in l ? [l.characterId] : [])), ...typed.characterIds];
    const places = [...n.places, ...picked.flatMap((l) => ("place" in l ? [l.place] : [])), ...typed.places];
    const text = fromDisplay(draft.trim(), withCreated(app.characters), app.maps, charIds, places);
    const found = linksInText(text);
    const placeKey = (p: { mapId: string; zoneId: string }) => `${p.mapId}/${p.zoneId}`;
    const allPlaces = [...n.places];
    for (const p of found.places) if (!allPlaces.some((q) => placeKey(q) === placeKey(p))) allPlaces.push(p);
    dispatch({
      type: "note/update",
      noteId: n.id,
      patch: { text, characterIds: [...new Set([...n.characterIds, ...found.characterIds])], places: allPlaces },
    });
    editing = null;
  }

  type NotePatch = Extract<ActionInput, { type: "note/update" }>["patch"];
  const update = (n: Note, patch: NotePatch) => dispatch({ type: "note/update", noteId: n.id, patch });

  // Link bar
  let placeQuery = $state("");
  const placeResults = $derived(searchZones(placeQuery, caseMaps, 5));
  const selectedPlace = $derived(play.mapId && play.selected ? { mapId: play.mapId, zoneId: play.selected } : null);
  const placeName = (p: { mapId: string; zoneId: string }) =>
    app?.maps[p.mapId]?.zones.find((z) => z.id === p.zoneId)?.label ?? "?";
  function addPlace(n: Note, p: { mapId: string; zoneId: string }) {
    if (!n.places.some((q) => q.mapId === p.mapId && q.zoneId === p.zoneId)) update(n, { places: [...n.places, p] });
    placeQuery = "";
  }

  // Characters created from "@name" this session, until the server's snapshot includes them.
  let created: { id: string; name: string }[] = [];
  function createCharacter(name: string): string | null {
    if (!name) return null;
    const id = newId("c");
    dispatch({ type: "character/add", character: { id, name } });
    created.push({ id, name });
    return id;
  }
  const withCreated = (characters: Character[]): Character[] => [
    ...characters,
    ...(created
      .filter((p) => !characters.some((c) => c.id === p.id))
      .map((p) => ({ ...p, role: "", status: "witness", portrait: null, cameo: null, address: null, notes: "", hidden: false })) as Character[]),
  ];

  // --- Drag to reorder ----------------------------------------------------------
  let rowEls: HTMLLIElement[] = $state([]);
  let drag = $state<{ id: string; from: number; to: number; mids: number[] } | null>(null);
  function startDrag(e: PointerEvent, index: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const mids = rowEls.slice(0, shown.length).map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    drag = { id: shown[index].id, from: index, to: index, mids };
  }
  function moveDrag(e: PointerEvent) {
    if (drag) drag.to = drag.mids.filter((m, i) => i !== drag!.from && m < e.clientY).length;
  }
  function endDrag() {
    if (drag && drag.to !== drag.from) {
      // Positions are within the filtered list; map back to the full list.
      const target = shown.filter((n) => n.id !== drag!.id)[drag.to];
      const toIndex = target ? notes.filter((n) => n.id !== drag!.id).indexOf(target) : notes.length - 1;
      dispatch({ type: "note/move", noteId: drag.id, toIndex });
    }
    drag = null;
  }

  /** Row the drop line shows before (index into `shown`), or -1 for after the last. */
  const dropBefore = $derived.by(() => {
    if (!drag || drag.to === drag.from) return null;
    const others = shown.map((_, i) => i).filter((i) => i !== drag!.from);
    return drag.to < others.length ? others[drag.to] : -1;
  });
</script>

{#if app}
  <div class="notes-tab" class:roomy={expanded}>
    <div class="preview" bind:clientWidth={previewW} style:height="{STRIP.h * previewScale}px" title="Wheel or drag to scroll the overlay strip">
      <div class="scaler" style:width="{STRIP.w}px" style:height="{STRIP.h}px" style:transform="scale({previewScale})">
        <NotesStrip
          notes={onStream}
          characters={app.characters}
          maps={app.maps}
          scroll={$notesScroll}
          autoScroll={app.overlay.notesAutoScroll}
          onScroll={sendNotesScroll}
        />
      </div>
    </div>

    <div class="controls">
      <button
        type="button"
        class:primary={!expanded}
        onclick={() => dispatch(expanded ? { type: "overlay/returnFocus" } : { type: "overlay/setFocus", focus: "notes" })}
        title="E"
      >
        {expanded ? "Contract" : "Expand into focus area"}
      </button>
      <label>
        Group
        <select
          value={app.overlay.notesGroup}
          onchange={(e) => dispatch({ type: "overlay/configure", patch: { notesGroup: e.currentTarget.value as "tag" | "step" | "cards" } })}
        >
          <option value="tag">by tag</option>
          <option value="step">by step</option>
          <option value="cards">card wall (clues)</option>
        </select>
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={app.overlay.notesAutoScroll}
          onchange={(e) => dispatch({ type: "overlay/configure", patch: { notesAutoScroll: e.currentTarget.checked } })}
        />
        Auto-scroll
      </label>
      <label class="check" title="Faint dashed rings on the map for places named in pinned notes but not visited yet">
        <input
          type="checkbox"
          checked={app.overlay.noteRings}
          onchange={(e) => dispatch({ type: "overlay/configure", patch: { noteRings: e.currentTarget.checked } })}
        />
        Leads-to-follow rings
      </label>
      <label class="check" title="Offer “Link to step N?” after a quick note">
        <input type="checkbox" bind:checked={play.suggestStepLinks} /> Step suggestions
      </label>
    </div>

    {#if play.noteFilter}
      <div class="filter">
        Showing notes about <strong>{filterLabel}</strong>
        <button type="button" class="link" onclick={() => (play.noteFilter = null)}>Show all</button>
      </div>
    {/if}

    <p class="hint">Pinned notes (📌) show on stream; the rest are private. Click a chip to filter.</p>

    <ol class:dragging={!!drag}>
      {#each shown as n, i (n.id)}
        <li
          bind:this={rowEls[i]}
          class:private={!n.pinned}
          class:hidden={n.hidden}
          class:moving={drag?.id === n.id}
          class:drop-before={dropBefore === i}
          class:drop-after={dropBefore === -1 && i === shown.length - 1}
        >
          <div class="line">
            <span
              class="handle"
              onpointerdown={(e) => startDrag(e, i)}
              onpointermove={moveDrag}
              onpointerup={endDrag}
              onpointercancel={() => (drag = null)}
              role="button"
              tabindex="-1"
              aria-label="Drag to reorder">⋮⋮</span
            >
            <button
              type="button"
              class="pin"
              class:on={n.pinned}
              title={n.pinned ? "On stream: click to make private" : "Private: click to pin to the overlay"}
              onclick={() => update(n, { pinned: !n.pinned })}>📌</button
            >
            {#if editing === n.id}
              <div class="edit">
                <MentionInput
                  bind:value={draft}
                  characters={app.characters}
                  {caseMaps}
                  multiline
                  onLink={(l) => picked.push(l)}
                  onSubmit={() => saveEdit(n)}
                  onCancel={() => (editing = null)}
                  onCreateCharacter={createCharacter}
                />
                <div class="row">
                  <button type="button" class="primary" onclick={() => saveEdit(n)}>Save</button>
                  <button type="button" onclick={() => (editing = null)}>Cancel</button>
                  <small>Enter saves, Shift+Enter for a new line</small>
                </div>
              </div>
            {:else}
              <div class="text" role="button" tabindex="0" ondblclick={() => startEdit(n)} onkeydown={(e) => e.key === "Enter" && startEdit(n)}>
                {#if n.tag}<TagMark tag={n.tag} size={16} />{/if}
                <NoteText
                  text={n.text}
                  characters={app.characters}
                  maps={app.maps}
                  onCharacter={(id) => (play.noteFilter = { kind: "character", id })}
                  onPlace={(mapId, zoneId) => (play.noteFilter = { kind: "place", mapId, zoneId })}
                />
              </div>
            {/if}
          </div>

          {#if editing !== n.id}
            <div class="tools">
              <select
                value={n.tag ?? ""}
                aria-label="Tag"
                onchange={(e) => update(n, { tag: (e.currentTarget.value || null) as Note["tag"] })}
              >
                <option value="">no tag</option>
                {#each Object.entries(TAG_LABELS) as [k, label]}<option value={k}>{label}</option>{/each}
              </select>
              <button type="button" onclick={() => startEdit(n)}>Edit</button>
              {#if n.tag === "clue"}
                {@const showing = app.overlay.focus === "card" && app.overlay.cardNoteId === n.id}
                <button
                  type="button"
                  class:on={showing}
                  title={showing ? "Take the card down (Esc)" : "Show this clue as an evidence card in the focus area"}
                  onclick={() => dispatch(showing ? { type: "overlay/returnFocus" } : { type: "overlay/showCard", noteId: n.id })}
                >
                  <EvidenceSlip size={14} />
                  {showing ? "Hide card" : "Show card"}
                </button>
              {/if}
              <button type="button" onclick={() => (openLinks = openLinks === n.id ? null : n.id)} class:on={openLinks === n.id || expanded}>
                Links{n.stepIds.length + n.characterIds.length + n.places.length ? ` (${n.stepIds.length + n.characterIds.length + n.places.length})` : ""}
              </button>
              {#if n.pinned}
                <button type="button" title="Hide from the overlay without unpinning" onclick={() => update(n, { hidden: !n.hidden })}>
                  {n.hidden ? "Show" : "Hide"}
                </button>
              {/if}
              <button type="button" class="danger" onclick={() => dispatch({ type: "note/delete", noteId: n.id })}>Delete</button>
            </div>
          {/if}

          {#if openLinks === n.id || (expanded && editing !== n.id)}
            <div class="links">
              {#each n.characterIds as cid (cid)}
                {@const c = app.characters.find((x) => x.id === cid)}
                {#if c}
                  <span class="chip">
                    <button type="button" class="chip-main" onclick={() => (play.noteFilter = { kind: "character", id: cid })}>
                      <Avatar character={c} size={18} ring={false} />{c.name}
                    </button>
                    <button type="button" aria-label="Unlink" onclick={() => update(n, { characterIds: n.characterIds.filter((x) => x !== cid) })}>×</button>
                  </span>
                {/if}
              {/each}
              {#each n.places as p (p.mapId + p.zoneId)}
                <span class="chip place">
                  <button type="button" class="chip-main" onclick={() => (play.noteFilter = { kind: "place", ...p })}>{placeName(p)}</button>
                  <button type="button" aria-label="Unlink" onclick={() => update(n, { places: n.places.filter((q) => q !== p) })}>×</button>
                </span>
              {/each}
              {#each n.stepIds as sid (sid)}
                {@const si = trail.findIndex((t) => t.id === sid)}
                {#if si >= 0}
                  <span class="chip step">
                    <button type="button" class="chip-main" onclick={() => (play.noteFilter = { kind: "step", id: sid })}>step {si + 1}</button>
                    <button type="button" aria-label="Unlink" onclick={() => update(n, { stepIds: n.stepIds.filter((x) => x !== sid) })}>×</button>
                  </span>
                {/if}
              {/each}
              <div class="adders">
                <select
                  value=""
                  aria-label="Link a character"
                  onchange={(e) => {
                    const v = e.currentTarget.value;
                    if (v) update(n, { characterIds: [...n.characterIds, v] });
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="">+ Character</option>
                  {#each app.characters.filter((c) => !n.characterIds.includes(c.id)) as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
                </select>
                <select
                  value=""
                  aria-label="Link a step"
                  onchange={(e) => {
                    const v = e.currentTarget.value;
                    if (v) update(n, { stepIds: [...n.stepIds, v] });
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="">+ Step</option>
                  {#each trail as s, si (s.id)}
                    {#if !n.stepIds.includes(s.id)}<option value={s.id}>step {si + 1}: {stepPlace(s, app.maps)}</option>{/if}
                  {/each}
                </select>
                <input bind:value={placeQuery} placeholder="+ Place (type a zone)" aria-label="Link a place" />
                {#if selectedPlace}
                  <button type="button" onclick={() => addPlace(n, selectedPlace)}>+ {placeName(selectedPlace)} (selected)</button>
                {/if}
              </div>
              {#if placeQuery.trim()}
                <div class="adders">
                  {#each placeResults as m (m.mapId + m.zone.id)}
                    <button type="button" onclick={() => addPlace(n, { mapId: m.mapId, zoneId: m.zone.id })}>{zoneName(m.zone)}</button>
                  {:else}
                    <small>No zone matches</small>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </li>
      {:else}
        <li class="empty">{play.noteFilter ? "No notes match this filter." : "No notes yet. Type one in the quick-note box above."}</li>
      {/each}
    </ol>
  </div>
{/if}

<style>
  .notes-tab {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .preview {
    position: relative;
    overflow: hidden;
    border: 1px solid #8a7354;
    border-radius: 4px;
    background: #efe4cc;
  }
  .scaler {
    transform-origin: 0 0;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    align-items: center;
  }
  label {
    display: flex;
    gap: 4px;
    align-items: center;
    font-size: 13px;
  }
  .filter {
    padding: 6px 8px;
    background: #e6eefc;
    border-radius: 4px;
    font-size: 13px;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: #6b5a44;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  ol.dragging {
    user-select: none;
  }
  li {
    padding: 6px 0;
    border-bottom: 1px solid #e3d7bd;
  }
  li.private .text {
    color: #6b5a44;
  }
  li.hidden .text {
    text-decoration: line-through;
  }
  li.moving {
    opacity: 0.4;
  }
  li.drop-before {
    box-shadow: inset 0 3px 0 #8b2e22;
  }
  li.drop-after {
    box-shadow: inset 0 -3px 0 #8b2e22;
  }
  .line {
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }
  .handle {
    padding: 2px 4px;
    color: #8a7354;
    cursor: grab;
    touch-action: none;
  }
  .pin {
    padding: 0 4px;
    border: none;
    background: none;
    filter: grayscale(1);
    opacity: 0.35;
  }
  .pin.on {
    filter: none;
    opacity: 1;
  }
  .text {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    line-height: 1.4;
    cursor: text;
  }
  .roomy .text {
    font-size: 16px;
  }
  .edit {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .tools,
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    margin: 4px 0 0 52px;
  }
  .tools button,
  .tools select,
  .links button,
  .links select,
  .links input {
    padding: 2px 8px;
    font-size: 12px;
  }
  select,
  input {
    font: inherit;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
  }
  button.on {
    background: #2b2118;
    color: #fff;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    background: rgb(43 108 176 / 0.14);
  }
  .chip.place {
    background: rgb(155 28 28 / 0.12);
  }
  .chip.step {
    background: #e3d7bd;
  }
  .chip button {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    border: none;
    background: none;
  }
  .adders {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    width: 100%;
  }
  .danger {
    border-color: #a33;
    color: #8b1e1e;
  }
  .primary {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
  .link {
    border: none;
    background: none;
    padding: 0 4px;
    text-decoration: underline;
    font-size: 13px;
  }
  small {
    color: #6b5a44;
    font-size: 12px;
  }
  .empty {
    padding: 12px 4px;
    font-size: 13px;
    color: #6b5a44;
    border: none;
  }
</style>
