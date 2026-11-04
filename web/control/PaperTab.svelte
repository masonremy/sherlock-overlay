<script lang="ts">
  import { timesheet } from "../../shared/game";
  import type { Paper } from "../../shared/schema";
  import { newId } from "../lib/cast";
  import type { UploadedImage } from "../lib/mapImage";
  import { shelfPapers } from "../lib/papers";
  import type { Connection } from "../lib/socket";
  import ImageUpload from "./ImageUpload.svelte";

  // The case's newspaper: load it, open it on the overlay, zoom onto an
  // article, and keep a library of dated papers (earlier ones are fair game).

  let { conn, onToggle }: { conn: Connection; onToggle: () => void } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch } = conn;

  const app = $derived($snapshot?.state);
  const own = $derived(app?.newspaper.paperId ? (app.papers[app.newspaper.paperId] ?? null) : null);
  const showing = $derived(app ? (app.papers[app.newspaper.showing ?? ""] ?? own) : null);
  const isOpen = $derived(app?.overlay.focus === "newspaper");
  const day = $derived(app?.case.timesheet ? timesheet(app.trail, app.maps).now.day : 1);
  const shelf = $derived(app ? shelfPapers(app.papers, app.newspaper.paperId, day) : []);
  const library = $derived(Object.values(app?.papers ?? {}).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")));

  let adding = $state<"own" | "library" | null>(null);

  function added(img: UploadedImage, asOwn: boolean) {
    const id = newId("np");
    const date = asOwn ? (app?.case.paperDate ?? null) : null;
    dispatch({ type: "paper/add", paper: { id, file: img.file, date, title: "" } });
    if (asOwn) dispatch({ type: "newspaper/update", patch: { paperId: id, showing: null, zoom: null } });
    adding = null;
  }

  const update = (p: Paper, patch: { date?: string | null; title?: string }) => dispatch({ type: "paper/update", paperId: p.id, patch });
  // Same as the overlay's shelf: date first, then the title.
  const label = (p: Paper) => {
    const date = p.date ? new Date(`${p.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
    return [date, p.title].filter(Boolean).join(" · ") || "Undated";
  };

  // --- Drag a box on the thumbnail to zoom the overlay onto an article --------
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
      dispatch({ type: "newspaper/update", patch: { zoom: { x: round(x), y: round(y), w: round(Math.min(w, 1 - x)), h: round(Math.min(h, 1 - y)) } } });
    }
  }
  const zoomBox = $derived(drag ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) } : (app?.newspaper.zoom ?? null));
</script>

{#if app}
  <div class="paper-tab">
    {#if !own}
      <p class="hint">Load this case's newspaper: a screenshot or a one-page PDF. It rests as an icon on the overlay's toolkit until you open it.</p>
      <ImageUpload route="papers" prompt="Load the case's newspaper" onDone={(img) => added(img, true)} />
    {:else}
      <div class="row">
        <button type="button" class:primary={!isOpen} onclick={onToggle} title="Ctrl+2">{isOpen ? "Fold it away" : "Open on the overlay"}</button>
        {#if app.newspaper.zoom}
          <button type="button" onclick={() => dispatch({ type: "newspaper/update", patch: { zoom: null } })}>Whole page</button>
        {/if}
        {#if !app.newspaper.opened}<span class="dot" title="Viewers see a dot on the icon until it's opened">● not opened yet</span>{/if}
      </div>

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
          <img src="/papers/{showing.file}" alt="" draggable="false" />
          {#if zoomBox}
            <span class="box" style:left="{zoomBox.x * 100}%" style:top="{zoomBox.y * 100}%" style:width="{zoomBox.w * 100}%" style:height="{zoomBox.h * 100}%"></span>
          {/if}
        </div>
        <p class="hint">Drag a box over an article to zoom the overlay onto it. Zoom is kept for next time.</p>
      {/if}

      <fieldset>
        <legend>This case's paper</legend>
        <div class="row">
          <label>Date <input type="date" value={own.date ?? ""} onchange={(e) => update(own, { date: e.currentTarget.value || null })} /></label>
          <label class="grow">Title <input value={own.title} maxlength="80" placeholder="The Times" onchange={(e) => update(own, { title: e.currentTarget.value })} /></label>
        </div>
        <button type="button" class="link" onclick={() => (adding = adding === "own" ? null : "own")}>Replace with another image…</button>
        {#if adding === "own"}<ImageUpload route="papers" prompt="New image for this case's paper" onDone={(img) => added(img, true)} />{/if}
      </fieldset>

      {#if shelf.length > 1}
        <fieldset>
          <legend>Shelf (this paper and earlier ones)</legend>
          <div class="shelf">
            {#each shelf as p (p.id)}
              <button
                type="button"
                class:on={showing?.id === p.id}
                onclick={() => dispatch({ type: "newspaper/update", patch: { showing: p.id === own.id ? null : p.id, zoom: null } })}
              >
                {label(p)}{#if p.id === own.id}<small> (this case)</small>{/if}
              </button>
            {/each}
          </div>
        </fieldset>
      {/if}
    {/if}

    <fieldset>
      <legend>Paper library ({library.length})</legend>
      <p class="hint">Papers from every case, by date. Earlier-dated papers show on the shelf of later cases.</p>
      <ul>
        {#each library as p (p.id)}
          <li>
            <img src="/papers/{p.file}" alt="" />
            <input type="date" value={p.date ?? ""} onchange={(e) => update(p, { date: e.currentTarget.value || null })} aria-label="Date" />
            <input value={p.title} placeholder="Title" maxlength="80" onchange={(e) => update(p, { title: e.currentTarget.value })} aria-label="Title" />
            {#if p.id !== own?.id}
              <button type="button" title="Make this the case's paper" onclick={() => dispatch({ type: "newspaper/update", patch: { paperId: p.id, showing: null, zoom: null } })}>Use</button>
            {/if}
            <button type="button" class="del" title="Remove from the library" onclick={() => dispatch({ type: "paper/delete", paperId: p.id })}>×</button>
          </li>
        {/each}
      </ul>
      <button type="button" onclick={() => (adding = adding === "library" ? null : "library")}>Add an earlier paper…</button>
      {#if adding === "library"}<ImageUpload route="papers" prompt="Add a paper to the library" onDone={(img) => added(img, false)} />{/if}
    </fieldset>
  </div>
{/if}

<style>
  .paper-tab {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: end;
  }
  .grow {
    flex: 1;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #6b5a44;
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
  .thumb {
    position: relative;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
    border: 1px solid #8a7354;
  }
  .thumb img {
    display: block;
    width: 100%;
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
    padding: 4px 0;
    border-bottom: 1px solid #e3d7bd;
  }
  li img {
    width: 36px;
    height: 48px;
    object-fit: cover;
    border: 1px solid #b9a787;
  }
  li input[type="date"] {
    width: 128px;
  }
  li input:not([type="date"]) {
    flex: 1;
  }
  .del {
    padding: 2px 8px;
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
  .link {
    align-self: start;
    border: none;
    background: none;
    padding: 0;
    text-decoration: underline;
    font-size: 12px;
  }
</style>
