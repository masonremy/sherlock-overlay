<script lang="ts">
  import { connect } from "../lib/socket";

  const { status, snapshot, lastError, dispatch, undo, redo } = connect();

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
      if (e.target instanceof HTMLInputElement) return; // let text fields undo their own typing
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<main>
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
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f6f0e2;
    color: #2b2118;
    font-family: system-ui, sans-serif;
  }
  main {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 420px;
    min-height: 100vh;
    box-sizing: border-box;
    padding: 12px;
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
  button {
    font: inherit;
    padding: 8px 14px;
    border: 1px solid #8a7354;
    border-radius: 4px;
    background: #efe4cc;
    color: inherit;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: #e4d4b0;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
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
    margin-top: auto;
    display: flex;
    gap: 8px;
    align-items: center;
    border-top: 1px solid #d8c9aa;
    padding-top: 12px;
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
