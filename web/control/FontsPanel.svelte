<script lang="ts">
  import { THEME_LABELS, THEME_TARGETS, type ThemeTargetId } from "../../shared/layout";
  import type { FontStyle, Theme } from "../../shared/schema";
  import { BUNDLED_FONTS, ensureFonts, fetchServerFonts, themeFamilies, type ServerFont } from "../lib/fonts";
  import type { Connection } from "../lib/socket";

  // Master display/body fonts, per-component overrides (inherit by default),
  // uploads and Google Fonts by name. Follows the layout editor's Apply /
  // live-edit switch so experiments don't reach the stream by accident.

  let { conn, live }: { conn: Connection; live: boolean } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch } = conn;

  const saved = $derived($snapshot?.state.theme);
  let draft = $state<Theme | null>(null);
  let dirty = $state(false);
  $effect(() => {
    if (saved && !dirty) draft = JSON.parse(JSON.stringify(saved));
  });

  let serverFonts = $state<ServerFont[]>([]);
  async function refreshFonts() {
    serverFonts = await fetchServerFonts();
  }
  refreshFonts();
  const families = $derived([...BUNDLED_FONTS.map((f) => f.family), ...serverFonts.map((f) => f.family)]);

  // Load what the draft uses so the sample lines show the real thing.
  $effect(() => {
    if (draft) ensureFonts(themeFamilies(draft), serverFonts);
  });

  function commit(next: Theme) {
    draft = next;
    if (live) dispatch({ type: "theme/set", theme: next });
    else dirty = true;
  }
  const DEFAULT_STYLE: FontStyle = { display: null, body: null, scale: 1, weight: null, letterSpacing: 0 };
  function setComponent(id: ThemeTargetId, patch: Partial<FontStyle> | null) {
    if (!draft) return;
    const components = { ...draft.components };
    if (patch === null) delete components[id];
    else components[id] = { ...DEFAULT_STYLE, ...components[id], ...patch };
    commit({ ...draft, components });
  }

  let open = $state<ThemeTargetId | null>(null);
  let upFamily = $state("");
  let googleFamily = $state("");
  let busy = $state<string | null>(null);
  let error = $state<string | null>(null);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const family = upFamily.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
    busy = "Uploading…";
    error = null;
    const res = await fetch(`/api/fonts?family=${encodeURIComponent(family)}`, { method: "POST", headers: { "Content-Type": "font/ttf" }, body: file });
    busy = null;
    if (!res.ok) error = (await res.json().catch(() => ({}))).error ?? "Upload failed";
    else {
      upFamily = "";
      await refreshFonts();
    }
  }

  async function fromGoogle() {
    const family = googleFamily.trim();
    if (!family) return;
    busy = `Downloading ${family}…`;
    error = null;
    const res = await fetch("/api/fonts/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ family }) });
    busy = null;
    if (!res.ok) error = (await res.json().catch(() => ({}))).error ?? "Download failed";
    else {
      googleFamily = "";
      await refreshFonts();
    }
  }
</script>

{#if draft}
  <fieldset>
    <legend>Fonts</legend>
    <div class="row">
      <label class="grow">
        Display
        <select value={draft.display} onchange={(e) => commit({ ...draft!, display: e.currentTarget.value })}>
          {#each families as f (f)}<option value={f} style:font-family={f}>{f}</option>{/each}
        </select>
        <span class="sample" style:font-family="'{draft.display}', serif">Case 3 · The Tin Soldier</span>
      </label>
      <label class="grow">
        Body
        <select value={draft.body} onchange={(e) => commit({ ...draft!, body: e.currentTarget.value })}>
          {#each families as f (f)}<option value={f} style:font-family={f}>{f}</option>{/each}
        </select>
        <span class="sample" style:font-family="'{draft.body}', sans-serif">Muddy boots, size 10 · Leads 7</span>
      </label>
    </div>

    <ul>
      {#each THEME_TARGETS as id (id)}
        {@const s = draft.components[id]}
        <li>
          <button type="button" class="comp" onclick={() => (open = open === id ? null : id)}>
            {open === id ? "▾" : "▸"} {THEME_LABELS[id]}
            <small>{s ? `${s.display ?? "inherit"} / ${s.body ?? "inherit"} · ${Math.round(s.scale * 100)}%` : "inherits"}</small>
          </button>
          {#if s}<button type="button" class="reset" title="Back to inherit" onclick={() => setComponent(id, null)}>↺</button>{/if}
          {#if open === id}
            <div class="detail">
              <label>
                Display
                <select value={s?.display ?? ""} onchange={(e) => setComponent(id, { display: e.currentTarget.value || null })}>
                  <option value="">{id === "cards" ? "Typed label look (Special Elite)" : `Inherit (${draft.display})`}</option>
                  {#each families as f (f)}<option value={f}>{f}</option>{/each}
                </select>
              </label>
              <label>
                Body
                <select value={s?.body ?? ""} onchange={(e) => setComponent(id, { body: e.currentTarget.value || null })}>
                  <option value="">Inherit ({draft.body})</option>
                  {#each families as f (f)}<option value={f}>{f}</option>{/each}
                </select>
              </label>
              <label>
                Size {Math.round((s?.scale ?? 1) * 100)}%
                <input type="range" min="0.5" max="2" step="0.05" value={s?.scale ?? 1} onchange={(e) => setComponent(id, { scale: Number(e.currentTarget.value) })} />
              </label>
              <label>
                Weight
                <select value={String(s?.weight ?? "")} onchange={(e) => setComponent(id, { weight: e.currentTarget.value ? Number(e.currentTarget.value) : null })}>
                  <option value="">Inherit</option>
                  <option value="400">Regular</option>
                  <option value="700">Bold</option>
                </select>
              </label>
              <label>
                Letter-spacing {(s?.letterSpacing ?? 0).toFixed(2)}em
                <input type="range" min="-0.05" max="0.2" step="0.01" value={s?.letterSpacing ?? 0} onchange={(e) => setComponent(id, { letterSpacing: Number(e.currentTarget.value) })} />
              </label>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="row">
      {#if !live && dirty}
        <button type="button" class="primary" onclick={() => (draft && dispatch({ type: "theme/set", theme: draft }), (dirty = false))}>Apply fonts</button>
        <button type="button" onclick={() => (dirty = false)}>Discard</button>
      {/if}
      <button type="button" onclick={() => commit({ display: "IM Fell English", body: "Source Sans 3", components: {} })}>Reset all</button>
    </div>

    <details>
      <summary>Add fonts</summary>
      <div class="row">
        <input class="grow" bind:value={upFamily} placeholder="Name for an uploaded font (optional)" />
        <label class="button">
          Upload TTF / OTF / WOFF2
          <input type="file" accept=".ttf,.otf,.woff,.woff2" hidden onchange={(e) => upload(e.currentTarget.files)} />
        </label>
      </div>
      <div class="row">
        <input class="grow" bind:value={googleFamily} placeholder="Google Fonts family, e.g. Lora" onkeydown={(e) => e.key === "Enter" && fromGoogle()} />
        <button type="button" onclick={fromGoogle} disabled={!googleFamily.trim()}>Download</button>
      </div>
      <p class="hint">Downloaded fonts are kept in <code>fonts/</code>, so they work offline from then on.</p>
      {#if busy}<p class="hint">{busy}</p>{/if}
      {#if error}<p class="error">{error}</p>{/if}
    </details>
  </fieldset>
{/if}

<style>
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid #d8c9aa;
    border-radius: 6px;
  }
  legend {
    font-size: 12px;
    color: #6b5a44;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: end;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #6b5a44;
  }
  select,
  input:not([type="range"]) {
    min-width: 0;
    padding: 5px;
    font: inherit;
    font-size: 13px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
    color: #2b2118;
  }
  .sample {
    font-size: 18px;
    color: #2b2118;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    border-bottom: 1px solid #e3d7bd;
  }
  .comp {
    flex: 1;
    display: flex;
    gap: 8px;
    align-items: baseline;
    border: none;
    background: none;
    text-align: left;
  }
  .comp small {
    color: #6b5a44;
  }
  .reset {
    padding: 2px 8px;
  }
  .detail {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    width: 100%;
    padding: 4px 0 8px;
  }
  .button {
    padding: 6px 10px;
    border: 1px solid #8a7354;
    border-radius: 4px;
    background: #efe4cc;
    color: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .primary {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: #6b5a44;
  }
  .error {
    margin: 0;
    padding: 6px 8px;
    background: #f7d9d4;
    border-radius: 4px;
    font-size: 13px;
  }
</style>
