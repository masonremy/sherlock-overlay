<script lang="ts">
  import { COMPONENT_LABELS, COMPONENTS, OVERLAY_SIZE, type Component } from "../../shared/layout";
  import { slugify, uniqueId } from "../../shared/geometry";
  import type { Layout } from "../../shared/schema";
  import { covered, moveRect, resizeRect, type Box, type Handle } from "../lib/layoutMath";
  import type { Connection } from "../lib/socket";
  import FontsPanel from "./FontsPanel.svelte";

  // The overlay at 1920×1080, scaled down: drag boxes to move, handles to
  // resize. Changes preview here and go live on Apply (or straight away with
  // live edit).

  let { conn, active }: { conn: Connection; active: boolean } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch } = conn;

  const app = $derived($snapshot?.state);
  const layouts = $derived(Object.values(app?.layouts ?? {}));
  let editId = $state<string | null>(null);
  $effect(() => {
    if (app && (!editId || !app.layouts[editId])) editId = app.overlay.layoutId in app.layouts ? app.overlay.layoutId : (layouts[0]?.id ?? null);
  });
  const saved = $derived(editId && app ? (app.layouts[editId] ?? null) : null);

  let draft = $state<Layout | null>(null);
  let dirty = $state(false);
  let live = $state(false);
  $effect(() => {
    if (saved && !dirty) draft = JSON.parse(JSON.stringify(saved));
  });

  function commit(next: Layout) {
    draft = next;
    if (live) dispatch({ type: "layout/save", layout: next });
    else dirty = true;
  }
  function apply() {
    if (draft) dispatch({ type: "layout/save", layout: draft });
    dirty = false;
  }

  // --- Boxes ------------------------------------------------------------------------
  type Sel = { kind: "component"; id: Component } | { kind: "reserved"; id: string } | null;
  let selected = $state<Sel>(null);
  const boxes = $derived.by((): (Box & { label: string; kind: "component" | "reserved"; hidden: boolean; locked: boolean })[] => {
    if (!draft) return [];
    return [
      ...COMPONENTS.map((id) => ({ id, ...draft!.components[id], label: COMPONENT_LABELS[id], kind: "component" as const, hidden: !draft!.components[id].visible })),
      ...draft.reserved.map((r) => ({ ...r, id: `r:${r.id}`, z: 0, label: r.name || "Reserved", kind: "reserved" as const, hidden: false, locked: false })),
    ];
  });
  const hatched = $derived(new Set(covered(boxes.filter((b) => !b.hidden))));
  const boxKey = (s: Sel) => (s ? (s.kind === "component" ? s.id : `r:${s.id}`) : null);
  const selRect = $derived.by(() => {
    if (!draft || !selected) return null;
    if (selected.kind === "component") return draft.components[selected.id];
    const id = selected.id;
    return draft.reserved.find((r) => r.id === id) ?? null;
  });

  function setBox(key: string, r: { x: number; y: number; w: number; h: number }, base: Layout = draft!) {
    const next: Layout = JSON.parse(JSON.stringify(base));
    if (key.startsWith("r:")) {
      const res = next.reserved.find((x) => x.id === key.slice(2));
      if (res) Object.assign(res, { x: r.x, y: r.y, w: r.w, h: r.h });
    } else Object.assign(next.components[key as Component], { x: r.x, y: r.y, w: r.w, h: r.h });
    return next;
  }

  function patchComponent(id: Component, patch: Partial<Layout["components"][Component]>) {
    if (!draft) return;
    const next: Layout = JSON.parse(JSON.stringify(draft));
    Object.assign(next.components[id], patch);
    commit(next);
  }

  // --- Dragging -----------------------------------------------------------------------
  let cw = $state(0);
  const scale = $derived(cw ? cw / OVERLAY_SIZE.w : 0.2);
  let drag: { key: string; handle: Handle | null; sx: number; sy: number; start: Box; base: Layout } | null = null;

  function down(e: PointerEvent, b: (typeof boxes)[number], handle: Handle | null) {
    e.stopPropagation();
    selected = b.kind === "component" ? { kind: "component", id: b.id as Component } : { kind: "reserved", id: b.id.slice(2) };
    if (b.locked || !draft) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { key: b.id, handle, sx: e.clientX, sy: e.clientY, start: { id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, z: b.z }, base: draft };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const dx = (e.clientX - drag.sx) / scale;
    const dy = (e.clientY - drag.sy) / scale;
    const others = boxes.filter((b) => b.id !== drag!.key && !b.hidden);
    const snap = !e.altKey;
    const r = drag.handle ? resizeRect(drag.start, drag.handle, dx, dy, others, snap) : moveRect(drag.start, drag.start.x + dx, drag.start.y + dy, others, snap);
    draft = setBox(drag.key, r, drag.base);
  }
  function up() {
    if (drag && draft && draft !== drag.base) commit(draft);
    drag = null;
  }

  function onKey(e: KeyboardEvent) {
    if (!active || !selected || !selRect || !draft) return;
    if ((e.target as HTMLElement).matches?.("input, textarea, select")) return;
    const step = e.shiftKey ? 8 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    commit(setBox(boxKey(selected)!, { ...selRect, x: selRect.x + d[0], y: selRect.y + d[1] }));
  }

  // --- Layers, reserved areas, focus shape -----------------------------------------------
  function raise(id: Component, delta: number) {
    if (draft) patchComponent(id, { z: Math.max(0, Math.min(99, draft.components[id].z + delta)) });
  }
  function addReserved() {
    if (!draft) return;
    const next: Layout = JSON.parse(JSON.stringify(draft));
    const id = uniqueId("reserved", next.reserved.map((r) => r.id));
    next.reserved.push({ id, name: "Alerts", x: 1480, y: 80, w: 400, h: 220 });
    selected = { kind: "reserved", id };
    commit(next);
  }
  function editReserved(id: string, patch: { name?: string }, remove = false) {
    if (!draft) return;
    const next: Layout = JSON.parse(JSON.stringify(draft));
    next.reserved = remove ? next.reserved.filter((r) => r.id !== id) : next.reserved.map((r) => (r.id === id ? { ...r, ...patch } : r));
    if (remove) selected = null;
    commit(next);
  }
  // The focus area can take the map image's shape, so the map fills it.
  const mapAspect = $derived.by(() => {
    const m = app?.case.mapIds.map((id) => app.maps[id]).find(Boolean);
    return m ? m.imageSize[1] / m.imageSize[0] : null;
  });
  function matchMap() {
    if (!draft || !mapAspect) return;
    const f = draft.components.focus;
    patchComponent("focus", { h: Math.round((f.w - 20) * mapAspect) + 20 });
  }

  // --- Saved layouts ----------------------------------------------------------------------
  let newName = $state("");
  let confirmDelete = $state(false);
  function saveAsNew() {
    if (!draft || !newName.trim() || !app) return;
    const id = uniqueId(slugify(newName) || "layout", Object.keys(app.layouts));
    dispatch({ type: "layout/save", layout: { ...draft, id, name: newName.trim() } });
    editId = id;
    dirty = false;
    newName = "";
  }
