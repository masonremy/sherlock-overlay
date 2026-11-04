<script lang="ts">
  import type { Character } from "../../shared/schema";
  import type { Connection } from "../lib/socket";
  import { newId } from "../lib/cast";
  import { autoLinks, fromDisplay, linksInText, parseQuickNote, type MentionLink } from "../lib/notes";
  import MentionInput from "./MentionInput.svelte";
  import type { PlayState } from "./play.svelte";

  // Type, Enter, done. "!" pins (shows on stream), "?" tags a question,
  // "@" and "#" link characters and places.

  let { conn, play }: { conn: Connection; play: PlayState } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch } = conn;

  const app = $derived($snapshot?.state);
  const caseMaps = $derived(app ? app.case.mapIds.map((id) => app.maps[id]).filter(Boolean) : []);

  let text = $state("");
  let picked: MentionLink[] = [];
  let el = $state<HTMLInputElement | HTMLTextAreaElement>();
  let suggestion = $state<{ noteId: string; stepId: string; n: number; place: string } | null>(null);
  let suggestTimer: ReturnType<typeof setTimeout> | undefined;
  const SUGGEST_WITHIN_MS = 10 * 60 * 1000;

  $effect(() => {
    if (play.quickNoteFocus) el?.focus();
  });

  function submit() {
    if (!app) return;
    const parsed = parseQuickNote(text);
    if (!parsed.text) return;
    const typed = autoLinks(parsed.text, app.characters, caseMaps);
    const charIds = [...picked.flatMap((l) => ("characterId" in l ? [l.characterId] : [])), ...typed.characterIds];
    const places = [...picked.flatMap((l) => ("place" in l ? [l.place] : [])), ...typed.places];
    const tokens = fromDisplay(parsed.text, withCreated(app.characters), app.maps, charIds, places);
    const id = newId("n");
    dispatch({ type: "note/add", note: { id, text: tokens, pinned: parsed.pinned, tag: parsed.tag, ...linksInText(tokens) } });
    text = "";
    picked = [];

    // Suggest, never assume: a note right after a move may be about that step.
    const last = play.lastRecorded;
    clearTimeout(suggestTimer);
    suggestion = null;
    if (play.suggestStepLinks && last && Date.now() - last.at < SUGGEST_WITHIN_MS) {
      suggestion = { noteId: id, stepId: last.stepId, n: last.n, place: last.place };
      suggestTimer = setTimeout(() => (suggestion = null), 15000);
    }
  }

  function linkSuggested() {
    if (!suggestion) return;
    dispatch({ type: "note/update", noteId: suggestion.noteId, patch: { stepIds: [suggestion.stepId] } });
    suggestion = null;
  }

  // Characters created from "@name" this session, until the server's snapshot includes them.
  let created: { id: string; name: string }[] = [];
  function createCharacter(name: string): string | null {
    if (!name) return null;
    const id = newId("c");
    dispatch({ type: "character/add", character: { id, name } });
    created.push({ id, name });
    return id;
  }
  const withCreated = (characters: Character[]): Character[] => [
    ...characters,
    ...(created
      .filter((p) => !characters.some((c) => c.id === p.id))
      .map((p) => ({ ...p, role: "", status: "witness", portrait: null, cameo: null, address: null, notes: "", hidden: false })) as Character[]),
  ];
</script>

{#if app}
  <div class="quick">
    <MentionInput
      bind:value={text}
      bind:el
      characters={app.characters}
      {caseMaps}
      placeholder="Quick note (N): ! pins to stream · ? question · @person · #place"
      onLink={(l) => picked.push(l)}
      onSubmit={submit}
      onCancel={() => el?.blur()}
      onCreateCharacter={createCharacter}
    />
    {#if suggestion}
      <div class="suggest">
        <button type="button" onclick={linkSuggested}>Link to step {suggestion.n} ({suggestion.place})?</button>
        <button type="button" class="x" onclick={() => (suggestion = null)} aria-label="Dismiss">×</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .quick {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .suggest {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .suggest button:first-child {
    background: #e6eefc;
    border-color: #9db4dc;
    font-size: 13px;
  }
  .x {
    padding: 2px 8px;
    border: none;
    background: none;
    font-size: 16px;
  }
</style>
