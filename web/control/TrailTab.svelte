<script lang="ts">
  import type { ActionInput } from "../../shared/actions";
  import type { TrailStep } from "../../shared/schema";
  import Avatar from "../lib/Avatar.svelte";
  import type { Connection } from "../lib/socket";
  import { isNumbered, KIND_LABELS, leadCount, stepPlace } from "../lib/trail";
  import type { PlayState } from "./play.svelte";

  type StepPatch = Extract<ActionInput, { type: "trail/update" }>["patch"];

  let { conn, play }: { conn: Connection; play: PlayState } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch } = conn;

  const app = $derived($snapshot?.state);
  const draft = $derived(app?.trailDraft ?? null);
  const steps = $derived(draft ?? app?.trail ?? []);
  const editMode = $derived(play.editing || !!draft);
  let expanded = $state<string | null>(null);
  let notice = $state<string | null>(null);

  // Follow drafts opened or closed elsewhere (another device, a reload, undo).
  let sawDraft = false;
  $effect(() => {
    if (draft) {
      sawDraft = true;
      play.editing = true;
    } else if (sawDraft) {
      sawDraft = false;
      play.editing = false;
      play.resetTarget();
    }
  });

  function startEditing() {
    play.editing = true;
    if (!play.liveEdit) dispatch({ type: "trail/beginEdit" });
  }

  function finishEditing(how: "apply" | "discard" | "done") {
    if (how !== "done") dispatch({ type: how === "apply" ? "trail/apply" : "trail/discard" });
    play.editing = false;
    play.resetTarget();
    expanded = null;
  }

  function toggle(step: TrailStep) {
    expanded = expanded === step.id ? null : step.id;
    if (expanded && step.mapId && step.zoneId) play.showZone(step.mapId, step.zoneId);
    // In edit mode, picking a step makes Record replace it.
    if (editMode) play.target = expanded ? { kind: "replace", stepId: step.id } : { kind: "append" };
  }

  function update(step: TrailStep, patch: StepPatch) {
    dispatch({ type: "trail/update", stepId: step.id, patch });
  }

  function remove(step: TrailStep, index: number) {
    const keys = app?.keys.filter((k) => k.unlockedAtStep === step.id) ?? [];
    notice = keys.length
      ? `Key ${keys.map((k) => k.letter).join(", ")} was unlocked on step ${index + 1}; it stays unlocked and is now stamped to ${
          index > 0 ? `step ${index}` : "no step"
        }.`
      : null;
    dispatch({ type: "trail/delete", stepId: step.id });
    expanded = null;
    play.resetTarget();
  }

  function commitText(step: TrailStep, field: "note" | "customLabel", input: HTMLInputElement) {
    const value = input.value.trim();
    if (field === "customLabel" && !value) input.value = step.customLabel ?? "";
    else if (value !== (step[field] ?? "")) update(step, { [field]: value });
  }

  // --- Drag to reorder (pointer events, so it works with touch too) --------
  let rowEls: HTMLLIElement[] = $state([]);
  let drag = $state<{ id: string; from: number; to: number; mids: number[] } | null>(null);

  function startDrag(e: PointerEvent, index: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const mids = rowEls.slice(0, steps.length).map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    drag = { id: steps[index].id, from: index, to: index, mids };
  }

  function moveDrag(e: PointerEvent) {
    if (!drag) return;
    // Final index = how many other rows sit above the pointer.
    drag.to = drag.mids.filter((m, i) => i !== drag!.from && m < e.clientY).length;
  }

  function endDrag() {
    if (drag && drag.to !== drag.from) dispatch({ type: "trail/move", stepId: drag.id, toIndex: drag.to });
    drag = null;
  }

  /** Row before which the drop line shows (indexes into `steps`), or -1 for "after the last". */
  const dropBefore = $derived.by(() => {
    if (!drag || drag.to === drag.from) return null;
    const others = steps.map((_, i) => i).filter((i) => i !== drag!.from);
    return drag.to < others.length ? others[drag.to] : -1;
  });
