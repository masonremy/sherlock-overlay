<script lang="ts">
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { DEFAULT_LAYOUT, type LayoutRect } from "../../shared/layout";
  import { castOrder, facesByZone } from "../lib/cast";
  import { connect } from "../lib/socket";
  import { isNumbered, leadCount } from "../lib/trail";
  import CastRail from "./CastRail.svelte";
  import Intro from "./Intro.svelte";
  import KeyGrid from "./KeyGrid.svelte";
  import MapFocus from "./MapFocus.svelte";

  // Read-only: the overlay never sends actions. It shows the committed trail,
  // never the panel's staged edits.
  const { snapshot, mirror, cue } = connect();
  const checker = new URLSearchParams(location.search).get("bg") === "checker";
  const layout = DEFAULT_LAYOUT;

  const PAD = 10;
  const TABS_H = 30;
  const ELSEWHERE_H = 46;

  const app = $derived($snapshot?.state);
  const trail = $derived(app?.trail ?? []);
  const caseMaps = $derived(app ? app.case.mapIds.map((id) => app.maps[id]).filter(Boolean) : []);

  // Mirror follows the panel; otherwise a pinned map, else the trail's latest map.
  const mapId = $derived.by(() => {
    if (!app) return null;
    const usable = (id: string | null | undefined) => (id && caseMaps.some((m) => m.id === id) ? id : null);
    if (app.overlay.mapView === "mirror" && usable($mirror?.mapId)) return $mirror!.mapId;
    return usable(app.overlay.mapId) ?? usable(trail.findLast((t) => t.mapId)?.mapId) ?? caseMaps[0]?.id ?? null;
  });
  const map = $derived(mapId ? (app?.maps[mapId] ?? null) : null);

  const elsewhere = $derived(
    trail.map((step, i) => ({ step, n: i + 1 })).filter(({ step }) => !step.zoneId && step.customLabel),
  );
  const mapW = $derived(layout.focus.w - 2 * PAD);
  const mapH = $derived(
    layout.focus.h - 2 * PAD - (caseMaps.length > 1 ? TABS_H : 0) - (elsewhere.length ? ELSEWHERE_H : 0),
  );

  const box = (r: LayoutRect) => `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;z-index:${r.z}`;

  const cast = $derived(app ? castOrder(app.characters, trail) : []);
  const faces = $derived(app && map ? facesByZone(trail, map.id, app.characters) : {});

  // Animations that replay state (key flips) only run after the first snapshot.
  let settled = $state(false);
  $effect(() => {
    if (app && !settled) setTimeout(() => (settled = true), 0);
  });

  // --- Introductions: newly visible characters play one at a time ------------
  const INTRO_MS = 2600;
  let known: Set<string> | null = null;
  let queue: string[] = [];
  let introId = $state<string | null>(null);
  let introTimer: ReturnType<typeof setTimeout> | undefined;
  const introChar = $derived(app?.characters.find((c) => c.id === introId && !c.hidden) ?? null);

  function playNext() {
    clearTimeout(introTimer);
    // Skip anyone hidden or deleted while they waited their turn.
    const showable = (id: string) => app?.characters.some((c) => c.id === id && !c.hidden);
    do introId = queue.shift() ?? null;
    while (introId && !showable(introId));
    if (introId) introTimer = setTimeout(playNext, INTRO_MS);
  }
  function enqueue(id: string) {
    if (id === introId || queue.includes(id)) return;
    queue.push(id);
    if (!introId) playNext();
  }

  // Both effects untrack the queue: they must re-run on new characters or a new
  // cue only, never because an intro started or ended.
  $effect(() => {
    if (!app) return;
    const visible = app.characters.filter((c) => !c.hidden).map((c) => c.id);
    untrack(() => {
      if (known === null) {
        known = new Set(visible); // already on stage when the overlay loaded
        return;
      }
      for (const id of visible) {
        if (!known.has(id)) {
          known.add(id);
          enqueue(id);
        }
      }
      // Hidden or deleted mid-introduction: move straight on.
      if (introId && !visible.includes(introId)) playNext();
    });
  });

  $effect(() => {
    const c = $cue?.cue;
    if (!c) return;
    untrack(() => {
      if (c.kind === "intro") enqueue(c.characterId);
      else {
        queue = [];
        playNext();
      }
    });
  });

  // The rail holds back whoever is being introduced, then welcomes them in.
  const railCast = $derived(cast.filter((c) => c.id !== introId && !queue.includes(c.id)));
