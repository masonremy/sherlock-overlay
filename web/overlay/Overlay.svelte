<script lang="ts">
  import { untrack } from "svelte";
  import { cubicInOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  import { timesheet } from "../../shared/game";
  import { COMPONENTS, DEFAULT_LAYOUT, type Component } from "../../shared/layout";
  import type { Layout, Theme } from "../../shared/schema";
  import { castOrder, facesByZone } from "../lib/cast";
  import { toolkitItems, type FocusItem } from "../lib/focus";
  import { ensureFonts, fontVars, themeFamilies } from "../lib/fonts";
  import { motion, ms } from "../lib/motion.svelte";
  import { isOnStream, noteRingZones } from "../lib/notes";
  import NotesStrip from "../lib/NotesStrip.svelte";
  import { shelfPapers } from "../lib/papers";
  import { connect } from "../lib/socket";
  import { isNumbered } from "../lib/trail";
  import EvidenceCard from "../lib/EvidenceCard.svelte";
  import CastRail from "./CastRail.svelte";
  import Guides from "./Guides.svelte";
  import Intro from "./Intro.svelte";
  import KeyGrid from "./KeyGrid.svelte";
  import MapFocus from "./MapFocus.svelte";
  import NewspaperFocus from "./NewspaperFocus.svelte";
  import NotesFocus from "./NotesFocus.svelte";
  import PaperFilters from "../lib/PaperFilters.svelte";
  import TitleBar from "./TitleBar.svelte";
  import Toolkit from "./Toolkit.svelte";
  import VerdictCard from "./VerdictCard.svelte";

  // Read-only: the overlay never sends actions. It shows the committed trail,
  // never the panel's staged edits.
  const { snapshot, mirror, cue, notesScroll } = connect();

  // --- URL options (one OBS source per layer, a fixed layout per scene…) ------
  const params = new URLSearchParams(location.search);
  const bg = params.get("bg"); // checker | paper
  const layoutParam = params.get("layout");
  const ALIASES: Record<string, Component> = { title: "header", header: "header", map: "focus", focus: "focus", cast: "cast", keys: "keys", notes: "notes", toolkit: "toolkit" };
  const list = (name: string) =>
    params.get(name)?.split(",").map((s) => ALIASES[s.trim().toLowerCase()]).filter(Boolean) ?? null;
  const only = list("only");
  const except = list("except");
  const motionOff = params.get("motion") === "off";

  const PAD = 10;
  const TABS_H = 30;
  const ELSEWHERE_H = 46;

  const app = $derived($snapshot?.state);
  const trail = $derived(app?.trail ?? []);
  const caseMaps = $derived(app ? app.case.mapIds.map((id) => app.maps[id]).filter(Boolean) : []);

  $effect(() => {
    motion.reduced = motionOff || !!app?.overlay.reducedMotion;
  });

  // --- Layout ---------------------------------------------------------------------
  const FALLBACK: Layout = {
    id: "full",
    name: "",
    components: Object.fromEntries(COMPONENTS.map((k) => [k, { ...DEFAULT_LAYOUT[k], opacity: 1, locked: false }])) as Layout["components"],
    reserved: [],
  };
  const layout = $derived(
    (app && ((layoutParam && app.layouts[layoutParam]) || app.layouts[app.overlay.layoutId] || Object.values(app.layouts)[0])) ||
      FALLBACK,
  );
  const L = $derived(layout.components);
  const shows = (id: Component) => L[id].visible && (!only || only.includes(id)) && (!except || !except.includes(id));
  const box = (id: Component) => {
    const r = L[id];
    return `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;z-index:${r.z};opacity:${r.opacity}`;
  };

  // --- Fonts: load first, then swap the variables in one go -----------------------
  let theme = $state<Theme | null>(null);
  $effect(() => {
    const t = app?.theme;
    if (!t) return;
    ensureFonts(themeFamilies(t)).then(() => {
      if (app?.theme === t) theme = t;
    });
  });
  const vars = (id?: Component) => (theme ? fontVars(theme, id) : "");
  // Evidence cards: their own font settings; the typed face unless overridden.
  const cardStyle = $derived.by(() => {
    if (!theme) return "";
    const display = theme.components.cards?.display;
    return fontVars(theme, "cards") + (display ? `; --card-font: "${display.replace(/"/g, "")}"` : "");
  });

  // --- Map --------------------------------------------------------------------------
  // Mirror follows the panel; otherwise a pinned map, else the trail's latest map.
  const mapId = $derived.by(() => {
    if (!app) return null;
    const usable = (id: string | null | undefined) => (id && caseMaps.some((m) => m.id === id) ? id : null);
    if (app.overlay.mapView === "mirror" && usable($mirror?.mapId)) return $mirror!.mapId;
    return usable(app.overlay.mapId) ?? usable(trail.findLast((t) => t.mapId)?.mapId) ?? caseMaps[0]?.id ?? null;
  });
  const map = $derived(mapId ? (app?.maps[mapId] ?? null) : null);
  const elsewhere = $derived(trail.map((step, i) => ({ step, n: i + 1 })).filter(({ step }) => !step.zoneId && step.customLabel));
  const mapW = $derived(L.focus.w - 2 * PAD);
  const mapH = $derived(L.focus.h - 2 * PAD - (caseMaps.length > 1 ? TABS_H : 0) - (elsewhere.length ? ELSEWHERE_H : 0));
  const cast = $derived(app ? castOrder(app.characters, trail) : []);
  const faces = $derived(app && map ? facesByZone(trail, map.id, app.characters) : {});

  // --- Newspaper ----------------------------------------------------------------------
  const day = $derived(app?.case.timesheet ? timesheet(trail, app.maps).now.day : 1);
  const shelf = $derived(app ? shelfPapers(app.papers, app.newspaper.paperId, day) : []);
  const openPaper = $derived(app ? (app.papers[app.newspaper.showing ?? ""] ?? app.papers[app.newspaper.paperId ?? ""] ?? null) : null);

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
    if (introId) introTimer = setTimeout(playNext, motion.reduced ? 1800 : INTRO_MS);
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

  // --- Focus area and toolkit ------------------------------------------------
  const onStream = $derived(app?.notes.filter(isOnStream) ?? []);
  const tools = $derived(toolkitItems(app?.newspaper.paperId ?? null));
  const cardNote = $derived(app?.notes.find((n) => n.id === app.overlay.cardNoteId) ?? null);
  // What the focus area actually draws: a hidden map or a missing paper show nothing.
  const focusShown = $derived.by((): FocusItem | null => {
    const f = app?.overlay.focus ?? "map";
    if (f === "map") return app?.overlay.hideMap ? null : "map";
    if (f === "newspaper") return openPaper ? "newspaper" : null;
    if (f === "card") return cardNote ? "card" : null;
    return f;
  });

  // A card is laid down on the focus area like a slip dropped on the table.
  function cardIn(_node: HTMLElement) {
    if (motion.reduced) return { duration: 200, css: (t: number) => `opacity: ${t}` };
    return {
      duration: 550,
      easing: cubicInOut,
      css: (t: number) => `opacity: ${Math.min(1, t * 2)}; transform: translateY(${(1 - t) * -90}px) scale(${1.08 - 0.08 * t})`,
    };
  }

  // Items fold into, and unfold out of, their toolkit icon (the verdict just rises).
  const TOOL_ICON = 40;
  function foldOrigin(item: FocusItem): string {
    const t = L.toolkit;
    const i = tools.indexOf(item as never);
    if (i < 0) return "50% 100%";
    const cx = t.x + (t.w * (i + 0.5)) / tools.length;
    const cy = t.y + t.h / 2;
    return `${cx - L.focus.x}px ${cy - L.focus.y}px`;
  }
  function fold(node: HTMLElement, { origin, delay = 0 }: { origin: string; delay?: number }) {
    node.style.transformOrigin = origin;
    if (motion.reduced) return { delay: 0, duration: 200, css: (t: number) => `opacity: ${t}` };
    return {
      delay,
      duration: 480,
      easing: cubicInOut,
      css: (t: number) => `transform: scale(${0.04 + 0.96 * t}); opacity: ${Math.min(1, t * 1.6)}`,
    };
  }

  // A dot on the notebook for on-stream notes viewers haven't seen expanded.
  let seenNotes: Set<string> | null = null;
  let unseenNotes = $state(false);
  $effect(() => {
    const ids = onStream.map((n) => n.id);
    const focused = app?.overlay.focus === "notes";
    untrack(() => {
      if (seenNotes === null || focused) seenNotes = new Set(ids);
      unseenNotes = ids.some((id) => !seenNotes!.has(id));
    });
  });
</script>

<div class="stage" class:checker={bg === "checker"} class:paperbg={bg === "paper"} class:reduced={motion.reduced} class:flat={app?.overlay.textures === false} style={vars()}>
  <PaperFilters />
  {#if app && !app.overlay.hideAll}
    {#if shows("header")}
      <header class="panel paper"style="{box('header')};{vars('header')}">
        <TitleBar {app} />
      </header>
    {/if}

    {#if shows("focus")}
      {#key focusShown}
        {#if focusShown === "map" && map}
          <section
            class="panel paper focus"
            style="{box('focus')};{vars('focus')}"
            style:padding="{PAD}px"
            in:fold={{ origin: foldOrigin("map"), delay: 180 }}
            out:fold={{ origin: foldOrigin("map") }}
          >
            {#if caseMaps.length > 1}
              <nav class="tabs" style:height="{TABS_H}px">
                {#each caseMaps as m (m.id)}
                  <span class:on={m.id === map.id}>{m.name || m.id}</span>
                {/each}
              </nav>
            {/if}
            {#key map.id}
              <div in:fade={{ duration: ms(400) }}>
                <MapFocus
                  {map}
                  {trail}
                  {faces}
                  rings={app.overlay.noteRings ? noteRingZones(app.notes, trail, map.id) : []}
                  mode={app.overlay.mapView}
                  mirror={$mirror}
                  width={mapW}
                  height={mapH}
                />
              </div>
            {/key}
            {#if elsewhere.length}
              <div class="elsewhere" style:height="{ELSEWHERE_H}px">
                <span class="label">Elsewhere</span>
                {#each elsewhere as { step, n } (step.id)}
                  <span class="chip" class:hollow={!isNumbered(step.kind)} in:fade={{ duration: ms(400) }}>
                    {#if isNumbered(step.kind)}<b>{n}</b>{/if}
                    {step.customLabel}
                  </span>
                {/each}
              </div>
            {/if}
          </section>
        {:else if focusShown === "newspaper" && openPaper}
          <section
            class="panel paper focus"
            style="{box('focus')};{vars('focus')}"
            style:padding="{PAD}px"
            in:fold={{ origin: foldOrigin("newspaper"), delay: 180 }}
            out:fold={{ origin: foldOrigin("newspaper") }}
          >
            <NewspaperFocus paper={openPaper} {shelf} zoom={app.newspaper.zoom} width={L.focus.w - 2 * PAD} height={L.focus.h - 2 * PAD} />
          </section>
        {:else if focusShown === "notes"}
          <section
            class="panel paper focus"
            style="{box('focus')};{vars('focus')}"
            in:fold={{ origin: foldOrigin("notes"), delay: 180 }}
            out:fold={{ origin: foldOrigin("notes") }}
          >
            <NotesFocus notes={onStream} {trail} characters={app.characters} maps={app.maps} group={app.overlay.notesGroup} {cardStyle} />
          </section>
        {:else if focusShown === "card" && cardNote}
          <section class="card-slot" style="{box('focus')};{cardStyle}" in:cardIn out:fade={{ duration: ms(250) }}>
            <EvidenceCard note={cardNote} {trail} characters={app.characters} maps={app.maps} width={Math.min(L.focus.w * 0.72, 760)} />
          </section>
        {:else if focusShown === "verdict"}
          <section
            class="panel paper focus"
            style="{box('focus')};{vars('focus')}"
            in:fold={{ origin: foldOrigin("verdict"), delay: 180 }}
            out:fold={{ origin: foldOrigin("verdict") }}
          >
            <VerdictCard {app} />
          </section>
        {/if}
      {/key}
    {/if}

    {#if cast.length && shows("cast")}
      <section class="panel paper"style="{box('cast')};{vars('cast')}">
        <CastRail characters={railCast} maps={app.maps} width={L.cast.w} height={L.cast.h} />
      </section>
    {/if}

    {#if app.keys.length && shows("keys")}
      <section class="panel paper"style="{box('keys')};{vars('keys')}">
        <KeyGrid keys={app.keys} {trail} width={L.keys.w} height={L.keys.h} animate={settled && !motion.reduced} />
      </section>
    {/if}

    {#if onStream.length && shows("notes")}
      <section class="panel paper"style="{box('notes')};{vars('notes')}" transition:fade={{ duration: ms(300) }}>
        <NotesStrip notes={onStream} characters={app.characters} maps={app.maps} scroll={$notesScroll} autoScroll={app.overlay.notesAutoScroll} />
      </section>
    {/if}

    {#if shows("toolkit")}
      <section class="panel paper toolkit"style="{box('toolkit')};{vars('toolkit')}">
        <Toolkit
          items={tools}
          focus={app.overlay.focus}
          dots={{ notes: unseenNotes, newspaper: !!app.newspaper.paperId && !app.newspaper.opened }}
          iconSize={TOOL_ICON}
        />
      </section>
    {/if}

    {#if introChar && shows("focus")}
      {#key introChar.id}
        <div class="intro-slot" style="{box('focus')};z-index:50;opacity:1;{vars('cast')}">
          <Intro character={introChar} />
        </div>
      {/key}
    {/if}

    {#if app.overlay.showGuides}
      <Guides {layout} />
    {/if}
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 1920px;
    height: 1080px;
    overflow: hidden;
    background: transparent;
    font-family: var(--font-body);
  }
  .stage.checker {
    background: repeating-conic-gradient(#bbb 0 25%, #eee 0 50%) 0 0 / 40px 40px;
  }
  .stage.paperbg {
    background: #5b4a36;
  }
  /* Reduced motion: no CSS animation or transition anywhere on the stage. */
  .stage.reduced :global(*) {
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
  }
  /* The look (paper, inked edge, shadow) comes from .paper in paper.css. */
  .panel {
    position: absolute;
    box-sizing: border-box;
    color: #2b2118;
  }
  .toolkit {
    border-radius: 6px;
  }
  .card-slot {
    position: absolute;
    display: grid;
    place-items: center;
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
    overflow: hidden;
  }
  .tabs {
    display: flex;
    gap: 6px;
    align-items: start;
  }
  .tabs span {
    padding: 2px 12px;
    border-radius: 3px;
    font-size: calc(17px * var(--fs, 1));
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
    font-family: var(--font-display);
    font-size: calc(20px * var(--fs, 1));
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
    font-size: calc(18px * var(--fs, 1));
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
    font-family: var(--font-display);
  }
  .chip.hollow {
    padding-left: 12px;
    border-style: dashed;
  }
</style>