</script>

<div class="trail-tab">
  <div class="head">
    <span class="count">
      Leads <strong>{leadCount(steps)}</strong> · {steps.length} step{steps.length === 1 ? "" : "s"}
    </span>
    {#if !editMode}
      <label class="check" title="Edit straight on the overlay instead of staging changes">
        <input type="checkbox" bind:checked={play.liveEdit} /> Live edit
      </label>
      <button type="button" onclick={startEditing} disabled={!app}>Edit trail</button>
    {/if}
  </div>

  {#if editMode}
    <div class="banner" class:live={!draft}>
      {#if draft}
        <span>Editing: viewers keep seeing the old trail until you apply.</span>
        <button type="button" class="primary" onclick={() => finishEditing("apply")}>Apply</button>
        <button type="button" onclick={() => finishEditing("discard")}>Discard</button>
      {:else}
        <span>Live editing: changes show on the overlay straight away.</span>
        <button type="button" onclick={() => finishEditing("done")}>Done</button>
      {/if}
    </div>
    <p class="hint">
      Click a step to replace its place (pick a zone, then press Replace), drag ⋮⋮ to reorder, or insert a step before or
      after it.
    </p>
  {/if}

  {#if notice}
    <p class="notice">{notice} <button type="button" class="link" onclick={() => (notice = null)}>OK</button></p>
  {/if}

  <ol class:dragging={!!drag}>
    {#each steps as step, i (step.id)}
      <li
        bind:this={rowEls[i]}
        class:open={expanded === step.id}
        class:moving={drag?.id === step.id}
        class:drop-before={dropBefore === i}
        class:drop-after={dropBefore === -1 && i === steps.length - 1}
      >
        <div class="line">
          {#if editMode}
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
          {/if}
          <button type="button" class="row" onclick={() => toggle(step)}>
            <span class="num" class:hollow={!isNumbered(step.kind)}>{i + 1}</span>
            <span class="place">{step.zoneId ? "" : "✉ "}{app ? stepPlace(step, app.maps) : ""}</span>
            {#if step.kind !== "lead"}<span class="kind">{KIND_LABELS[step.kind]}</span>{/if}
            {#each step.characterIds as cid (cid)}
              {@const who = app?.characters.find((c) => c.id === cid)}
              {#if who}<span class="face" title={who.name}><Avatar character={who} size={22} ring={false} /></span>{/if}
            {/each}
            {#if step.note}<span class="note">{step.note}</span>{/if}
          </button>
        </div>

        {#if expanded === step.id}
          <div class="editor">
            <div class="fields">
              <select value={step.kind} onchange={(e) => update(step, { kind: e.currentTarget.value as TrailStep["kind"] })} aria-label="Kind">
                {#each Object.entries(KIND_LABELS) as [k, label]}<option value={k}>{label}</option>{/each}
              </select>
              {#if !step.zoneId}
                <input
                  value={step.customLabel ?? ""}
                  maxlength="80"
                  aria-label="Off-map label"
                  onchange={(e) => commitText(step, "customLabel", e.currentTarget)}
                  onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
              {/if}
            </div>
            <input
              value={step.note}
              maxlength="500"
              placeholder="Note (e.g. Met the landlady)"
              aria-label="Note"
              onchange={(e) => commitText(step, "note", e.currentTarget)}
              onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            {#if app?.characters.length}
              <div class="people">
                {#each step.characterIds as cid (cid)}
                  {@const who = app.characters.find((c) => c.id === cid)}
                  {#if who}
                    <span class="chip">
                      {who.name}
                      <button
                        type="button"
                        aria-label="Unlink {who.name}"
                        onclick={() => update(step, { characterIds: step.characterIds.filter((x) => x !== cid) })}>×</button
                      >
                    </span>
                  {/if}
                {/each}
                <select
                  value=""
                  aria-label="Link a character"
                  onchange={(e) => {
                    const v = e.currentTarget.value;
                    if (v) update(step, { characterIds: [...step.characterIds, v] });
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="">+ Met here…</option>
                  {#each app.characters.filter((c) => !step.characterIds.includes(c.id)) as c (c.id)}
                    <option value={c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
            {/if}
            <div class="actions">
              {#if app}
                {@const count = app.notes.filter((n) => n.stepIds.includes(step.id)).length}
                <button type="button" onclick={() => play.showNotes({ kind: "step", id: step.id })}>Notes ({count})</button>
              {/if}
              {#if editMode}
                <button type="button" onclick={() => (play.target = { kind: "insert", index: i })}>Insert before</button>
                <button type="button" onclick={() => (play.target = { kind: "insert", index: i + 1 })}>Insert after</button>
              {/if}
              <button type="button" class="danger" onclick={() => remove(step, i)}>Delete</button>
            </div>
          </div>
        {/if}
      </li>
    {:else}
      <li class="empty">No steps yet. Select a zone on the map and press Record move.</li>
    {/each}
  </ol>
</div>

<style>
  .trail-tab {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .count {
    margin-right: auto;
    font-size: 14px;
  }
  .count strong {
    font-size: 18px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
  }
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px;
    background: #e6eefc;
    border: 1px solid #9db4dc;
    border-radius: 6px;
    font-size: 13px;
  }
  .banner.live {
    background: #fdf2c9;
    border-color: #e0c56b;
  }
  .banner span {
    flex: 1 1 180px;
  }
  .hint,
  .notice {
    margin: 0;
    font-size: 12px;
    color: #6b5a44;
  }
  .notice {
    padding: 6px 8px;
    background: #fdf2c9;
    border-radius: 4px;
    color: inherit;
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
    border-bottom: 1px solid #e3d7bd;
  }
  li.open {
    background: #fbf6ea;
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
    align-items: center;
  }
  .handle {
    padding: 8px 6px;
    color: #8a7354;
    cursor: grab;
    touch-action: none;
  }
  .row {
    display: flex;
    flex: 1;
    gap: 8px;
    align-items: center;
    min-width: 0;
    padding: 7px 4px;
    border: none;
    background: none;
    text-align: left;
  }
  .num {
    flex: none;
    display: inline-grid;
    place-items: center;
    min-width: 24px;
    height: 24px;
    border-radius: 12px;
    background: #9b1c1c;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
  }
  .num.hollow {
    background: #fff8ec;
    color: #9b1c1c;
    box-shadow: inset 0 0 0 2px #9b1c1c;
  }
  .place {
    font-weight: 600;
    white-space: nowrap;
  }
  .kind {
    padding: 1px 6px;
    border-radius: 3px;
    background: #e3d7bd;
    font-size: 11px;
    white-space: nowrap;
  }
  .note {
    overflow: hidden;
    color: #6b5a44;
    font-size: 13px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .face {
    display: flex;
    flex: none;
  }
  .people {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .chip {
    display: inline-flex;
    gap: 2px;
    align-items: center;
    padding: 1px 2px 1px 8px;
    border-radius: 999px;
    background: #e6eefc;
    font-size: 13px;
  }
  .chip button {
    padding: 0 6px;
    border: none;
    background: none;
  }
  .editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 8px 10px 36px;
  }
  .fields {
    display: flex;
    gap: 6px;
  }
  .fields input {
    flex: 1;
  }
  input,
  select {
    min-width: 0;
    box-sizing: border-box;
    padding: 6px;
    font: inherit;
    font-size: 14px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
    color: #2b2118;
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
    font-size: 12px;
  }
  .empty {
    padding: 12px 4px;
    font-size: 13px;
    color: #6b5a44;
    border: none;
  }
</style>
