<script lang="ts">
  import { connect } from "../lib/socket";
  import HistoryDrawer from "./HistoryDrawer.svelte";
  import MapPanel from "./MapPanel.svelte";
  import OverlayTab from "./OverlayTab.svelte";
  import { PlayState } from "./play.svelte";
  import TrailTab from "./TrailTab.svelte";
  import ZoneEditor from "./ZoneEditor.svelte";

  const conn = connect();
  const { status, snapshot, lastError, dispatch, undo, redo } = conn;
  const play = new PlayState();

  // Two modes: Play (record the investigation) and Zones (build map definitions).
  type Mode = "play" | "zones";
  type Tab = "trail" | "case" | "overlay";
  const initial = location.hash.slice(1);
  let mode = $state<Mode>(initial === "maps" || initial === "zones" ? "zones" : "play");
  let tab = $state<Tab>((["trail", "case", "overlay"] as const).find((t) => t === initial) ?? "trail");
  let showHistory = $state(false);
  $effect(() => {
    history.replaceState(null, "", `#${mode === "zones" ? "zones" : tab}`);
  });

  // Title edits commit on Enter or blur; Esc restores the live value.
  let titleDraft = $state("");
  let editingTitle = $state(false);
  $effect(() => {
    if (!editingTitle) titleDraft = $snapshot?.state.case.title ?? "";
  });

  function commitTitle() {
    editingTitle = false;
    if ($snapshot && titleDraft !== $snapshot.state.case.title) {
      dispatch({ type: "case/setTitle", title: titleDraft });
    }
  }

  function onTitleKey(e: KeyboardEvent) {
    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
    if (e.key === "Escape") {
      editingTitle = false;
      titleDraft = $snapshot?.state.case.title ?? "";
      (e.currentTarget as HTMLInputElement).blur();
    }
  }

  function onKey(e: KeyboardEvent) {
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

  {#if mode === "play"}
    <div class="play">
      <section class="mapcol">
        <MapPanel {conn} {play} active={mode === "play"} onSetupMaps={() => (mode = "zones")} />
      </section>
      <section class="tabcol">
        <nav class="tabs">
          <button type="button" class:on={tab === "trail"} onclick={() => (tab = "trail")}>Trail</button>
          <button type="button" class:on={tab === "case"} onclick={() => (tab = "case")}>Case</button>
          <button type="button" class:on={tab === "overlay"} onclick={() => (tab = "overlay")}>Overlay</button>
        </nav>
        <div class="tabbody">
          {#if tab === "trail"}
            <TrailTab {conn} {play} />
          {:else if tab === "case"}
            <div class="case">
              <section>
                <label for="title">Case title</label>
                <input
                  id="title"
                  maxlength="200"
                  placeholder="Case 3 · The Tin Soldier"
                  bind:value={titleDraft}
                  onfocus={() => (editingTitle = true)}
                  onblur={commitTitle}
                  onkeydown={onTitleKey}
                  disabled={!$snapshot}
                />
              </section>
              <section class="rev">
                <div>
                  <span class="label">Revision</span>
                  <span class="value">{$snapshot?.rev ?? "–"}</span>
                </div>
                <button onclick={() => dispatch({ type: "debug/ping" })} disabled={$status !== "open"}>Bump rev</button>
              </section>
            </div>
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
    <span class="conn" title={$status}>
      <span class="dot {$status}"></span>
      {$status === "open" ? "Connected" : $status === "connecting" ? "Connecting…" : "Offline"}
    </span>
  </footer>
</div>

{#if showHistory}
  <HistoryDrawer {conn} onClose={() => (showHistory = false)} />
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
    gap: 4px;
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
      flex: 0 0 380px;
      min-height: 0;
    }
    .tabbody {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
  }
  .case {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  label,
  .label {
    display: block;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b5a44;
    margin-bottom: 4px;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px;
    font: inherit;
    font-size: 16px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
  }
  .rev {
    display: flex;
    align-items: end;
    justify-content: space-between;
  }
  .value {
    font-size: 40px;
    font-variant-numeric: tabular-nums;
    font-family: Georgia, serif;
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