</script>

<svelte:window onkeydown={onKey} onpointermove={move} onpointerup={up} />

{#if app && draft}
  <div class="layout-tab">
    <div class="row">
      <label class="grow">
        Editing
        <select value={editId} onchange={(e) => ((editId = e.currentTarget.value), (dirty = false), (selected = null))}>
          {#each layouts as l, i (l.id)}<option value={l.id}>{i < 9 ? `${i + 1} · ` : ""}{l.name || l.id}{l.id === app.overlay.layoutId ? " (on stream)" : ""}</option>{/each}
        </select>
      </label>
      {#if editId !== app.overlay.layoutId}
        <button type="button" class="primary" onclick={() => dispatch({ type: "overlay/setLayout", layoutId: editId! })}>Use on stream</button>
      {/if}
    </div>

    <div class="canvas" bind:clientWidth={cw} style:height="{OVERLAY_SIZE.h * scale}px" role="presentation" onpointerdown={() => (selected = null)}>
      {#each boxes as b (b.id)}
        {@const isSel = boxKey(selected) === b.id}
        <div
          class="box {b.kind}"
          class:sel={isSel}
          class:hidden={b.hidden}
          class:hatched={hatched.has(b.id)}
          class:locked={b.locked}
          style:left="{b.x * scale}px"
          style:top="{b.y * scale}px"
          style:width="{b.w * scale}px"
          style:height="{b.h * scale}px"
          style:z-index={isSel ? 200 : b.z + 1}
          onpointerdown={(e) => down(e, b, null)}
          role="presentation"
        >
          <span class="name">{b.label}</span>
          {#if isSel && !b.locked}
            {#each ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const as h (h)}
              <span class="handle {h}" onpointerdown={(e) => down(e, b, h)} role="presentation"></span>
            {/each}
          {/if}
        </div>
      {/each}
    </div>
    <p class="hint">Drag to move, handles to resize; snaps to an 8 px grid and other boxes (hold Alt for free movement). Arrows nudge 1 px (Shift: 8). Hatched boxes are partly under another.</p>

    {#if selected && selRect}
      <fieldset class="inspector">
        <legend>{selected.kind === "component" ? COMPONENT_LABELS[selected.id] : "Reserved area"}</legend>
        <div class="row">
          {#each ["x", "y", "w", "h"] as const as k (k)}
            <label>
              {k}
              <input
                type="number"
                value={selRect[k]}
                onchange={(e) => commit(setBox(boxKey(selected)!, { ...selRect, [k]: Math.round(Number(e.currentTarget.value)) }))}
              />
            </label>
          {/each}
        </div>
        {#if selected.kind === "component"}
          {@const id = selected.id}
          {@const c = draft.components[id]}
          <div class="row">
            <label class="check"><input type="checkbox" checked={c.visible} onchange={(e) => patchComponent(id, { visible: e.currentTarget.checked })} /> Visible</label>
            <label class="check"><input type="checkbox" checked={c.locked} onchange={(e) => patchComponent(id, { locked: e.currentTarget.checked })} /> Lock</label>
            <label class="opacity">Opacity <input type="range" min="0.2" max="1" step="0.05" value={c.opacity} onchange={(e) => patchComponent(id, { opacity: Number(e.currentTarget.value) })} /></label>
          </div>
          <div class="row">
            <span class="small">Layer {c.z}</span>
            <button type="button" onclick={() => raise(id, 1)}>Bring forward</button>
            <button type="button" onclick={() => raise(id, -1)}>Send back</button>
            {#if id === "focus" && mapAspect}<button type="button" onclick={matchMap} title="Height to fit the map's shape at this width">Match map shape</button>{/if}
          </div>
        {:else}
          {@const rid = selected.id}
          <div class="row">
            <label class="grow">Name <input value={draft.reserved.find((r) => r.id === rid)?.name ?? ""} maxlength="40" onchange={(e) => editReserved(rid, { name: e.currentTarget.value })} /></label>
            <button type="button" class="danger" onclick={() => editReserved(rid, {}, true)}>Remove</button>
          </div>
          <p class="hint">Reserved areas draw nothing on stream; they keep space clear for another tool's overlay (alerts, chat).</p>
        {/if}
      </fieldset>
    {/if}

    <div class="row">
      <label class="check" title="Every change goes to the overlay immediately">
        <input type="checkbox" bind:checked={live} onchange={() => live && dirty && apply()} /> Live edit
      </label>
      {#if dirty}
        <button type="button" class="primary" onclick={apply}>Apply</button>
        <button type="button" onclick={() => (dirty = false)}>Discard</button>
      {/if}
      <button type="button" onclick={addReserved}>+ Reserved area</button>
      <label class="check">
        <input type="checkbox" checked={app.overlay.showGuides} onchange={(e) => dispatch({ type: "overlay/configure", patch: { showGuides: e.currentTarget.checked } })} />
        Show guides on the overlay
      </label>
    </div>

    <fieldset>
      <legend>Saved layouts</legend>
      <div class="row">
        <label class="grow">Name <input value={draft.name} maxlength="40" onchange={(e) => commit({ ...draft!, name: e.currentTarget.value })} /></label>
        {#if confirmDelete}
          <button type="button" class="danger" onclick={() => (dispatch({ type: "layout/delete", layoutId: draft!.id }), (confirmDelete = false), (editId = null))}>Really delete</button>
          <button type="button" onclick={() => (confirmDelete = false)}>Keep</button>
        {:else if layouts.length > 1}
          <button type="button" class="danger" onclick={() => (confirmDelete = true)}>Delete</button>
        {/if}
      </div>
      <div class="row">
        <input class="grow" bind:value={newName} maxlength="40" placeholder="New layout name (e.g. map-focus)" onkeydown={(e) => e.key === "Enter" && saveAsNew()} />
        <button type="button" onclick={saveAsNew} disabled={!newName.trim()}>Save as new</button>
      </div>
      <p class="hint">
        Keys <kbd>1</kbd>–<kbd>9</kbd> switch the overlay between saved layouts. Pin one per OBS scene with
        <code>/overlay?layout={draft.id}</code>; split layers into separate sources with <code>?only=title,cast</code> or <code>?except=notes</code>.
      </p>
    </fieldset>

    <FontsPanel {conn} {live} />
  </div>
{/if}

<style>
  .layout-tab {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: end;
  }
  .grow {
    flex: 1;
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
    gap: 4px;
    color: inherit;
    font-size: 13px;
  }
  .opacity {
    flex-direction: row;
    align-items: center;
    gap: 4px;
  }
  input,
  select {
    min-width: 0;
    padding: 5px;
    font: inherit;
    font-size: 13px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
    color: #2b2118;
  }
  input[type="number"] {
    width: 70px;
  }
  .canvas {
    position: relative;
    background: repeating-conic-gradient(#d5d0c6 0 25%, #ebe7df 0 50%) 0 0 / 16px 16px;
    border: 1px solid #8a7354;
    overflow: hidden;
    user-select: none;
    touch-action: none;
  }
  .box {
    position: absolute;
    box-sizing: border-box;
    background: rgb(239 228 204 / 0.92);
    border: 1px solid #8a7354;
    cursor: move;
  }
  .box.reserved {
    background: repeating-linear-gradient(45deg, rgb(184 134 11 / 0.25) 0 6px, transparent 6px 12px);
    border: 1px dashed #b8860b;
  }
  .box.hatched::after {
    content: "";
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(-45deg, rgb(43 33 24 / 0.18) 0 4px, transparent 4px 9px);
    pointer-events: none;
  }
  .box.hidden {
    opacity: 0.35;
    border-style: dashed;
  }
  .box.locked {
    cursor: not-allowed;
  }
  .box.sel {
    outline: 2px solid #d6452d;
  }
  .name {
    position: absolute;
    left: 3px;
    top: 1px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
  }
  .handle {
    position: absolute;
    width: 10px;
    height: 10px;
    background: #fff;
    border: 2px solid #d6452d;
    box-sizing: border-box;
  }
  .handle.n,
  .handle.s {
    left: calc(50% - 5px);
    cursor: ns-resize;
  }
  .handle.e,
  .handle.w {
    top: calc(50% - 5px);
    cursor: ew-resize;
  }
  .handle.n,
  .handle.ne,
  .handle.nw {
    top: -5px;
  }
  .handle.s,
  .handle.se,
  .handle.sw {
    bottom: -5px;
  }
  .handle.e,
  .handle.ne,
  .handle.se {
    right: -5px;
  }
  .handle.w,
  .handle.nw,
  .handle.sw {
    left: -5px;
  }
  .handle.ne,
  .handle.sw {
    cursor: nesw-resize;
  }
  .handle.nw,
  .handle.se {
    cursor: nwse-resize;
  }
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid #d8c9aa;
    border-radius: 6px;
  }
  legend {
    font-size: 12px;
    color: #6b5a44;
  }
  .small {
    font-size: 12px;
    color: #6b5a44;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: #6b5a44;
  }
  kbd,
  code {
    font-size: 11px;
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