</script>

<div class="stage" class:checker>
  {#if app}
    <header class="panel" style={box(layout.header)}>
      <span class="title">{app.case.title || "Untitled case"}</span>
      {#key leadCount(trail)}
        <span class="leads" in:fade={{ duration: 300 }}>Leads <strong>{leadCount(trail)}</strong></span>
      {/key}
    </header>

    {#if map}
      <section class="panel focus" style={box(layout.focus)} style:padding="{PAD}px">
        {#if caseMaps.length > 1}
          <nav class="tabs" style:height="{TABS_H}px">
            {#each caseMaps as m (m.id)}
              <span class:on={m.id === map.id}>{m.name || m.id}</span>
            {/each}
          </nav>
        {/if}
        {#key map.id}
          <div in:fade={{ duration: 400 }}>
            <MapFocus {map} {trail} {faces} mode={app.overlay.mapView} mirror={$mirror} width={mapW} height={mapH} />
          </div>
        {/key}
        {#if elsewhere.length}
          <div class="elsewhere" style:height="{ELSEWHERE_H}px">
            <span class="label">Elsewhere</span>
            {#each elsewhere as { step, n } (step.id)}
              <span class="chip" class:hollow={!isNumbered(step.kind)} in:fade={{ duration: 400 }}>
                {#if isNumbered(step.kind)}<b>{n}</b>{/if}
                {step.customLabel}
              </span>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    {#if cast.length}
      <section class="panel" style={box(layout.cast)}>
        <CastRail characters={railCast} maps={app.maps} width={layout.cast.w} height={layout.cast.h} />
      </section>
    {/if}

    {#if app.keys.length}
      <section class="panel" style={box(layout.keys)}>
        <KeyGrid keys={app.keys} {trail} width={layout.keys.w} height={layout.keys.h} animate={settled} />
      </section>
    {/if}

    {#if introChar}
      {#key introChar.id}
        <div class="intro-slot" style={box({ ...layout.focus, z: 10 })}>
          <Intro character={introChar} />
        </div>
      {/key}
    {/if}
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 1920px;
    height: 1080px;
    background: transparent;
    font-family: "Source Sans 3", system-ui, sans-serif;
  }
  .stage.checker {
    background: repeating-conic-gradient(#bbb 0 25%, #eee 0 50%) 0 0 / 40px 40px;
  }
  .panel {
    position: absolute;
    box-sizing: border-box;
    background: #efe4cc;
    color: #2b2118;
    border: 1px solid #8a7354;
    box-shadow: 0 4px 18px rgb(0 0 0 / 0.4);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 28px;
  }
  .title {
    font-family: "IM Fell English", Georgia, serif;
    font-size: 32px;
  }
  .leads {
    font-size: 24px;
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
  }
  .leads strong {
    font-size: 30px;
    margin-left: 4px;
  }
  .intro-slot {
    position: absolute;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .focus {
    display: flex;
    flex-direction: column;
    border-radius: 4px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    align-items: start;
  }
  .tabs span {
    padding: 2px 12px;
    border-radius: 3px;
    font-size: 17px;
    color: #6b5a44;
  }
  .tabs span.on {
    background: #2b2118;
    color: #efe4cc;
  }
  .elsewhere {
    display: flex;
    align-items: center;
    gap: 10px;
    overflow: hidden;
    padding-top: 8px;
    box-sizing: border-box;
    white-space: nowrap;
  }
  .elsewhere .label {
    font-family: "IM Fell English", Georgia, serif;
    font-size: 20px;
    font-style: italic;
    color: #6b5a44;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 3px 12px 3px 4px;
    border-radius: 999px;
    background: #fff8ec;
    border: 1.5px solid #9b1c1c;
    font-size: 18px;
  }
  .chip b {
    display: inline-grid;
    place-items: center;
    min-width: 26px;
    height: 26px;
    padding: 0 4px;
    box-sizing: border-box;
    border-radius: 13px;
    background: #9b1c1c;
    color: #fff;
    font-family: "IM Fell English", Georgia, serif;
  }
  .chip.hollow {
    padding-left: 12px;
    border-style: dashed;
  }
</style>
