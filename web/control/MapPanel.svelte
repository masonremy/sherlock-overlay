<script lang="ts">
  import { tick } from "svelte";
  import type { TrailStep } from "../../shared/schema";
  import type { Connection } from "../lib/socket";
  import { KIND_LABELS, newStepId, searchZones, type ZoneMatch } from "../lib/trail";
  import PlayMap from "./PlayMap.svelte";
  import type { PlayState } from "./play.svelte";

  let { conn, play, active, onSetupMaps }: { conn: Connection; play: PlayState; active: boolean; onSetupMaps: () => void } =
    $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch, undo, sendMirror } = conn;

  const app = $derived($snapshot?.state);
  const caseMaps = $derived(app ? app.case.mapIds.map((id) => app.maps[id]).filter(Boolean) : []);
  const trail = $derived(app ? (app.trailDraft ?? app.trail) : []);
  const map = $derived(caseMaps.find((m) => m.id === play.mapId) ?? null);
  const selectedZone = $derived(map?.zones.find((z) => z.id === play.selected) ?? null);

  // Default map: where the trail last was, else the case's first map.
  $effect(() => {
    if (!app || map) return;
    const last = trail.findLast((t) => t.mapId && app.case.mapIds.includes(t.mapId))?.mapId;
    play.mapId = last ?? caseMaps[0]?.id ?? null;
    play.selected = null;
  });

  let playMap = $state<ReturnType<typeof PlayMap>>();
  $effect(() => {
    const req = play.focusRequest;
    if (req && map?.id === req.mapId) tick().then(() => playMap?.focusZone(req.zoneId));
  });

  // --- Mirror mode: stream the panel's view (throttled) ---------------------
  let lastRect: [number, number, number, number] | null = null;
  let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
  const mirroring = $derived(app?.overlay.mapView === "mirror");
  function onView(rect: [number, number, number, number]) {
    lastRect = rect;
    if (mirroring && !mirrorTimer) {
      mirrorTimer = setTimeout(() => {
        mirrorTimer = null;
        if (map && lastRect) sendMirror({ mapId: map.id, rect: lastRect });
      }, 60);
    }
  }
  $effect(() => {
    if (mirroring && map && lastRect) sendMirror({ mapId: map.id, rect: lastRect });
  });

  // --- Zone search -----------------------------------------------------------
  let query = $state("");
  let searchFocused = $state(false);
  let hi = $state(0);
  let searchInput = $state<HTMLInputElement>();
  const results = $derived(searchZones(query, caseMaps));
  $effect(() => {
    query;
    hi = 0;
  });

  function choose(m: ZoneMatch) {
    play.showZone(m.mapId, m.zone.id);
  }

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      hi = (hi + (e.key === "ArrowDown" ? 1 : results.length - 1)) % Math.max(1, results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = results[hi];
      // First Enter selects the match; a second Enter records it.
      if (m && (m.mapId !== play.mapId || m.zone.id !== play.selected)) choose(m);
      else if (canRecord) {
        record();
        query = "";
      }
    } else if (e.key === "Escape") {
      query = "";
      searchInput?.blur();
    }
  }

  // --- Recording -------------------------------------------------------------
  let kind = $state<TrailStep["kind"]>("lead");
  let offMap = $state<string | null>(null); // label being typed, or null when closed
  let flash = $state<string | null>(null);
  let undoUntil = $state(0);
  let now = $state(Date.now());
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  const targetStep = $derived(
    play.target.kind === "replace" ? trail.findIndex((t) => t.id === (play.target as { stepId: string }).stepId) : -1,
  );
  $effect(() => {
    // Drop a replace target whose step no longer exists.
    if (play.target.kind === "replace" && targetStep < 0) play.resetTarget();
  });

  const canRecord = $derived(!!app && !!map && !!selectedZone?.visitable);
  const buttonLabel = $derived.by(() => {
    if (!selectedZone) return "Select a zone on the map";
    if (!selectedZone.visitable) return `${selectedZone.label} is not visitable`;
    if (play.target.kind === "replace") return `Replace step ${targetStep + 1} → ${selectedZone.label}`;
    if (play.target.kind === "insert") return `Insert as step ${play.target.index + 1} → ${selectedZone.label}`;
    return `Record move → ${selectedZone.label}`;
  });

  function commit(place: { mapId: string; zoneId: string } | { customLabel: string }) {
    const t = play.target;
    const at = new Date().toISOString();
    let n: number;
    if (t.kind === "replace") {
      const patch = "customLabel" in place ? { ...place, mapId: null, zoneId: null } : { ...place, customLabel: null };
      dispatch({ type: "trail/update", stepId: t.stepId, patch: { ...patch, kind } });
      n = targetStep + 1;
    } else {
      const index = t.kind === "insert" ? t.index : undefined;
      dispatch({ type: "trail/add", step: { id: newStepId(), ...place, kind, at }, index });
      n = (index ?? trail.length) + 1;
    }
    play.resetTarget();
    play.selected = null;
    kind = "lead";
    flash = `Step ${n} ✓`;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = null), 1400);
    undoUntil = Date.now() + 5000;
    now = Date.now();
  }

  function record() {
    if (canRecord && map && selectedZone) commit({ mapId: map.id, zoneId: selectedZone.id });
  }

  function recordOffMap() {
    const label = offMap?.trim();
    if (!label) return;
    commit({ customLabel: label });
    offMap = null;
  }

  // Selecting the next zone ends the confirmation flash.
  $effect(() => {
    if (play.selected) flash = null;
  });

  // The Undo chip lives for 5 s after a record.
  $effect(() => {
    if (undoUntil <= now) return;
    const timer = setTimeout(() => (now = Date.now()), undoUntil - now);
    return () => clearTimeout(timer);
  });

  function onKey(e: KeyboardEvent) {
    if (!active || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as HTMLElement).matches?.("input, textarea, select, [contenteditable]")) return;
    if (e.key === "/") {
      e.preventDefault();
      searchInput?.focus();
      searchInput?.select();
    } else if (e.key === "Enter" && canRecord) {
      e.preventDefault();
      record();
    } else if (e.key === "Escape") {
      if (play.target.kind !== "append") play.resetTarget();
      else play.selected = null;
    } else if (e.key === "0") {
      playMap?.fit();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if app && !caseMaps.length}
  <div class="empty">
    <p>This case doesn't use any maps yet.</p>
    <button type="button" class="primary" onclick={onSetupMaps}>Set up maps</button>
  </div>
{:else if map}
  <div class="panel">
    <div class="top">
      <div class="search">
        <input
          bind:this={searchInput}
          bind:value={query}
          type="search"
          placeholder="Search zones  ( / )"
          aria-label="Search zones"
          onfocus={() => (searchFocused = true)}
          onblur={() => setTimeout(() => (searchFocused = false), 150)}
          onkeydown={onSearchKey}
        />
        {#if searchFocused && query.trim()}
          <ul class="results">
            {#each results as m, i (m.mapId + m.zone.id)}
              <li>
                <button
                  type="button"
                  class:hi={i === hi}
                  class:blocked={!m.zone.visitable}
                  onmousedown={(e) => e.preventDefault()}
                  onclick={() => choose(m)}
                >
                  <span>{m.zone.label}</span>
                  {#if caseMaps.length > 1}<small>{m.mapName}</small>{/if}
                </button>
              </li>
            {:else}
              <li class="none">No zone matches “{query}”</li>
            {/each}
          </ul>
        {/if}
      </div>
      {#if caseMaps.length > 1}
        <select
          value={map.id}
          onchange={(e) => {
            play.mapId = e.currentTarget.value;
            play.selected = null;
          }}
          aria-label="Map"
        >
          {#each caseMaps as m (m.id)}<option value={m.id}>{m.name || m.id}</option>{/each}
        </select>
      {/if}
    </div>

    <div class="map">
      <PlayMap
        bind:this={playMap}
        {map}
        {trail}
        selectedZoneId={play.selected}
        onSelect={(id) => (play.selected = id)}
        {onView}
      />
    </div>

    {#if play.target.kind !== "append"}
      <div class="target">
        {play.target.kind === "replace" ? `Replacing step ${targetStep + 1}` : `Inserting at step ${play.target.index + 1}`}
        <button type="button" class="x" onclick={() => play.resetTarget()} aria-label="Cancel">×</button>
      </div>
    {/if}

    <div class="record">
      <select bind:value={kind} aria-label="Step kind" title="Only leads count toward the total">
        {#each Object.entries(KIND_LABELS) as [k, label]}<option value={k}>{label}</option>{/each}
      </select>
      <button type="button" class="big" class:flash={!!flash} disabled={!canRecord && !flash} onclick={record}>
        {flash ?? buttonLabel}
      </button>
    </div>

    <div class="row">
      {#if offMap === null}
        <button type="button" onclick={() => (offMap = "")}>Record off-map lead…</button>
      {:else}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="grow"
          bind:value={offMap}
          maxlength="80"
          placeholder="e.g. Telegram to Lestrade"
          autofocus
          onkeydown={(e) => {
            if (e.key === "Enter") recordOffMap();
            if (e.key === "Escape") offMap = null;
          }}
        />
        <button type="button" onclick={recordOffMap} disabled={!offMap.trim()}>Record</button>
        <button type="button" onclick={() => (offMap = null)}>Cancel</button>
      {/if}
      {#if undoUntil > now}
        <button type="button" class="undo" onclick={() => ((undoUntil = 0), undo())}>Undo</button>
      {/if}
    </div>

    {#if app?.trailDraft}
      <p class="draft">Editing the trail: new steps are staged until you Apply in the Trail tab.</p>
    {/if}
  </div>
{/if}

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    min-height: 0;
  }
  .top {
    display: flex;
    gap: 6px;
  }
  .search {
    position: relative;
    flex: 1;
  }
  input,
  select {
    box-sizing: border-box;
    padding: 7px 8px;
    font: inherit;
    font-size: 15px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
    color: #2b2118;
  }
  .search input {
    width: 100%;
  }
  .results {
    position: absolute;
    z-index: 5;
    left: 0;
    right: 0;
    top: 100%;
    margin: 2px 0 0;
    padding: 4px;
    list-style: none;
    background: #fffaf0;
    border: 1px solid #b9a787;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.2);
  }
  .results button {
    display: flex;
    justify-content: space-between;
    width: 100%;
    border: none;
    background: none;
    text-align: left;
  }
  .results button.hi {
    background: #efe4cc;
  }
  .results button.blocked span {
    text-decoration: line-through;
    opacity: 0.6;
  }
  .results small {
    color: #6b5a44;
  }
  .none {
    padding: 6px;
    font-size: 13px;
    color: #6b5a44;
  }
  .map {
    flex: 1;
    min-height: 220px;
    border: 1px solid #b9a787;
    border-radius: 6px;
    overflow: hidden;
  }
  .target {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 4px 4px 10px;
    background: #fdf2c9;
    border-radius: 4px;
    font-size: 13px;
  }
  .x {
    padding: 0 8px;
    border: none;
    background: none;
    font-size: 18px;
  }
  .record {
    display: flex;
    gap: 6px;
  }
  .big {
    flex: 1;
    padding: 12px;
    font-size: 17px;
    font-weight: 600;
    background: #8b2e22;
    border-color: #6e2219;
    color: #fff;
    transition: background 200ms;
  }
  .big:disabled {
    background: #c9bba0;
    border-color: #b9a787;
    color: #5b4c38;
    opacity: 1;
  }
  .big.flash {
    background: #2f6b2f;
    border-color: #2f6b2f;
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
  .undo {
    margin-left: auto;
    background: #2b2118;
    border-color: #2b2118;
    color: #fff;
  }
  .draft {
    margin: 0;
    padding: 6px 8px;
    background: #e6eefc;
    border-radius: 4px;
    font-size: 13px;
  }
  .empty {
    padding: 16px;
    text-align: center;
  }
  .primary {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
</style>
