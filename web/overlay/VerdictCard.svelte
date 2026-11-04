<script lang="ts">
  import { scoreCase } from "../../shared/game";
  import type { AppState } from "../../shared/schema";
  import { isNumbered, stepPlace } from "../lib/trail";

  // End of case: the final score against Holmes's 100, the lead comparison and
  // the trail, for a post-stream recap or screenshot.

  let { app }: { app: AppState } = $props();

  const result = $derived(scoreCase(app.scoring, app.trail));
  const holmes = $derived(app.scoring.holmesLeads);
  const diff = $derived(holmes === null ? null : result.leads - holmes);
  const free = $derived(new Set(app.scoring.freeStepIds));
</script>

<div class="verdict">
  <h2>The verdict</h2>
  <div class="scores">
    <div class="you">
      <span class="label">Your score</span>
      <strong>{result.score ?? "—"}</strong>
    </div>
    <div class="vs">vs</div>
    <div class="holmes">
      <span class="label">Holmes</span>
      <strong>100</strong>
    </div>
  </div>
  <p class="breakdown">
    {result.points} points from the questions
    {#if diff !== null}
      · {result.leads} leads against Holmes's {holmes}
      ({diff === 0 ? "level" : diff > 0 ? `−${diff * 5} for ${diff} extra` : `+${-diff * 5} for ${-diff} fewer`})
    {/if}
  </p>
  <ol class="trail">
    {#each app.trail as step, i (step.id)}
      <li class:muted={!isNumbered(step.kind) || free.has(step.id)}>
        <b>{i + 1}</b>
        {stepPlace(step, app.maps)}{#if free.has(step.id)}<small> (free)</small>{/if}
      </li>
    {/each}
  </ol>
</div>

<style>
  .verdict {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    padding: 22px 30px;
    box-sizing: border-box;
    overflow: hidden;
    font-family: var(--font-body);
    color: var(--ink);
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: calc(44px * var(--fs, 1));
    font-weight: 400;
    text-align: center;
  }
  .scores {
    display: flex;
    gap: 40px;
    justify-content: center;
    align-items: center;
  }
  .scores > div:not(.vs) {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 220px;
    padding: 10px 24px;
    border: 3px double var(--sepia);
    border-radius: 6px;
    background: var(--paper-light);
  }
  .label {
    font-size: calc(18px * var(--fs, 1));
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-soft);
  }
  strong {
    font-family: var(--font-display);
    font-size: calc(96px * var(--fs, 1));
    font-weight: 400;
    line-height: 1;
  }
  .you strong {
    color: var(--wax);
  }
  .vs {
    font-family: var(--font-display);
    font-size: calc(32px * var(--fs, 1));
    font-style: italic;
  }
  .breakdown {
    margin: 0;
    text-align: center;
    font-size: calc(22px * var(--fs, 1));
  }
  .trail {
    flex: 1;
    min-height: 0;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    columns: 4 200px;
    column-gap: 24px;
    font-size: calc(19px * var(--fs, 1));
  }
  li {
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin-bottom: 4px;
    break-inside: avoid;
  }
  li b {
    display: inline-grid;
    place-items: center;
    min-width: 26px;
    height: 26px;
    border-radius: 13px;
    background: var(--wax);
    color: #fff;
    font-size: 15px;
  }
  li.muted b {
    background: var(--paper-light);
    color: var(--wax);
    box-shadow: inset 0 0 0 2px var(--wax);
  }
</style>
