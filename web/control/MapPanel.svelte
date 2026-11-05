<script lang="ts">
  import { tick, untrack } from "svelte";
  import type { TrailStep } from "../../shared/schema";
  import { currentInvestigator } from "../../shared/game";
  import { searchCharacters, suggestKind } from "../lib/cast";
  import type { Connection } from "../lib/socket";
  import { KIND_LABELS, newStepId, searchZones, type ZoneMatch, zoneName } from "../lib/trail";
  import PlayMap from "./PlayMap.svelte";
  import type { PlayState } from "./play.svelte";

  interface Props {
    conn: Connection;
    play: PlayState;
    active: boolean;
    onSetupMaps: () => void;
    onAddCharacter: () => void;
  }

  let { conn, play, active, onSetupMaps, onAddCharacter }: Props = $props();
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
  // Characters with an address come first: typing a name jumps to where they live.
  type Match = ZoneMatch & { who?: string };
  const results = $derived.by((): Match[] => {
    if (!app) return [];
    const people = searchCharacters(query, app.characters, app.maps, app.case.mapIds).map((m) => ({
      mapId: m.mapId,
      mapName: app.maps[m.mapId]?.name || m.mapId,
      zone: m.zone,
      who: m.character.name,
    }));
    // Informants by name: "scot" finds Scotland Yard's address.
    const q = query.trim().toLowerCase();
    const helpers =
      q.length < 2
        ? []
        : informants
            .filter((i) => i.name.toLowerCase().includes(q))
            .map((i) => ({ mapId: i.mapId, mapName: i.mapName, zone: i.zone, who: i.name }));
    return [...people, ...helpers, ...searchZones(query, caseMaps)];
  });

  // Informant shortcuts for the case's maps: one tap selects their address.
  const informants = $derived(
    caseMaps.flatMap((m) =>
      m.informants.flatMap((i) => {
        const zone = m.zones.find((z) => z.id === i.zoneId);
        return zone ? [{ ...i, mapId: m.id, mapName: m.name || m.id, zone }] : [];
      }),
    ),
  );
  $effect(() => {
    query;
    hi = 0;
  });

  function choose(m: Match) {
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
  /** Timesheet mode: the lead's stated duration in minutes. */
  let duration = $state<number | null>(null);
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

  // Suggest a kind for the selected zone (a return visit after a new letter is a re-read).
  let suggested = $state<TrailStep["kind"]>("lead");
  $effect(() => {
    const zoneId = play.selected;
    const mapId = map?.id;
    untrack(() => {
      suggested = app && mapId && zoneId ? suggestKind(trail, app.keys, mapId, zoneId) : "lead";
      kind = suggested;
    });
  });

  // After recording at someone's address, offer to link them to the new step.
  let metOffer = $state<{ stepId: string; ids: string[] } | null>(null);
  let metTimer: ReturnType<typeof setTimeout> | undefined;
  const metChars = $derived(
    metOffer && app ? app.characters.filter((c) => metOffer!.ids.includes(c.id)) : [],
  );
  function offerMet(stepId: string, place: { mapId: string; zoneId: string }) {
    const ids =
      app?.characters
        .filter((c) => !c.hidden && c.address?.mapId === place.mapId && c.address.zoneId === place.zoneId)
        .map((c) => c.id) ?? [];
    clearTimeout(metTimer);
    metOffer = ids.length ? { stepId, ids } : null;
    if (metOffer) metTimer = setTimeout(() => (metOffer = null), 12000);
  }
  function linkMet(characterId: string) {
    if (!metOffer) return;
    const step = trail.find((t) => t.id === metOffer!.stepId);
    if (step && !step.characterIds.includes(characterId)) {
      dispatch({ type: "trail/update", stepId: step.id, patch: { characterIds: [...step.characterIds, characterId] } });
    }
    const ids = metOffer.ids.filter((id) => id !== characterId);
    metOffer = ids.length ? { ...metOffer, ids } : null;
  }
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
    let stepId: string;
    if (t.kind === "replace") {
      const patch = "customLabel" in place ? { ...place, mapId: null, zoneId: null } : { ...place, customLabel: null };
      dispatch({ type: "trail/update", stepId: t.stepId, patch: { ...patch, kind } });
      n = targetStep + 1;
      stepId = t.stepId;
    } else {
      const index = t.kind === "insert" ? t.index : undefined;
      stepId = newStepId();
      // Whose turn it was (the book passes left on each new step).
      const by = index === undefined ? (currentInvestigator(app?.case.players ?? [], trail)?.id ?? null) : null;
      const time = app?.case.timesheet ? duration : null;
      dispatch({ type: "trail/add", step: { id: stepId, ...place, kind, at, by, duration: time }, index });
      n = (index ?? trail.length) + 1;
    }
    if ("zoneId" in place) offerMet(stepId, place);
    else metOffer = null;
    const placeName = "zoneId" in place ? (map?.zones.find((z) => z.id === place.zoneId)?.label ?? "") : place.customLabel;
    play.lastRecorded = { stepId, n, place: placeName, at: Date.now() };
    play.resetTarget();
    play.selected = null;
    kind = "lead";
    duration = null;
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
      // Esc peels back one layer: insert/replace target, selection, then the focus area.
      if (play.target.kind !== "append") play.resetTarget();
      else if (play.selected) play.selected = null;
      else if (app && app.overlay.focus !== "map") dispatch({ type: "overlay/returnFocus" });
    } else if (e.key === "0") {
      playMap?.fit();
    } else if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      onAddCharacter();
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
                  onmouseenter={() => (hi = i)}
                  onmousedown={(e) => e.preventDefault()}
                  onclick={() => choose(m)}
                >
                  <span>{#if m.who}<b>{m.who}</b> → {/if}{zoneName(m.zone)}</span>
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

    {#if informants.length}
      <div class="informants" aria-label="Informants">
        {#each informants as i (i.mapId + i.id)}
          <button
            type="button"
            class:on={play.mapId === i.mapId && play.selected === i.zone.id}
            title="{i.zone.label}{caseMaps.length > 1 ? ` · ${i.mapName}` : ''}"
            onclick={() => play.showZone(i.mapId, i.zone.id)}>{i.name}</button
          >
        {/each}
      </div>
    {/if}

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
      {#if app?.case.timesheet && kind !== "deadEnd"}
        <input
          class="minutes"
          type="number"
          min="0"
          max="1440"
          placeholder="min"
          title="The lead's stated duration in minutes (travel is added automatically)"
          value={duration ?? ""}
          oninput={(e) => (duration = e.currentTarget.value === "" ? null : Math.max(0, Math.round(Number(e.currentTarget.value))))}
        />
      {/if}
      <button type="button" class="big" class:flash={!!flash} disabled={!canRecord && !flash} onclick={record}>
        {flash ?? buttonLabel}
      </button>
    </div>

    <div class="row">
      {#if offMap === null}
        <button type="button" onclick={() => (offMap = "")}>Off-map lead…</button>
        <button type="button" onclick={onAddCharacter} title="Met someone (C)">+ Character</button>
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

    {#if selectedZone && suggested === "reread"}
      <p class="suggest">Re-read suggested: you've unlocked a letter since your last visit to {selectedZone.label}.</p>
    {/if}

    {#if metChars.length}
      <div class="met">
        {#each metChars as c (c.id)}
          <button type="button" onclick={() => linkMet(c.id)}>Also met: {c.name}?</button>
        {/each}
        <button type="button" class="x" onclick={() => (metOffer = null)} aria-label="Dismiss">×</button>
      </div>
    {/if}

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
  .informants {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .informants button {
    flex: none;
    padding: 3px 9px;
    font-size: 12px;
    border-radius: 999px;
  }
  .informants button.on {
    background: #2b2118;
    color: #fff;
  }
  .minutes {
    width: 64px;
  }
  .suggest {
    margin: 0;
    font-size: 12px;
    color: #6b5a44;
  }
  .met {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .met button:not(.x) {
    background: #e6eefc;
    border-color: #9db4dc;
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
