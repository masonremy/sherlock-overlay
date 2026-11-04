<script lang="ts">
  import { onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { countedLeads, currentInvestigator, formatClock, timesheet } from "../../shared/game";
  import type { AppState } from "../../shared/schema";
  import { ms } from "../lib/motion.svelte";

  // Left: case number and title, box name in small caps. Centre: the in-game
  // date (and the timesheet clock). Right: leads, lead investigator, elapsed time.

  let { app }: { app: AppState } = $props();

  const c = $derived(app.case);
  const title = $derived([c.number && `Case ${c.number}`, c.title].filter(Boolean).join(" · ") || "Untitled case");
  const date = $derived.by(() => {
    if (!c.paperDate) return "";
    const d = new Date(`${c.paperDate}T12:00:00Z`);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  });
  const clock = $derived(c.timesheet ? formatClock(timesheet(app.trail, app.maps).now) : "");
  const leads = $derived(countedLeads(app.trail, app.scoring.freeStepIds));
  const investigator = $derived(currentInvestigator(c.players, app.trail));

  let now = $state(Date.now());
  const timer = setInterval(() => (now = Date.now()), 15_000);
  onDestroy(() => clearInterval(timer));
  const elapsed = $derived.by(() => {
    if (!c.startedAt) return "";
    const mins = Math.max(0, Math.floor((now - Date.parse(c.startedAt)) / 60_000));
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m` : `${mins}m`;
  });
</script>

<div class="bar">
  <div class="left">
    {#key title}
      <span class="title" in:fade={{ duration: ms(500) }}>{title}</span>
    {/key}
    {#if c.box}<span class="box">{c.box}</span>{/if}
  </div>
  <div class="centre">
    {#if date}<span>{date}</span>{/if}
    {#if clock}<span class="clock">{clock}</span>{/if}
  </div>
  <div class="right">
    {#key leads}
      <span class="leads" in:fade={{ duration: ms(300) }}>Leads <strong>{leads}</strong></span>
    {/key}
    {#if investigator}<span class="who">Lead: <strong>{investigator.name}</strong></span>{/if}
    {#if elapsed}<span class="elapsed">{elapsed}</span>{/if}
  </div>
</div>

<style>
  .bar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    height: 100%;
    padding: 0 28px;
    box-sizing: border-box;
    font-family: var(--font-body);
    font-size: calc(22px * var(--fs, 1));
  }
  .left {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    line-height: 1.05;
  }
  .title {
    overflow: hidden;
    font-family: var(--font-display);
    font-size: calc(32px * var(--fs, 1));
    white-space: nowrap;
    text-overflow: ellipsis;
    animation: ink 900ms ease-out;
  }
  .box {
    font-size: calc(14px * var(--fs, 1));
    font-variant: small-caps;
    letter-spacing: 0.08em;
    color: var(--ink-soft);
  }
  .centre {
    display: flex;
    gap: 18px;
    font-family: var(--font-display);
    font-size: calc(26px * var(--fs, 1));
    font-style: italic;
  }
  .clock {
    font-style: normal;
    font-family: var(--font-body);
    font-variant-numeric: tabular-nums;
  }
  .right {
    display: flex;
    gap: 22px;
    justify-content: flex-end;
    align-items: baseline;
    font-variant-numeric: tabular-nums;
  }
  .leads strong {
    font-size: calc(30px * var(--fs, 1));
  }
  .elapsed {
    color: var(--ink-soft);
  }
  /* The title inks in when a case starts. */
  @keyframes ink {
    from {
      opacity: 0;
      filter: blur(3px);
      letter-spacing: 0.08em;
    }
  }
</style>
