<script lang="ts">
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import {
    ACCEPT,
    formatBytes,
    isPdf,
    openPdf,
    pdfThumbnail,
    prepareRaster,
    rasterizePdfPage,
    uploadImage,
    type PreparedImage,
    type UploadedImage,
  } from "../lib/mapImage";

  interface Props {
    onDone: (img: UploadedImage) => void;
    prompt?: string;
    /** Where the image is stored: maps/ or papers/. */
    route?: "maps" | "papers";
  }

  let { onDone, prompt = "Map image", route = "maps" }: Props = $props();

  let busy = $state<string | null>(null);
  let error = $state<string | null>(null);
  let dragging = $state(false);
  let pdf = $state<{ doc: PDFDocumentProxy; name: string; thumbs: (string | null)[] } | null>(null);

  async function handleFile(file: File) {
    error = null;
    try {
      if (isPdf(file)) {
        busy = "Opening PDF…";
        const doc = await openPdf(file);
        if (doc.numPages === 1) return await finish(file.name, () => rasterizePdfPage(doc, 1));
        pdf = { doc, name: file.name, thumbs: Array(doc.numPages).fill(null) };
        busy = null;
        for (let i = 0; i < doc.numPages && pdf?.doc === doc; i++) {
          pdf.thumbs[i] = await pdfThumbnail(doc, i + 1);
        }
      } else {
        await finish(file.name, () => prepareRaster(file));
      }
    } catch (err) {
      busy = null;
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function choosePage(n: number) {
    if (!pdf) return;
    const { doc, name } = pdf;
    pdf = null;
    try {
      await finish(name, () => rasterizePdfPage(doc, n), `page ${n}`);
    } catch (err) {
      busy = null;
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function finish(sourceName: string, prepare: () => Promise<PreparedImage>, what = "") {
    busy = `Rendering ${what || sourceName}…`;
    const image = await prepare();
    busy = `Uploading ${formatBytes(image.blob.size)} (${image.width} × ${image.height})…`;
    const file = await uploadImage(route, image.blob);
    busy = null;
    onDone({ file, width: image.width, height: image.height, sourceName });
  }

  function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    if (input.files?.[0]) handleFile(input.files[0]);
    input.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  }
</script>

{#if pdf}
  <div class="pages">
    <p>{pdf.name} has {pdf.thumbs.length} pages. Which one is the map?</p>
    <div class="grid">
      {#each pdf.thumbs as thumb, i}
        <button type="button" onclick={() => choosePage(i + 1)}>
          {#if thumb}<img src={thumb} alt="Page {i + 1}" />{:else}<span class="ph"></span>{/if}
          <span>Page {i + 1}</span>
        </button>
      {/each}
    </div>
    <button type="button" class="link" onclick={() => (pdf = null)}>Cancel</button>
  </div>
{:else}
  <label
    class="drop"
    class:dragging
    class:busy={!!busy}
    ondragover={(e) => {
      e.preventDefault();
      dragging = true;
    }}
    ondragleave={() => (dragging = false)}
    ondrop={onDrop}
  >
    <input type="file" accept={ACCEPT} onchange={onPick} disabled={!!busy} />
    {#if busy}
      <strong>{busy}</strong>
    {:else}
      <strong>{prompt}</strong>
      <span>Drop a file here or click to choose: PNG, JPG, WebP, or a PDF (one page is used).</span>
    {/if}
  </label>
{/if}
{#if error}<p class="error">{error}</p>{/if}

<style>
  .drop {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
    border: 2px dashed #b9a787;
    border-radius: 6px;
    background: #fffaf0;
    cursor: pointer;
    font-size: 13px;
    text-align: center;
  }
  .drop.dragging {
    border-color: #8b2e22;
    background: #fbefe0;
  }
  .drop.busy {
    cursor: progress;
  }
  .drop input {
    display: none;
  }
  .pages p {
    margin: 0 0 8px;
    font-size: 13px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
    max-height: 360px;
    overflow: auto;
  }
  .grid button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .grid img,
  .ph {
    width: 100%;
    aspect-ratio: 3 / 4;
    object-fit: contain;
    background: #eee;
  }
  .link {
    margin-top: 8px;
    border: none;
    background: none;
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
  }
  .error {
    margin: 8px 0 0;
    padding: 8px;
    background: #f7d9d4;
    border-radius: 4px;
    font-size: 13px;
  }
</style>
