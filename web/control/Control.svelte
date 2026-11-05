<script lang="ts">
  import { focusAction, toolkitItems, type ToolItem } from "../lib/focus";
  import ToolIcon from "../lib/icons/ToolIcon.svelte";
  import { connect } from "../lib/socket";
  import { stepPlace } from "../lib/trail";
  import CaseTab from "./CaseTab.svelte";
  import CastTab from "./CastTab.svelte";
  import CharacterForm from "./CharacterForm.svelte";
  import HistoryDrawer from "./HistoryDrawer.svelte";
  import KeysTab from "./KeysTab.svelte";
  import LayoutTab from "./LayoutTab.svelte";
  import MapPanel from "./MapPanel.svelte";
  import NotesTab from "./NotesTab.svelte";
  import OverlayTab from "./OverlayTab.svelte";
  import DocsTab from "./DocsTab.svelte";
  import { loadDocList } from "../lib/docs";
  import { PlayState, TABS } from "./play.svelte";
  import QuickNote from "./QuickNote.svelte";
  import TrailTab from "./TrailTab.svelte";
  import ZoneEditor from "./ZoneEditor.svelte";

  const conn = connect();
  const { status, snapshot, lastError, dispatch, undo, redo } = conn;
  const play = new PlayState();

  // Two modes: Play (record the investigation) and Zones (build map definitions).
  type Mode = "play" | "zones";
  const TAB_LABELS = { trail: "Trail", notes: "Notes", cast: "Cast", keys: "Keys", docs: "Documents", case: "Case", overlay: "Overlay", layout: "Layout" };
  const initial = location.hash.slice(1);
  let mode = $state<Mode>(initial === "maps" || initial === "zones" ? "zones" : "play");
  play.tab = TABS.find((t) => t === initial) ?? (initial === "paper" ? "docs" : "trail");

  // Focus area / toolkit
  const overlay = $derived($snapshot?.state.overlay);
  let docKinds = $state<("directory" | "informants")[]>([]);
  loadDocList().then((docs) => (docKinds = (["directory", "informants"] as const).filter((k) => docs.some((d) => d.kind === k))));
  const tools = $derived(toolkitItems($snapshot?.state.newspaper.paperId ?? null, docKinds));
  const SLOTS = ["map", "newspaper", "notes", "directory", "informants"] as const;
  const TOOL_NAMES: Record<ToolItem, string> = { map: "Map", newspaper: "Newspaper", notes: "Notes", directory: "Directory", informants: "Informants" };
  function toggleFocus(item: ToolItem) {
    if (!overlay || !tools.includes(item)) return;
    const action = focusAction(overlay.focus, item);
    if (!action) return;
    dispatch(action);
    // First opening of the paper clears the toolkit dot.
    if (item === "newspaper" && action.type === "overlay/setFocus" && !$snapshot?.state.newspaper.opened) {
      dispatch({ type: "newspaper/update", patch: { opened: true } });
    }
  }
  function toggleHideAll() {
    if (overlay) dispatch({ type: "overlay/configure", patch: { hideAll: !overlay.hideAll } });
  }

  // Character form: null (closed), a new character, or an existing one.
  let charForm = $state<{ id: string | null } | null>(null);
  const liveTrail = $derived($snapshot ? ($snapshot.state.trailDraft ?? $snapshot.state.trail) : []);
  const latestStep = $derived.by(() => {
    const step = liveTrail.at(-1);
    return step && $snapshot ? { id: step.id, n: liveTrail.length, place: stepPlace(step, $snapshot.state.maps) } : null;
  });
  const selectedPlace = $derived(play.mapId && play.selected ? { mapId: play.mapId, zoneId: play.selected } : null);
  let showHistory = $state(false);
  $effect(() => {
    history.replaceState(null, "", `#${mode === "zones" ? "zones" : play.tab}`);
  });


  function onKey(e: KeyboardEvent) {
    // Ctrl+1–5 put the map, newspaper, notes, directory or informants in the focus area (again to dismiss).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && ["1", "2", "3", "4", "5"].includes(e.key) && mode === "play") {
      e.preventDefault();
      toggleFocus(SLOTS[Number(e.key) - 1]);
      return;
    }
    // Single-letter keys only when no text field has focus.
    const typing = (e.target as HTMLElement).matches?.("input, textarea, select, [contenteditable]");
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && mode === "play" && !charForm) {
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        play.quickNoteFocus++;
        return;
      }
      if (k === "e") {
        toggleFocus("notes");
        return;
      }
      if (k === "h") {
        toggleHideAll();
        return;
      }
      // 1–9 switch the overlay between saved layouts (0 fits the map).
      if (/^[1-9]$/.test(e.key) && $snapshot) {
        const ids = Object.keys($snapshot.state.layouts);
        const id = ids[Number(e.key) - 1];
        if (id && id !== $snapshot.state.overlay.layoutId) dispatch({ type: "overlay/setLayout", layoutId: id });
        return;
      }
    }
    // Alt+letter toggles that letter key (by physical key, so layouts with Alt symbols still work).
    if (e.altKey && !e.ctrlKey && !e.metaKey && $snapshot && mode === "play") {
      const letter = /^Key([A-Z])$/.exec(e.code)?.[1] ?? /^Digit(\d)$/.exec(e.code)?.[1];
      const key = letter && $snapshot.state.keys.find((k) => k.letter === letter);
      if (key) {
        e.preventDefault();
        dispatch({
          type: "key/update",
          letter: key.letter,
          patch: key.unlocked ? { unlocked: false } : { unlocked: true, unlockedAtStep: latestStep?.id ?? null },
        });
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      // Let text fields undo their own typing; checkboxes and buttons don't have any.
      const textField = "textarea, [contenteditable], input:not([type=checkbox], [type=radio], [type=button], [type=file])";
      if ((e.target as HTMLElement).matches?.(textField)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <nav class="modes">
    <button type="button" class:on={mode === "play"} onclick={() => (mode = "play")}>Play</button>
    <button type="button" class:on={mode === "zones"} onclick={() => (mode = "zones")}>Zones</button>
  </nav>

  {#if overlay?.hideAll}
    <div class="hidden-banner">
      Overlay hidden: viewers see nothing.
      <button type="button" onclick={toggleHideAll}>Show overlay (H)</button>
    </div>
  {/if}

  {#if mode === "play"}
    <QuickNote {conn} {play} />
    <div class="play">
      <section class="mapcol">
        <MapPanel
          {conn}
          {play}
          active={mode === "play" && !charForm}
          onSetupMaps={() => (mode = "zones")}
          onAddCharacter={() => (charForm = { id: null })}
        />
      </section>
      <section class="tabcol">
        <nav class="tabs">
          {#each TABS as t (t)}
            <button type="button" class:on={play.tab === t} onclick={() => (play.tab = t)}>{TAB_LABELS[t]}</button>
          {/each}
        </nav>
        <div class="tabbody">
          {#if play.tab === "trail"}
            <TrailTab {conn} {play} />
          {:else if play.tab === "notes"}
            <NotesTab {conn} {play} />
          {:else if play.tab === "cast"}
            <CastTab {conn} {play} onAdd={() => (charForm = { id: null })} onEdit={(id) => (charForm = { id })} />
          {:else if play.tab === "keys"}
            <KeysTab {conn} />
          {:else if play.tab === "docs"}
            <DocsTab {conn} {play} onToggle={toggleFocus} />
          {:else if play.tab === "case"}
            <CaseTab {conn} />
          {:else if play.tab === "layout"}
            <LayoutTab {conn} active={mode === "play" && play.tab === "layout"} />
          {:else}
            <OverlayTab {conn} />
          {/if}
        </div>
      </section>
    </div>
  {:else}
    <div class="zones">
      <ZoneEditor {conn} active={mode === "zones"} />
    </div>
  {/if}

  {#if $lastError}
    <p class="error">{$lastError}</p>
  {/if}

  <footer>
    <button onclick={undo} disabled={!$snapshot?.canUndo || $status !== "open"} title="Ctrl+Z">Undo</button>
    <button onclick={redo} disabled={!$snapshot?.canRedo || $status !== "open"} title="Ctrl+Shift+Z">Redo</button>
    <button onclick={() => (showHistory = !showHistory)} class:on={showHistory}>History</button>
    {#if overlay}
      <span class="toolkit" role="group" aria-label="Focus area">
        {#each tools as item (item)}
          <button
            type="button"
            class="tool"
            class:on={overlay.focus === item}
            title="{TOOL_NAMES[item]} in the focus area (Ctrl+{SLOTS.indexOf(item) + 1})"
            onclick={() => toggleFocus(item)}
          >
            <ToolIcon kind={item} size={24} state={overlay.focus === item ? "open" : "folded"} />
          </button>
        {/each}
      </span>
      <button type="button" class="hide" class:on={overlay.hideAll} onclick={toggleHideAll} title="Hide everything on the overlay (H)">
        {overlay.hideAll ? "Hidden" : "Hide all"}
      </button>
    {/if}
    <span class="conn" title={$status}>
      <span class="dot {$status}"></span>
      {$status === "open" ? "Connected" : $status === "connecting" ? "Connecting…" : "Offline"}
    </span>
  </footer>
</div>

{#if showHistory}
  <HistoryDrawer {conn} onClose={() => (showHistory = false)} />
{/if}

{#if charForm}
  <CharacterForm
    {conn}
    characterId={charForm.id}
    linkStep={charForm.id ? null : latestStep}
    {selectedPlace}
    onClose={() => (charForm = null)}
  />
{/if}

<style>
  :global(body) {
    margin: 0;
    background: #f6f0e2;
    color: #2b2118;
    font-family: system-ui, sans-serif;
  }
  :global(button) {
    font: inherit;
    font-size: 14px;
    padding: 6px 12px;
    border: 1px solid #8a7354;
    border-radius: 4px;
    background: #efe4cc;
    color: inherit;
    cursor: pointer;
  }
  :global(button:hover:not(:disabled)) {
    filter: brightness(0.95);
  }
  :global(button:disabled) {
    opacity: 0.45;
    cursor: default;
  }
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
    padding: 8px 12px 12px;
    gap: 8px;
  }
  .modes,
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0 2px;
    border-bottom: 1px solid #d8c9aa;
  }
  .modes button,
  .tabs button {
    border: none;
    border-bottom: 3px solid transparent;
    border-radius: 0;
    background: none;
    padding: 6px 12px;
  }
  .modes button.on,
  .tabs button.on {
    border-bottom-color: #8b2e22;
    font-weight: 600;
  }
  footer button.on {
    background: #2b2118;
    color: #fff;
  }
  .toolkit {
    display: flex;
    gap: 2px;
  }
  .tool {
    padding: 2px 4px;
  }
  .tool.on {
    background: #fff8e1;
    border-color: #b08d2b;
    box-shadow: inset 0 -3px 0 #b08d2b;
  }
  footer .hide.on {
    background: #8b1e1e;
    border-color: #8b1e1e;
  }
  .hidden-banner {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: #8b1e1e;
    color: #fff;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 600;
  }
  /* Dock first: one scrolling column with the map on top. */
  .play {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .mapcol {
    flex: none;
    height: max(420px, 62vh);
  }
  .tabcol {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .zones {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  /* Full browser tab: map and tabs side by side. */
  @media (min-width: 900px) {
    .play {
      flex-direction: row;
      overflow: hidden;
    }
    .mapcol {
      flex: 1;
      height: auto;
      min-width: 0;
    }
    .tabcol {
      flex: 0 0 400px;
      min-height: 0;
    }
    .tabbody {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
  }
  .error {
    margin: 0;
    padding: 8px;
    background: #f7d9d4;
    border-radius: 4px;
    font-size: 13px;
    white-space: pre-wrap;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    border-top: 1px solid #d8c9aa;
    padding-top: 10px;
  }
  .conn {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #b33;
  }
  .dot.open {
    background: #3a8a3a;
  }
  .dot.connecting {
    background: #d9a400;
  }
</style>
