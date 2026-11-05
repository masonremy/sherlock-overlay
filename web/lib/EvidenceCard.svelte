<script lang="ts">
  import type { Character, MapDef, Note, TrailStep } from "../../shared/schema";
  import Avatar from "./Avatar.svelte";
  import { cardSource, cardTilt } from "./evidence";
  import EvidenceSlip from "./icons/EvidenceSlip.svelte";
  import NoteText from "./NoteText.svelte";

  // A clue as a typed paper slip: a label strip, the streamer's own summary in
  // a typewriter face, where it came from, and anyone linked to it. The app
  // never ships or fetches case text; this is always the streamer's note.

  interface Props {
    note: Note;
    trail: TrailStep[];
    characters: Character[];
    maps: Record<string, MapDef>;
    /** Width in px; everything inside scales with it. */
    width: number;
    tilt?: boolean;
  }

  let { note, trail, characters, maps, width, tilt = true }: Props = $props();

  const source = $derived(cardSource(note, trail, maps));
  const people = $derived(note.characterIds.map((id) => characters.find((c) => c.id === id)).filter(Boolean) as Character[]);
  const u = $derived(width / 400); // design unit: sizes below are for a 400 px card
</script>

<article
  class="card paper"
  style:width="{width}px"
  style:--u={u}
  style:transform={tilt ? `rotate(${cardTilt(note.id)}deg)` : undefined}
>
  <header>
    <EvidenceSlip size={26 * u} />
    <span class="label">Evidence</span>
  </header>
  <p class="text"><NoteText text={note.text} {characters} {maps} face={22 * u} /></p>
  {#if source || people.length}
    <footer>
      {#if source}<span class="source">{source}</span>{/if}
      {#if people.length}
        <span class="people">
          {#each people as c (c.id)}
            <span class="who"><Avatar character={c} size={34 * u} />{c.name}</span>
          {/each}
        </span>
      {/if}
    </footer>
  {/if}
</article>

<style>
  .card {
    position: relative;
    box-sizing: border-box;
    padding: calc(14px * var(--u)) calc(20px * var(--u)) calc(16px * var(--u));
    border-radius: 2px;
    color: var(--ink);
    transform-origin: 50% 0;
  }
  header {
    display: flex;
    gap: calc(8px * var(--u));
    align-items: center;
    margin-bottom: calc(10px * var(--u));
  }
  /* Typed label strip, like a punched label stuck on the slip. */
  .label {
    padding: calc(2px * var(--u)) calc(10px * var(--u));
    background: var(--ink);
    color: var(--paper-light);
    font-family: var(--card-font, "Special Elite"), monospace;
    font-size: calc(15px * var(--u) * var(--fs, 1));
    letter-spacing: 0.25em;
    text-transform: uppercase;
  }
  .text {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.3em;
    align-items: baseline;
    margin: 0;
    font-family: var(--card-font, "Special Elite"), monospace;
    font-size: calc(24px * var(--u) * var(--fs, 1));
    line-height: 1.35;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    gap: calc(6px * var(--u)) calc(14px * var(--u));
    align-items: center;
    margin-top: calc(12px * var(--u));
    padding-top: calc(8px * var(--u));
    border-top: 1px dashed var(--sepia);
    font-family: var(--font-body);
    /* Never below ~14 px, so it survives a 720p stream on a small card. */
    font-size: max(14px, calc(17px * var(--u) * var(--fs, 1)));
  }
  .source {
    font-style: italic;
    color: var(--ink-soft);
  }
  .people {
    display: flex;
    flex-wrap: wrap;
    gap: calc(10px * var(--u));
  }
  .who {
    display: inline-flex;
    gap: calc(6px * var(--u));
    align-items: center;
    font-weight: 600;
  }
</style>
