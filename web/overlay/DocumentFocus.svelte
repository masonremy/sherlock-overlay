<script lang="ts">
  import type { DocText } from "../../shared/docs";
  import type { ReaderView } from "../../shared/protocol";
  import type { Paper } from "../../shared/schema";
  import DocPage from "../lib/DocPage.svelte";
  import { loadDocText } from "../lib/docs";
  import { pageHighlights } from "../lib/docSearch";

  // A document on stream (newspaper, directory, informants): the page and area
  // the panel is showing, with its search highlighted. Newspapers keep a shelf
  // underneath of the earlier papers the rules allow, the open one lit.

  interface Props {
    id: string;
    file: string;
    title: string;
    pages: number;
    /** What the panel last showed; without one, page 1 (or `fallback`). */
    view: ReaderView | undefined;
    fallback?: [number, number, number, number] | null;
    shelf?: Paper[];
    width: number;
    height: number;
  }

  let { id, file, title, pages, view, fallback = null, shelf = [], width, height }: Props = $props();

  const CAPTION_H = 30;
  const SHELF_H = 54;
  const pageH = $derived(height - CAPTION_H - (shelf.length > 1 ? SHELF_H : 0));

  let text = $state<DocText | null>(null);
  $effect(() => {
    const want = id;
    loadDocText(want).then((t) => {
      if (id === want) text = t;
    });
  });

  const page = $derived(view?.page ?? 1);
  const rect = $derived(view ? view.rect : fallback);
  const marks = $derived(pageHighlights(text, page, view?.query ?? "", view?.active ?? null));

  const label = (p: Paper) =>
    p.date ? new Date(`${p.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : p.title || "Paper";
</script>

<div class="doc" style:width="{width}px" style:height="{height}px">
  <div class="caption" style:height="{CAPTION_H}px">
    <span class="title">{title}</span>
    {#if view?.query}<span class="query">“{view.query}”</span>{/if}
    {#if pages > 1}<span class="pg">page {page} of {pages}</span>{/if}
  </div>
  {#key `${file}#${page}`}
    <DocPage {file} {page} {rect} {width} height={pageH} highlights={marks.all} active={marks.active} smooth />
  {/key}
  {#if shelf.length > 1}
    <div class="shelf" style:height="{SHELF_H}px">
      {#each shelf as p (p.id)}
        <span class:on={p.id === id}>{label(p)}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .doc {
    display: flex;
    flex-direction: column;
  }
  .caption {
    display: flex;
    align-items: baseline;
    gap: 14px;
    white-space: nowrap;
    overflow: hidden;
    color: var(--ink-soft);
    font-size: calc(17px * var(--fs, 1));
  }
  .title {
    font-family: var(--font-display);
    font-size: calc(21px * var(--fs, 1));
    color: var(--ink);
  }
  .query {
    font-style: italic;
  }
  .pg {
    margin-left: auto;
  }
  .doc :global(.viewport) {
    border-radius: 2px;
    background: transparent;
  }
  .shelf {
    display: flex;
    gap: 8px;
    align-items: center;
    overflow: hidden;
    padding-top: 8px;
    box-sizing: border-box;
    font-size: calc(18px * var(--fs, 1));
    white-space: nowrap;
  }
  .shelf span {
    padding: 4px 12px;
    border: 1.5px solid var(--sepia);
    border-radius: 3px;
    color: var(--ink-soft);
  }
  .shelf span.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }
</style>
