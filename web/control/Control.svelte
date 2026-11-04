<script lang="ts">
  import { connect } from "../lib/socket";
  import ZoneEditor from "./ZoneEditor.svelte";

  const conn = connect();
  const { status, snapshot, lastError, dispatch, undo, redo } = conn;

  type Tab = "case" | "maps";
  let tab = $state<Tab>(location.hash === "#maps" ? "maps" : "case");
  $effect(() => {
    history.replaceState(null, "", `#${tab}`);
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
  <nav class="tabs">
    <button type="button" class:on={tab === "case"} onclick={() => (tab = "case")}>Case</button>
    <button type="button" class:on={tab === "maps"} onclick={() => (tab = "maps")}>Maps</button>
  </nav>

  <div class="body">
    {#if tab === "case"}
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
      <ZoneEditor {conn} active={tab === "maps"} />
    {/if}
  </div>

  {#if $lastError}
    <p class="error">{$lastError}</p>
  {/if}

  <footer>
    <button onclick={undo} disabled={!$snapshot?.canUndo || $status !== "open"} title="Ctrl+Z">Undo</button>
    <button onclick={redo} disabled={!$snapshot?.canRedo || $status !== "open"} title="Ctrl+Shift+Z">Redo</button>
    <span class="conn" title={$status}>
      <span class="dot {$status}"></span>
      {$status === "open" ? "Connected" : $status === "connecting" ? "Connecting…" : "Offline"}
    </span>
  </footer>
</div>

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
    gap: 10px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid #d8c9aa;
  }
  .tabs button {
    border: none;
    border-bottom: 3px solid transparent;
    border-radius: 0;
    background: none;
    padding: 6px 12px;
  }
  .tabs button.on {
    border-bottom-color: #8b2e22;
    font-weight: 600;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .case {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 420px;
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
