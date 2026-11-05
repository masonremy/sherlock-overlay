<script lang="ts">
  import { timesheet } from "../../shared/game";
  import type { DocInfo, DocText } from "../../shared/docs";
  import type { ReaderView } from "../../shared/protocol";
  import type { Paper } from "../../shared/schema";
  import DocPage from "../lib/DocPage.svelte";
  import { loadDocList, loadDocText } from "../lib/docs";
  import { untrack } from "svelte";
  import { activeStillMatches, addressIn, matchRects, pageHighlights, searchDocs, viewAround, zoneForAddress, type DocMatch } from "../lib/docSearch";
  import type { ToolItem } from "../lib/focus";
  import { shelfPapers } from "../lib/papers";
  import type { Connection } from "../lib/socket";
  import type { PlayState } from "./play.svelte";

  // The documents from artifacts/: the newspapers (this case's and the earlier
  // ones the rules allow), the directory and the informants. Search across
  // them, read one in the preview, and put it on stream. While a document is
  // on stream the preview drives the overlay (page, area, highlights); until
  // then it's private.

  let { conn, play, onToggle }: { conn: Connection; play: PlayState; onToggle: (item: ToolItem) => void } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch, readers, sendReader } = conn;

  const app = $derived($snapshot?.state);
  const own = $derived(app?.newspaper.paperId ? (app.papers[app.newspaper.paperId] ?? null) : null);
  const day = $derived(app?.case.timesheet ? timesheet(app.trail, app.maps).now.day : 1);
  const shelf = $derived(app ? shelfPapers(app.papers, app.newspaper.paperId, day) : []);
  const library = $derived(Object.values(app?.papers ?? {}).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id)));
  const caseMaps = $derived(app ? app.case.mapIds.map((id) => app.maps[id]).filter(Boolean) : []);

  let docs = $state<DocInfo[]>([]);
  loadDocList().then((d) => (docs = d));
  const info = (id: string) => docs.find((d) => d.id === id) ?? null;
  const directory = $derived(docs.find((d) => d.kind === "directory") ?? null);
  const informants = $derived(docs.find((d) => d.kind === "informants") ?? null);

  // What can be read and searched: the shelf (never a later paper), the directory, the informants.
  const readable = $derived([...shelf.map((p) => info(p.id)).filter((d): d is DocInfo => !!d), ...(directory ? [directory] : []), ...(informants ? [informants] : [])]);

  let texts = $state<Record<string, DocText>>({});
  $effect(() => {
    for (const d of readable) if (!texts[d.id]) loadDocText(d.id).then((t) => (texts[d.id] = t));
  });

  // --- The document in the preview -------------------------------------------------------
  const current = $derived(info(play.docId ?? "") && readable.some((d) => d.id === play.docId) ? info(play.docId!) : (readable[0] ?? null));
  const kindItem = (d: DocInfo): ToolItem => (d.kind === "newspaper" ? "newspaper" : d.kind === "informants" ? "informants" : "directory");

  // On stream: its item is in focus and, for a paper, it's the one open on the overlay.
  const openPaperId = $derived(app ? (app.newspaper.showing ?? app.newspaper.paperId) : null);
  const live = (d: DocInfo | null) =>
    !!d && !!app && app.overlay.focus === kindItem(d) && (d.kind !== "newspaper" || openPaperId === d.id);
  const isLive = $derived(live(current));

  // Each document keeps its own place; one on stream starts from what the overlay shows.
  const viewOf = (id: string): ReaderView => play.docViews[id] ?? $readers[id] ?? { doc: id, page: 1, rect: null, query: "", active: null };
  const view = $derived(current ? viewOf(current.id) : null);

  function setView(patch: Partial<ReaderView>, docId = current?.id) {
    if (!docId) return;
    const next = { ...viewOf(docId), ...patch, doc: docId, query: query.trim().slice(0, 120) };
    play.docViews[docId] = next;
    const d = info(docId);
    if (live(d)) sendReader(next);
  }

  function putOnStream() {
    if (!current || !app) return;
    if (live(current)) return onToggle(kindItem(current));
    // Show this view the moment it unfolds.
    sendReader({ ...viewOf(current.id), doc: current.id, query: query.trim().slice(0, 120) });
    if (current.kind === "newspaper") {
      dispatch({ type: "newspaper/update", patch: { showing: current.id === app.newspaper.paperId ? null : current.id, zoom: null } });
    }
    if (app.overlay.focus !== kindItem(current)) onToggle(kindItem(current));
  }

  // --- Preview size ------------------------------------------------------------------------
  let boxW = $state(480);
  const PREVIEW_H = 520;
  const pageAspect = $derived.by(() => {
    const p = current && texts[current.id]?.pages[(view?.page ?? 1) - 1];
    return p ? p.h / p.w : 1.4;
  });
  /** A page at full width, from just above `y` (the top of a heading). */
  const rectFrom = (y: number): [number, number, number, number] => {
    const h = Math.min(1, PREVIEW_H / boxW / pageAspect);
    const y0 = Math.min(1 - h, Math.max(0, y - 0.03));
    return [0, y0, 1, y0 + h];
  };

  function goPage(n: number) {
    if (!current) return;
    const page = Math.min(current.pages, Math.max(1, n));
    if (page !== view?.page) setView({ page, rect: null, active: view?.active?.page === page ? view.active : null });
  }

  // --- Search --------------------------------------------------------------------------------
  // svelte-ignore state_referenced_locally (start from the last search; the effect below keeps it)
  let query = $state(play.docQuery);
  let scope = $state<"all" | "this">("all");
  $effect(() => {
    play.docQuery = query;
  });
  const results = $derived.by(() => {
    const pool = scope === "this" && current ? [current] : readable;
    return searchDocs(
      pool.map((d) => texts[d.id]).filter(Boolean),
      query,
    );
  });
  const grouped = $derived.by(() => {
    const out: { doc: DocInfo; matches: DocMatch[] }[] = [];
    for (const m of results) {
      const last = out.at(-1);
      if (last?.doc.id === m.doc) last.matches.push(m);
      else out.push({ doc: info(m.doc)!, matches: [m] });
    }
    return out;
  });
  // Typing re-highlights whatever is on stream, and a chosen result the search
  // no longer finds (cleared or changed) loses its mark.
  $effect(() => {
    const q = query.trim().slice(0, 120);
    untrack(() => {
      for (const d of readable) {
        const v = viewOf(d.id);
        const active = v.active && activeStillMatches(texts[d.id] ?? null, v.active, q) ? v.active : null;
        if (active === v.active && (!live(d) || $readers[d.id]?.query === q)) continue;
        const next = { ...v, doc: d.id, query: q, active };
        play.docViews[d.id] = next;
        if (live(d)) sendReader(next);
      }
    });
  });

  function openMatch(m: DocMatch) {
    play.docId = m.doc;
    const line = texts[m.doc]?.pages[m.page - 1]?.lines[m.line];
    const page = texts[m.doc]?.pages[m.page - 1];
    if (!line || !page) return;
    const [box] = matchRects(line, m.start, m.end);
    const rect = viewAround(box ?? line, 0.62, PREVIEW_H / boxW, page.h / page.w);
    setView({ page: m.page, rect, active: { page: m.page, line: m.line, start: m.start, end: m.end } }, m.doc);
  }

  const marks = $derived(current && view ? pageHighlights(texts[current.id] ?? null, view.page, query, view.active) : { all: [], active: [] });

  // The address on the line being pointed at, and its zone on the case's maps.
  const activeLine = $derived(current && view?.active ? texts[current.id]?.pages[view.active.page - 1]?.lines[view.active.line] : undefined);
  const address = $derived(activeLine ? addressIn(activeLine.text) : null);
  const addressZone = $derived(address ? zoneForAddress(caseMaps, address) : null);

  // --- Newspapers --------------------------------------------------------------------------
  const update = (p: Paper, patch: { date?: string | null; title?: string }) => dispatch({ type: "paper/update", paperId: p.id, patch });
  const dateLabel = (p: Paper) =>
    p.date ? new Date(`${p.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Undated";
  const docLabel = (d: DocInfo) => {
    const p = app?.papers[d.id];
    return p ? `${p.title || d.title} · ${dateLabel(p)}` : d.title;
  };
  const sections = $derived(current?.sections ?? []);
</script>

{#if app}
  <div class="docs-tab" bind:clientWidth={boxW}>
    {#if !docs.length}
      <p class="hint">No documents found. Put the case's PDFs (newspapers, directory, informants) in <code>artifacts/</code> and restart the server.</p>
    {:else}
      <div class="chips" role="group" aria-label="Document">
        {#each readable as d (d.id)}
          <button type="button" class:on={current?.id === d.id} onclick={() => (play.docId = d.id)}>
            {d.kind === "newspaper" ? docLabel(d) : d.title}{#if live(d)}<span class="live" title="On stream">●</span>{/if}
          </button>
        {/each}
      </div>

      <div class="search">
        <input type="search" bind:value={query} placeholder="Search {scope === 'this' && current ? current.title.toLowerCase() : 'the directory, papers and informants'}…" />
        <select bind:value={scope} aria-label="Search in">
          <option value="all">Everything</option>
          <option value="this">This document</option>
        </select>
      </div>

      {#if query.trim().length >= 2}
        <div class="results">
          {#if !results.length}
            <p class="hint">No matches.</p>
          {/if}
          {#each grouped as g (g.doc.id)}
            <h4>{g.doc.kind === "newspaper" ? docLabel(g.doc) : g.doc.title} <small>{g.matches.length}</small></h4>
            {#each g.matches as m (`${m.page}:${m.line}:${m.start}`)}
              {@const on = current?.id === m.doc && view?.active?.page === m.page && view.active.line === m.line && view.active.start === m.start}
              <button type="button" class="hit" class:on onclick={() => openMatch(m)}>
                <span class="pg">p{m.page}</span>
                <span class="snip">{m.snippet.slice(0, m.start)}<mark>{m.snippet.slice(m.start, m.end)}</mark>{m.snippet.slice(m.end)}</span>
              </button>
            {/each}
          {/each}
        </div>
      {/if}

      {#if current && view}
        <div class="bar">
          <button type="button" class:primary={!isLive} onclick={putOnStream} title="Show it in the overlay's focus area">
            {isLive ? "Fold it away" : "Show on stream"}
          </button>
          {#if current.pages > 1}
            <span class="pages">
              <button type="button" onclick={() => goPage(view.page - 1)} disabled={view.page <= 1} aria-label="Previous page">‹</button>
              page {view.page} of {current.pages}
              <button type="button" onclick={() => goPage(view.page + 1)} disabled={view.page >= current.pages} aria-label="Next page">›</button>
            </span>
          {/if}
          {#if sections.length}
            <select
              aria-label="Jump to"
              value=""
              onchange={(e) => {
                const s = sections[Number(e.currentTarget.value)];
                e.currentTarget.value = "";
                if (s) setView({ page: s.page, rect: rectFrom(s.y ?? 0), active: null });
              }}
            >
              <option value="">Jump to…</option>
              <optgroup label="A–Z">
                {#each sections as s, i (i)}{#if s.kind === "letter"}<option value={i}>{s.label}</option>{/if}{/each}
              </optgroup>
              <optgroup label="By trade">
                {#each sections as s, i (i)}{#if s.kind === "category"}<option value={i}>{s.label}</option>{/if}{/each}
              </optgroup>
            </select>
          {/if}
          <button type="button" onclick={() => setView({ rect: null })} disabled={!view.rect}>Whole page</button>
          {#if isLive}<span class="livetag">Live: the overlay follows this view</span>{/if}
        </div>

        {#if address}
          <div class="address">
            <b>{address.label}</b>
            {#if addressZone}
              <button type="button" onclick={() => play.showZone(addressZone.mapId, addressZone.zoneId)}>Show on the map</button>
            {:else}
              <span class="hint">not zoned on this case's maps</span>
            {/if}
          </div>
        {/if}

        {#key `${current.file}#${view.page}`}
          <DocPage
            file={current.file}
            page={view.page}
            rect={view.rect}
            width={boxW}
            height={PREVIEW_H}
            highlights={marks.all}
            active={marks.active}
            onView={(rect) => setView({ rect: rect.map((n) => Math.round(n * 1e4) / 1e4) as [number, number, number, number] })}
          />
        {/key}
        <p class="hint">Scroll to move, Ctrl+scroll to zoom, drag to pan.{#if !isLive} Only you see this until it's on stream.{/if}</p>
      {/if}

      <fieldset>
        <legend>Newspapers</legend>
        {#if !own}
          <p class="hint">Choose this case's paper. Earlier-dated papers join it on the shelf; later ones stay hidden.</p>
        {:else if !app.newspaper.opened}
          <p class="hint dot">● Viewers see a dot on the paper until it's opened.</p>
        {/if}
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
  .docs-tab {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chips button.on,
  .primary {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
  .live {
    margin-left: 4px;
    color: #d6452d;
  }
  .chips button.on .live {
    color: #ffd27a;
  }
  .search {
    display: flex;
    gap: 6px;
  }
  .search input {
    flex: 1;
  }
  input,
  select {
    min-width: 0;
    padding: 5px;
    font: inherit;
    font-size: 13px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
  }
  .results {
    max-height: 220px;
    overflow: auto;
    border: 1px solid #d8c9aa;
    border-radius: 6px;
    padding: 4px 6px;
    background: #fffaf0;
  }
  h4 {
    margin: 6px 0 2px;
    font-size: 12px;
    color: #6b5a44;
  }
  h4 small {
    font-weight: normal;
  }
  .hit {
    display: flex;
    gap: 8px;
    width: 100%;
    padding: 3px 4px;
    border: none;
    border-radius: 3px;
    background: none;
    text-align: left;
    font-size: 13px;
  }
  .hit:hover {
    background: #f1e6cf;
  }
  .hit.on {
    background: #ead7b0;
  }
  .hit .pg {
    flex: none;
    width: 28px;
    color: #8a7354;
    font-size: 11px;
    padding-top: 2px;
  }
  .snip {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  mark {
    background: #ffd84d;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .pages {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    font-size: 13px;
  }
  .livetag {
    font-size: 12px;
    color: #d6452d;
  }
  .address {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
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
    color: #9b1c1c;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: #6b5a44;
  }
</style>
