<script lang="ts">
  import type { Character, MapDef } from "../../shared/schema";
  import Avatar from "./Avatar.svelte";
  import { segments } from "./notes";

  // A note's text with @character and #place mentions drawn as chips. With
  // click handlers (panel), the chips are buttons that filter notes.

  interface Props {
    text: string;
    characters: Character[];
    maps: Record<string, MapDef>;
    /** Portrait size in px for character chips. */
    face?: number;
    onCharacter?: (id: string) => void;
    onPlace?: (mapId: string, zoneId: string) => void;
  }

  let { text, characters, maps, face = 18, onCharacter, onPlace }: Props = $props();
</script>

{#each segments(text, characters, maps) as seg, i (i)}
  {#if seg.kind === "text"}{seg.text}{:else if seg.kind === "character"}{#if onCharacter}<button
        type="button"
        class="chip who"
        onclick={() => onCharacter(seg.character.id)}
        ><Avatar character={seg.character} size={face} ring={false} />{seg.character.name}</button
      >{:else}<span class="chip who"><Avatar character={seg.character} size={face} ring={false} />{seg.character.name}</span
      >{/if}{:else if onPlace}<button type="button" class="chip place" onclick={() => onPlace(seg.mapId, seg.zoneId)}
      >{seg.label}</button
    >{:else}<span class="chip place">{seg.label}</span>{/if}
{/each}

<style>
  .chip {
    display: inline-flex;
    gap: 0.25em;
    align-items: center;
    padding: 0 0.4em 0 0.15em;
    border: none;
    border-radius: 999px;
    font: inherit;
    font-weight: 600;
    color: inherit;
    vertical-align: baseline;
    white-space: nowrap;
  }
  .who {
    background: rgb(43 108 176 / 0.14);
  }
  .place {
    padding-left: 0.4em;
    background: rgb(155 28 28 / 0.12);
  }
  button.chip {
    cursor: pointer;
  }
  button.chip:hover {
    outline: 1px solid currentColor;
  }
</style>
