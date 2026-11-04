<script lang="ts">
  import { cubicOut, cubicIn } from "svelte/easing";
  import type { Character } from "../../shared/schema";
  import Avatar from "../lib/Avatar.svelte";
  import { STATUS_COLORS, STATUS_LABELS } from "../lib/cast";
  import { motion } from "../lib/motion.svelte";

  // A newly met character's introduction: slides in large over the focus area,
  // then shrinks off toward the cast rail on the left.

  let { character }: { character: Character } = $props();

  function enter(_node: Element) {
    if (motion.reduced) return { duration: 200, css: (t: number) => `opacity:${t}` };
    return { duration: 550, easing: cubicOut, css: (t: number) => `opacity:${t}; transform: translateX(${(1 - t) * 260}px)` };
  }
  function leave(_node: Element) {
    if (motion.reduced) return { duration: 200, css: (t: number) => `opacity:${t}` };
    return {
      duration: 550,
      easing: cubicIn,
      css: (t: number) => `opacity:${t}; transform: translateX(${(t - 1) * 700}px) scale(${0.35 + 0.65 * t})`,
    };
  }
</script>

<div class="intro" in:enter out:leave>
  <Avatar {character} size={280} />
  <div class="text">
    <span class="met">Enter</span>
    <strong>{character.name}</strong>
    {#if character.role}<span class="role">{character.role}</span>{/if}
    <span class="status" style:color={STATUS_COLORS[character.status]}>{STATUS_LABELS[character.status]}</span>
  </div>
</div>

<style>
  .intro {
    display: flex;
    gap: 32px;
    align-items: center;
    padding: 28px 40px 28px 28px;
    background: #efe4cc;
    border: 1px solid #8a7354;
    border-radius: 8px;
    box-shadow: 0 10px 40px rgb(0 0 0 / 0.5);
    transform-origin: left center;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 520px;
  }
  .met {
    font-family: var(--font-display);
    font-size: 26px;
    font-style: italic;
    color: #6b5a44;
  }
  strong {
    font-family: var(--font-display);
    font-size: 58px;
    font-weight: 400;
    line-height: 1.05;
  }
  .role {
    font-size: 28px;
    color: #4a3b2a;
  }
  .status {
    font-size: 22px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
</style>
