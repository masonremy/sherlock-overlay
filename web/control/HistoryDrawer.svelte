<script lang="ts">
  import type { Connection } from "../lib/socket";

  let { conn, onClose }: { conn: Connection; onClose: () => void } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, jump } = conn;

  const history = $derived($snapshot?.history ?? { entries: [], index: 0 });
  // Newest first.
  const rows = $derived(history.entries.map((e, i) => ({ ...e, i })).reverse());
  let picked = $state<number | null>(null);

  const time = (at: string) =>
    at ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";

  function go(i: number) {
    jump(i - history.index);
    picked = null;
  }
</script>

<aside class="drawer" aria-label="History">
  <header>
    <strong>History</strong>
    <button type="button" class="x" onclick={onClose} aria-label="Close">×</button>
  </header>
  <p class="hint">Click an entry to roll back to it. Rolling back is itself undoable; undone entries stay below until a new change.</p>
  <ol>
    {#each rows as row (row.i)}
      <li class:now={row.i === history.index} class:undone={row.i > history.index}>
        <button type="button" onclick={() => (picked = picked === row.i ? null : row.i)} disabled={row.i === history.index}>
          <time>{time(row.at)}</time>
          <span>{row.label}</span>
          {#if row.i === history.index}<em>now</em>{/if}
        </button>
        {#if picked === row.i}
          <div class="confirm">
            <button type="button" class="primary" onclick={() => go(row.i)}>
              {row.i < history.index ? "Roll back to here" : "Redo to here"}
            </button>
            <button type="button" onclick={() => (picked = null)}>Cancel</button>
          </div>
        {/if}
      </li>
    {/each}
  </ol>
</aside>

<style>
  .drawer {
    position: fixed;
    z-index: 20;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    width: min(380px, 100vw);
    box-sizing: border-box;
    padding: 12px;
    background: #f6f0e2;
    border-left: 1px solid #b9a787;
    box-shadow: -6px 0 18px rgb(0 0 0 / 0.2);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .x {
    padding: 0 8px;
    border: none;
    background: none;
    font-size: 22px;
  }
  .hint {
    margin: 4px 0 8px;
    font-size: 12px;
    color: #6b5a44;
  }
  ol {
    flex: 1;
    overflow: auto;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    border-bottom: 1px solid #e3d7bd;
  }
  li > button {
    display: flex;
    gap: 8px;
    width: 100%;
    padding: 6px 4px;
    border: none;
    background: none;
    text-align: left;
    font-size: 13px;
  }
  li > button:disabled {
    opacity: 1;
    cursor: default;
  }
  li.now {
    background: #efe4cc;
    font-weight: 600;
  }
  li.undone {
    color: #8a7a62;
    font-style: italic;
  }
  time {
    flex: none;
    color: #6b5a44;
    font-variant-numeric: tabular-nums;
  }
  em {
    margin-left: auto;
    font-size: 11px;
    color: #8b2e22;
  }
  .confirm {
    display: flex;
    gap: 6px;
    padding: 0 4px 8px;
  }
  .primary {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
</style>
