<script lang="ts">
  import { tick } from "svelte";
  import type { Character, MapDef } from "../../shared/schema";
  import { mentionAt, type MentionLink as Link } from "../lib/notes";
  import { searchPlaces, zoneName } from "../lib/trail";

  // A text input (or textarea) where "@" autocompletes characters and "#"
  // autocompletes places. Picking one inserts "@Name" / "#14 WC" and reports
  // the link; the caller turns display text into id tokens when saving.


  interface Props {
    value: string;
    characters: Character[];
    caseMaps: MapDef[];
    multiline?: boolean;
    placeholder?: string;
    maxlength?: number;
    onLink: (link: Link) => void;
    onSubmit?: () => void;
    onCancel?: () => void;
    /** Offered for an "@name" that matches nobody; returns the new character's id. */
    onCreateCharacter?: (name: string) => string | null;
    el?: HTMLInputElement | HTMLTextAreaElement;
  }

  let {
    value = $bindable(""),
    characters,
    caseMaps,
    multiline = false,
    placeholder = "",
    maxlength = 2000,
    onLink,
    onSubmit,
    onCancel,
    onCreateCharacter,
    el = $bindable(),
  }: Props = $props();

  type Option = { label: string; insert: string; link: Link } | { label: string; create: string };

  let mention = $state<ReturnType<typeof mentionAt>>(null);
  let hi = $state(0);
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const options = $derived.by((): Option[] => {
    if (!mention) return [];
    const q = squash(mention.query);
    if (mention.kind === "@") {
      const found: Option[] = characters
        .filter((c) => !q || squash(c.name).includes(q))
        .slice(0, 6)
        .map((c) => ({ label: `${c.name}${c.role ? `, ${c.role}` : ""}`, insert: `@${c.name}`, link: { characterId: c.id } }));
      const exact = characters.some((c) => squash(c.name) === q);
      if (onCreateCharacter && mention.query.trim() && !exact) {
        found.push({ label: `Create character “${mention.query}”`, create: mention.query });
      }
      return found;
    }
    if (!q) return [];
    // Zone labels and informant names: "#scot" offers 13 SW · Scotland Yard.
    return searchPlaces(mention.query, caseMaps, 6).map((m) => ({
      label: [zoneName(m.zone), m.informant, caseMaps.length > 1 ? m.mapName : null].filter(Boolean).join(" · "),
      insert: `#${zoneName(m.zone)}`,
      link: { place: { mapId: m.mapId, zoneId: m.zone.id } },
    }));
  });

  function update() {
    if (!el) return;
    mention = mentionAt(value, el.selectionStart ?? value.length);
    hi = 0;
  }

  async function pick(opt: Option) {
    if (!mention || !el) return;
    let insert: string;
    if ("create" in opt) {
      const id = onCreateCharacter?.(opt.create.trim());
      if (!id) return;
      insert = `@${opt.create.trim()}`;
      onLink({ characterId: id });
    } else {
      insert = opt.insert;
      onLink(opt.link);
    }
    const caret = el.selectionStart ?? value.length;
    value = `${value.slice(0, mention.start)}${insert} ${value.slice(caret)}`;
    const pos = mention.start + insert.length + 1;
    mention = null;
    // Place the caret before any further keystroke lands.
    await tick();
    el.setSelectionRange(pos, pos);
  }

  function keydown(e: KeyboardEvent) {
    if (options.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        hi = (hi + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length;
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(options[hi]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        mention = null;
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    } else if (e.key === "Escape") {
      onCancel?.();
    }
  }
</script>

<div class="mention">
  {#if multiline}
    <textarea
      bind:this={el}
      bind:value
      {placeholder}
      {maxlength}
      rows="3"
      oninput={update}
      onclick={update}
      onkeydown={keydown}
      onblur={() => setTimeout(() => (mention = null), 150)}
    ></textarea>
  {:else}
    <input
      bind:this={el}
      bind:value
      {placeholder}
      {maxlength}
      oninput={update}
      onclick={update}
      onkeydown={keydown}
      onblur={() => setTimeout(() => (mention = null), 150)}
    />
  {/if}
  {#if options.length}
    <ul class="options">
      {#each options as opt, i (opt.label)}
        <li>
          <button type="button" class:hi={i === hi} class:create={"create" in opt} onmouseenter={() => (hi = i)} onmousedown={(e) => e.preventDefault()} onclick={() => pick(opt)}>
            {opt.label}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .mention {
    position: relative;
  }
  input,
  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 8px;
    font: inherit;
    font-size: 15px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
    color: #2b2118;
    resize: vertical;
  }
  .options {
    position: absolute;
    z-index: 6;
    left: 0;
    right: 0;
    top: 100%;
    margin: 2px 0 0;
    padding: 4px;
    list-style: none;
    background: #fffaf0;
    border: 1px solid #b9a787;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.2);
  }
  .options button {
    width: 100%;
    border: none;
    background: none;
    text-align: left;
  }
  .options button.hi {
    background: #efe4cc;
  }
  .options button.create {
    font-style: italic;
  }
</style>
