<script lang="ts">
  import type { Character, MapDef, Note, TrailStep } from "../../shared/schema";
  import Avatar from "../lib/Avatar.svelte";
  import EvidenceCard from "../lib/EvidenceCard.svelte";
  import TagMark from "../lib/icons/TagMark.svelte";
  import NoteText from "../lib/NoteText.svelte";
  import { TAG_PLURALS } from "../lib/notes";
  import { stepPlace } from "../lib/trail";

  // Expanded notes in the focus area: larger type, grouped by tag or by step.

  interface Props {
    notes: Note[];
    trail: TrailStep[];
    characters: Character[];
    maps: Record<string, MapDef>;
    group: "tag" | "step" | "cards";
    /** Style string for evidence cards (their own font settings). */
    cardStyle?: string;
  }

  let { notes, trail, characters, maps, group, cardStyle = "" }: Props = $props();

  // Card wall: the clues as evidence cards, pinned up in rows.
  const clues = $derived(notes.filter((n) => n.tag === "clue"));
  const cardWidth = $derived(clues.length <= 4 ? 330 : clues.length <= 9 ? 300 : 240);

  const groups = $derived.by(() => {
    if (group === "tag" || group === "cards") {
      const order: (Note["tag"])[] = ["clue", "question", "theory", null];
      return order
        .map((tag) => ({ key: tag ?? "none", tag, title: tag ? TAG_PLURALS[tag] : "Notes", items: notes.filter((n) => n.tag === tag) }))
        .filter((g) => g.items.length);
    }
    const byStep = trail
      .map((step, i) => ({
        key: step.id,
        tag: null,
        title: `Step ${i + 1} · ${stepPlace(step, maps)}`,
        items: notes.filter((n) => n.stepIds.includes(step.id)),
      }))
      .filter((g) => g.items.length);
    const loose = notes.filter((n) => !n.stepIds.some((id) => trail.some((t) => t.id === id)));
    return loose.length ? [...byStep, { key: "loose", tag: null, title: "Other notes", items: loose }] : byStep;
  });

  const linkedFaces = (n: Note) => {
    const inText = new Set([...n.text.matchAll(/@\[([^\]]+)\]/g)].map((m) => m[1]));
    return n.characterIds.filter((id) => !inText.has(id)).map((id) => characters.find((c) => c.id === id)).filter(Boolean) as Character[];
  };
</script>

<div class="notes">
  <h2>{group === "cards" ? "The evidence" : "Case notes"}</h2>
  {#if group === "cards"}
    <div class="wall" style={cardStyle}>
      {#each clues as n (n.id)}
        <EvidenceCard note={n} {trail} {characters} {maps} width={cardWidth} />
      {:else}
        <p class="empty">No clues on the board yet. Tag a pinned note as a clue to pin it up here.</p>
      {/each}
    </div>
  {:else if !notes.length}
    <p class="empty">No notes on the board yet.</p>
  {/if}
  <div class="columns" class:hidden={group === "cards"}>
    {#each groups as g (g.key)}
      <section>
        <h3>{#if g.tag}<TagMark tag={g.tag} size={26} />{/if} {g.title}</h3>
        {#each g.items as n (n.id)}
          <p>
            {#if group === "step" && n.tag}<TagMark tag={n.tag} size={22} />{/if}
            <NoteText text={n.text} {characters} {maps} face={26} />
            {#each linkedFaces(n) as c (c.id)}<span class="face"><Avatar character={c} size={28} /></span>{/each}
          </p>
        {/each}
      </section>
    {/each}
  </div>
</div>

<style>
  .notes {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 18px 26px;
    box-sizing: border-box;
    overflow: hidden;
    font-family: var(--font-body);
    color: var(--ink);
  }
  h2 {
    margin: 0 0 12px;
    font-family: var(--font-display);
    font-size: calc(40px * var(--fs, 1));
    font-weight: 400;
  }
  .wall {
    display: flex;
    flex-wrap: wrap;
    gap: 26px 30px;
    align-content: flex-start;
    align-items: flex-start;
    flex: 1;
    min-height: 0;
    padding: 10px 6px;
    overflow: hidden;
  }
  .columns.hidden {
    display: none;
  }
  .columns {
    flex: 1;
    min-height: 0;
    column-width: 330px;
    column-gap: 34px;
    column-fill: auto;
  }
  section {
    break-inside: avoid-column;
    margin-bottom: 18px;
  }
  h3 {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 0 0 8px;
    padding-bottom: 4px;
    border-bottom: 2px solid var(--sepia);
    font-family: var(--font-display);
    font-size: calc(27px * var(--fs, 1));
    font-weight: 400;
  }
  p {
    display: flex;
    flex-wrap: wrap;
    gap: 0 8px;
    align-items: baseline;
    margin: 0 0 10px;
    font-size: calc(25px * var(--fs, 1));
    line-height: 1.35;
  }
  .face {
    display: inline-flex;
    align-self: center;
  }
  .empty {
    color: var(--ink-soft);
    font-style: italic;
  }
</style>
