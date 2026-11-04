<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import type { Character, MapDef, Note } from "../../shared/schema";
  import Avatar from "./Avatar.svelte";
  import TagMark from "./icons/TagMark.svelte";
  import NoteText from "./NoteText.svelte";

  // Compact notes strip: on-stream notes, newest first, small type. Scrolls to
  // a position set from the panel; when idle it can slowly auto-scroll. The
  // panel shows the same component as a mirrored preview (interactive).

  interface Props {
    notes: Note[];
    characters: Character[];
    maps: Record<string, MapDef>;
    /** Scroll position 0–1 from the panel. */
    scroll: number;
    autoScroll: boolean;
    /** Panel preview: wheel or drag to scroll, reported via onScroll. */
    onScroll?: (value: number) => void;
  }

  let { notes, characters, maps, scroll, autoScroll, onScroll }: Props = $props();

  let box: HTMLDivElement;
  let fraction = $state(0); // where we are now, for the indicator
  let overflow = $state(false);
  let idleSince = Date.now();
  let raf = 0;

  // Exact position in px. Browsers round scrollTop to whole pixels, so creeping
  // forward a fraction of a pixel per frame must accumulate here, not there.
  let pos = 0;

  const maxScroll = () => Math.max(0, box.scrollHeight - box.clientHeight);
  function setFraction(f: number) {
    fraction = Math.min(1, Math.max(0, f));
    pos = fraction * maxScroll();
    box.scrollTop = pos;
  }

  // An explicit scroll from the panel wins and restarts the idle timer.
  $effect(() => {
    const target = scroll;
    untrack(() => {
      idleSince = Date.now();
      setFraction(target);
    });
  });

  // Re-measure when the notes change.
  $effect(() => {
    notes;
    queueMicrotask(() => {
      if (!box) return;
      overflow = maxScroll() > 1;
      pos = fraction * maxScroll();
      box.scrollTop = pos;
    });
  });

  // Slow auto-scroll after 6 s idle; pause at the bottom, then start over.
  const IDLE_MS = 6000;
  const SPEED = 22; // px per second
  const PAUSE_MS = 2500;
  let pauseUntil = 0;
  let atBottom = false;
  let last = performance.now();
  let frames = 0;
  function tick(now: number) {
    const dt = (now - last) / 1000;
    last = now;
    // Re-check now and then: fonts loading or a resize can change whether it overflows.
    if (++frames % 30 === 0) overflow = maxScroll() > 1;
    if (autoScroll && overflow && Date.now() - idleSince > IDLE_MS && now > pauseUntil) {
      if (atBottom) {
        // Paused at the bottom: back to the top, pause there, go again.
        atBottom = false;
        setFraction(0);
        pauseUntil = now + PAUSE_MS;
      } else {
        const max = maxScroll();
        pos = Math.min(max, pos + SPEED * dt);
        box.scrollTop = pos;
        fraction = pos / max;
        if (pos >= max) {
          atBottom = true;
          pauseUntil = now + PAUSE_MS;
        }
      }
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  onDestroy(() => cancelAnimationFrame(raf));

  // Panel preview input.
  function wheel(e: WheelEvent) {
    if (!onScroll || !overflow) return;
    e.preventDefault();
    const f = Math.min(1, Math.max(0, fraction + e.deltaY / maxScroll()));
    idleSince = Date.now();
    setFraction(f);
    onScroll(f);
  }
  let drag: { y: number; f: number } | null = null;
  function down(e: PointerEvent) {
    if (!onScroll) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { y: e.clientY, f: fraction };
  }
  function move(e: PointerEvent) {
    if (!drag || !onScroll || !overflow) return;
    const scale = box.getBoundingClientRect().height / box.clientHeight; // preview is scaled down
    const f = drag.f - (e.clientY - drag.y) / scale / maxScroll();
    idleSince = Date.now();
    setFraction(f);
    onScroll(fraction);
  }

  const linkedFaces = (n: Note) => {
    const inText = new Set([...n.text.matchAll(/@\[([^\]]+)\]/g)].map((m) => m[1]));
    return n.characterIds.filter((id) => !inText.has(id)).map((id) => characters.find((c) => c.id === id)).filter(Boolean) as Character[];
  };
</script>

<div class="strip" class:overflow class:interactive={!!onScroll}>
  <div
    class="list"
    bind:this={box}
    onwheel={wheel}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={() => (drag = null)}
    role="presentation"
  >
    {#each notes as n (n.id)}
      <p>
        {#if n.tag}<TagMark tag={n.tag} size={20} />{/if}
        <NoteText text={n.text} {characters} {maps} face={20} />
        {#each linkedFaces(n) as c (c.id)}<span class="face"><Avatar character={c} size={22} /></span>{/each}
      </p>
    {:else}
      <p class="empty">Pinned notes appear here.</p>
    {/each}
  </div>
  {#if overflow}
    <div class="indicator"><span style:top="{fraction * 70}%"></span></div>
  {/if}
</div>

<style>
  .strip {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .list {
    height: 100%;
    overflow: hidden;
    padding: 10px 26px 10px 18px;
    box-sizing: border-box;
    font-family: var(--font-body);
    font-size: 21px;
    line-height: 1.35;
    color: var(--ink);
  }
  .overflow .list {
    mask-image: linear-gradient(to bottom, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%);
  }
  .interactive .list {
    cursor: ns-resize;
    touch-action: none;
  }
  p {
    display: flex;
    flex-wrap: wrap;
    gap: 0 6px;
    align-items: baseline;
    margin: 0 0 8px;
  }
  .face {
    display: inline-flex;
    align-self: center;
  }
  .empty {
    color: var(--ink-soft);
    font-style: italic;
  }
  .indicator {
    position: absolute;
    top: 12px;
    bottom: 12px;
    right: 8px;
    width: 4px;
    border-radius: 2px;
    background: rgb(43 33 24 / 0.12);
  }
  .indicator span {
    position: absolute;
    left: 0;
    width: 4px;
    height: 30%;
    border-radius: 2px;
    background: var(--sepia);
  }
</style>
