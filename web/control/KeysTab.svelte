<script lang="ts">
  import type { Connection } from "../lib/socket";
  import { stepPlace } from "../lib/trail";

  let { conn }: { conn: Connection } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch } = conn;

  const app = $derived($snapshot?.state);
  const steps = $derived(app ? (app.trailDraft ?? app.trail) : []);
  /** Unlocking stamps the latest step. */
  const currentStep = $derived(steps.at(-1)?.id ?? null);
  const stepNo = (id: string | null) => (id ? steps.findIndex((t) => t.id === id) + 1 : 0);

  let letter = $state("");
  let error = $state<string | null>(null);

  function add(unlocked: boolean) {
    const l = letter.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,3}$/.test(l)) {
      error = "A key is 1–3 letters or digits.";
      return;
    }
    error = null;
    dispatch({ type: "key/add", letter: l, unlocked, stepId: unlocked ? currentStep : null });
    letter = "";
  }

  function toggle(l: string, unlocked: boolean) {
    dispatch({
      type: "key/update",
      letter: l,
      patch: unlocked ? { unlocked: false } : { unlocked: true, unlockedAtStep: currentStep },
    });
  }
</script>

{#if app}
  <div class="keys">
    <p class="hint">
      Add letters as the game hands them out; nothing is listed in advance, so nothing is spoiled. Unlocking stamps the
      current step ({currentStep ? `step ${stepNo(currentStep)}` : "no steps yet"}). <kbd>Alt</kbd>+letter toggles a key.
    </p>
    <div class="add">
      <input
        bind:value={letter}
        maxlength="3"
        placeholder="A"
        aria-label="New key"
        onkeydown={(e) => e.key === "Enter" && add(e.shiftKey)}
      />
      <button type="button" onclick={() => add(false)}>Add locked</button>
      <button type="button" class="primary" onclick={() => add(true)}>Add &amp; unlock</button>
    </div>
    {#if error}<p class="error">{error}</p>{/if}

    <ul>
      {#each app.keys as k (k.letter)}
        <li>
          <button
            type="button"
            class="tile"
            class:unlocked={k.unlocked}
            onclick={() => toggle(k.letter, k.unlocked)}
            title={k.unlocked ? "Unlocked: click to lock" : "Locked: click to unlock"}
          >
            {k.letter}
            <small>{k.unlocked ? "✓" : "🔒"}</small>
          </button>
          <div class="fields">
            {#if k.unlocked}
              <label>
                From
                <select
                  value={k.unlockedAtStep ?? ""}
                  onchange={(e) =>
                    dispatch({ type: "key/update", letter: k.letter, patch: { unlockedAtStep: e.currentTarget.value || null } })}
                >
                  <option value="">no step</option>
                  {#each steps as s, i (s.id)}<option value={s.id}>step {i + 1}: {stepPlace(s, app.maps)}</option>{/each}
                </select>
              </label>
            {/if}
            <input
              value={k.note}
              maxlength="300"
              placeholder="Note"
              aria-label="Note"
              onchange={(e) => dispatch({ type: "key/update", letter: k.letter, patch: { note: e.currentTarget.value } })}
              onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </div>
          <input
            class="rename"
            value={k.letter}
            maxlength="3"
            aria-label="Rename key"
            title="Rename"
            onchange={(e) => {
              const l = e.currentTarget.value.trim().toUpperCase();
              if (/^[A-Z0-9]{1,3}$/.test(l) && l !== k.letter) dispatch({ type: "key/update", letter: k.letter, patch: { letter: l } });
              else e.currentTarget.value = k.letter;
            }}
          />
          <button type="button" class="del" title="Delete key" onclick={() => dispatch({ type: "key/delete", letter: k.letter })}>×</button>
        </li>
      {:else}
        <li class="empty">No keys. Cases without letters keep the overlay's key grid hidden.</li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .keys {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: #6b5a44;
  }
  kbd {
    padding: 0 4px;
    border: 1px solid #b9a787;
    border-radius: 3px;
    font-size: 11px;
  }
  .add {
    display: flex;
    gap: 6px;
  }
  .add input {
    width: 56px;
    text-align: center;
    text-transform: uppercase;
    font-size: 18px;
  }
  input,
  select {
    min-width: 0;
    box-sizing: border-box;
    padding: 5px;
    font: inherit;
    font-size: 13px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
    color: #2b2118;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid #e3d7bd;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 52px;
    padding: 0;
    font-family: Georgia, serif;
    font-size: 22px;
    font-weight: 700;
    background: #e3d7bd;
    color: #6b5a44;
  }
  .tile small {
    font-size: 10px;
  }
  .tile.unlocked {
    background: #fff8e1;
    border: 2px solid #b08d2b;
    color: #2b2118;
  }
  .fields {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  label {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
    color: #6b5a44;
  }
  label select {
    flex: 1;
  }
  .rename {
    width: 40px;
    text-align: center;
    text-transform: uppercase;
  }
  .del {
    padding: 2px 8px;
  }
  .empty {
    padding: 10px 0;
    font-size: 13px;
    color: #6b5a44;
    border: none;
  }
  .error {
    margin: 0;
    padding: 6px 8px;
    background: #f7d9d4;
    border-radius: 4px;
    font-size: 13px;
  }
  .primary {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
</style>
