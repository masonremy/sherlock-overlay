<script lang="ts">
  import { timesheet } from "../../shared/game";
  import type { Paper } from "../../shared/schema";
  import DocPage from "../lib/DocPage.svelte";
  import { loadDocText } from "../lib/docs";
  import { shelfPapers } from "../lib/papers";
  import type { Connection } from "../lib/socket";
  import type { PlayState } from "./play.svelte";

  // The case's newspaper: open it on the overlay, flip the shelf, and drag a
  // box on the page to zoom the overlay onto one article. The library lists
  // every newspaper PDF in artifacts/; the case picks its own.

  let { conn, play, onToggle }: { conn: Connection; play: PlayState; onToggle: () => void } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch, readers, sendReader } = conn;

  const app = $derived($snapshot?.state);
  const own = $derived(app?.newspaper.paperId ? (app.papers[app.newspaper.paperId] ?? null) : null);
  const showing = $derived(app ? (app.papers[app.newspaper.showing ?? ""] ?? own) : null);
  const isOpen = $derived(app?.overlay.focus === "newspaper");
  const day = $derived(app?.case.timesheet ? timesheet(app.trail, app.maps).now.day : 1);
  const shelf = $derived(app ? shelfPapers(app.papers, app.newspaper.paperId, day) : []);
  const library = $derived(Object.values(app?.papers ?? {}).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id)));

  const update = (p: Paper, patch: { date?: string | null; title?: string }) => dispatch({ type: "paper/update", paperId: p.id, patch });
  // Same as the overlay's shelf: date first, then the title.
  const label = (p: Paper) => {
    const date = p.date ? new Date(`${p.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
    return [date, p.title].filter(Boolean).join(" · ") || "Undated";
  };

  // --- Page preview: the front page at the tab's width -----------------------------------
  let boxW = $state(420);
  let aspect = $state(1.57);
  $effect(() => {
    const id = showing?.id;
    if (!id) return;
    loadDocText(id).then((t) => {
      const p = t.pages[0];
      if (p && showing?.id === id) aspect = p.h / p.w;
    });
  });

  // The overlay shows the panel's reader view for a paper when there is one, so
  // the zoom is sent both ways: saved with the case, and as the live view.
  function setZoom(zoom: { x: number; y: number; w: number; h: number } | null) {
    if (!showing) return;
    dispatch({ type: "newspaper/update", patch: { zoom } });
    const prev = $readers[showing.id] ?? play.docViews[showing.id];
    const view = {
      doc: showing.id,
      page: 1,
      rect: zoom ? ([zoom.x, zoom.y, zoom.x + zoom.w, zoom.y + zoom.h] as [number, number, number, number]) : null,
      query: prev?.query ?? "",
      active: prev?.active?.page === 1 ? prev.active : null,
    };
    play.docViews[showing.id] = view;
    sendReader(view);
  }
  function show(p: Paper) {
    if (!own) return;
    dispatch({ type: "newspaper/update", patch: { showing: p.id === own.id ? null : p.id, zoom: null } });
    const view = { doc: p.id, page: 1, rect: null, query: "", active: null };
    play.docViews[p.id] = view;
    sendReader(view);
  }

  // --- Drag a box on the page to zoom the overlay onto an article -----------------------
  let thumb = $state<HTMLDivElement>();
  let drag = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const rel = (e: PointerEvent) => {
    const r = thumb!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  function down(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const [x, y] = rel(e);
    drag = { x0: x, y0: y, x1: x, y1: y };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const [x, y] = rel(e);
    drag = { ...drag, x1: x, y1: y };
  }
  function up() {
    if (!drag) return;
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0);
    const h = Math.abs(drag.y1 - drag.y0);
    drag = null;
    if (w > 0.03 && h > 0.02) {
      const round = (n: number) => Math.round(n * 1e4) / 1e4;
      setZoom({ x: round(x), y: round(y), w: round(Math.min(w, 1 - x)), h: round(Math.min(h, 1 - y)) });
    }
  }
  const zoomBox = $derived(
    drag
      ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) }
      : (app?.newspaper.zoom ?? null),
  );
</script>

{#if app}
  <div class="paper-tab" bind:clientWidth={boxW}>
    {#if !library.length}
      <p class="hint">No newspapers found. Put the newspaper PDFs in <code>artifacts/</code> and restart the server.</p>
    {:else if !own}
      <p class="hint">Choose this case's paper below (<b>Use</b>). It rests as an icon on the overlay's toolkit until you open it.</p>
    {:else}
      <div class="row">
        <button type="button" class:primary={!isOpen} onclick={onToggle} title="Ctrl+2">{isOpen ? "Fold it away" : "Open on the overlay"}</button>
        {#if app.newspaper.zoom}
          <button type="button" onclick={() => setZoom(null)}>Whole page</button>
        {/if}
        {#if !app.newspaper.opened}<span class="dot" title="Viewers see a dot on the icon until it's opened">● not opened yet</span>{/if}
      </div>

      {#if shelf.length > 1}
        <div class="shelf" role="group" aria-label="Shelf">
          {#each shelf as p (p.id)}
            <button type="button" class:on={showing?.id === p.id} onclick={() => show(p)}>
              {label(p)}{#if p.id === own.id}<small> (this case)</small>{/if}
            </button>
          {/each}
        </div>
      {/if}

      {#if showing}
        <div
          class="thumb"
          bind:this={thumb}
          onpointerdown={down}
          onpointermove={move}
          onpointerup={up}
          role="presentation"
          title="Drag a box over an article to zoom the overlay onto it"
        >
          {#key showing.file}
            <DocPage file={showing.file} page={1} rect={null} width={boxW} height={Math.round(boxW * aspect)} />
          {/key}
          {#if zoomBox}
            <span class="box" style:left="{zoomBox.x * 100}%" style:top="{zoomBox.y * 100}%" style:width="{zoomBox.w * 100}%" style:height="{zoomBox.h * 100}%"></span>
          {/if}
        </div>
        <p class="hint">Drag a box over an article to zoom the overlay onto it. To search the papers, use the Documents tab.</p>
      {/if}
    {/if}

    {#if library.length}
      <fieldset>
        <legend>Newspapers ({library.length})</legend>
        <p class="hint">From <code>artifacts/</code>, dated from their mastheads. The rules allow this case's paper and earlier ones; later ones are greyed out.</p>
        <ul>
          {#each library as p (p.id)}
            <li class:own={p.id === own?.id} class:later={!!own && !shelf.includes(p)}>
              <input type="date" value={p.date ?? ""} onchange={(e) => update(p, { date: e.currentTarget.value || null })} aria-label="Date" />
              <input value={p.title} placeholder="Title" maxlength="80" onchange={(e) => update(p, { title: e.currentTarget.value })} aria-label="Title" />
              {#if p.id === own?.id}
                <span class="tag">this case</span>
              {:else}
                <button type="button" title="Make this the case's paper" onclick={() => dispatch({ type: "newspaper/update", patch: { paperId: p.id, showing: null, zoom: null } })}>Use</button>
              {/if}
            </li>
          {/each}
        </ul>
      </fieldset>
    {/if}
  </div>
{/if}

<style>
  .paper-tab {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .thumb {
    position: relative;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
    /* An outline, not a border: the page is exactly the tab's width. */
    outline: 1px solid #8a7354;
    line-height: 0;
  }
  .box {
    position: absolute;
    border: 2px solid #d6452d;
    background: rgb(214 69 45 / 0.15);
    pointer-events: none;
  }
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid #d8c9aa;
    border-radius: 6px;
  }
  legend {
    font-size: 12px;
    color: #6b5a44;
  }
  .shelf {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .shelf button.on,
  .primary {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 3px 0;
    border-bottom: 1px solid #e3d7bd;
  }
  li.own {
    font-weight: 600;
  }
  li.later {
    opacity: 0.55;
  }
  input {
    min-width: 0;
    padding: 5px;
    font: inherit;
    font-size: 13px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
  }
  li input[type="date"] {
    width: 128px;
  }
  li input:not([type="date"]) {
    flex: 1;
  }
  .tag {
    font-size: 12px;
    color: #8b2e22;
  }
  .dot {
    font-size: 12px;
    color: #9b1c1c;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: #6b5a44;
  }
</style>
