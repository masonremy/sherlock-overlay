<script lang="ts">
  import { formatClock, scoreCase, timesheet } from "../../shared/game";
  import { newId } from "../lib/cast";
  import type { Connection } from "../lib/socket";
  import { stepPlace } from "../lib/trail";

  // Case details, players, timesheet mode, end-of-case scoring and case
  // management (switch, new, duplicate, next in campaign, export, snapshot).

  let { conn }: { conn: Connection } = $props();
  // svelte-ignore state_referenced_locally (the connection lives as long as the page)
  const { snapshot, dispatch, status } = conn;

  const app = $derived($snapshot?.state);
  type CasePatch = { title?: string; number?: string; box?: string; paperDate?: string | null; timesheet?: boolean; campaignId?: string | null; players?: { id: string; name: string }[] };
  const setCase = (patch: CasePatch) => dispatch({ type: "case/update", patch });

  // The paper's date is the case date; edit it there when the case has a paper.
  function setDate(value: string) {
    const date = value || null;
    if (app?.newspaper.paperId) dispatch({ type: "paper/update", paperId: app.newspaper.paperId, patch: { date } });
    else setCase({ paperDate: date });
  }

  // --- Players ----------------------------------------------------------------------
  // Edited locally and sent whole, so quick successive adds build on each
  // other instead of on a snapshot that hasn't caught up yet.
  let players = $state<{ id: string; name: string }[]>([]);
  $effect(() => {
    if (app) players = app.case.players;
  });
  let newPlayer = $state("");
  function setPlayers(next: { id: string; name: string }[]) {
    players = next;
    setCase({ players: next });
  }
  function addPlayer() {
    const name = newPlayer.trim();
    if (!name) return;
    setPlayers([...players, { id: newId("p"), name }]);
    newPlayer = "";
  }

  // --- Scoring ----------------------------------------------------------------------
  const result = $derived(app ? scoreCase(app.scoring, app.trail) : null);
  const num = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));
  function toggleFree(stepId: string, on: boolean) {
    if (!app) return;
    const ids = app.scoring.freeStepIds.filter((id) => id !== stepId);
    dispatch({ type: "scoring/update", patch: { freeStepIds: on ? [...ids, stepId] : ids } });
  }

  // --- Cases ------------------------------------------------------------------------
  type Summary = { id: string; title: string; number: string; box: string; campaignId: string | null; startedAt: string | null; steps: number };
  let cases = $state<Summary[]>([]);
  let confirm = $state<"new" | "duplicate" | "next" | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function loadCases() {
    const res = await fetch("/api/cases");
    if (res.ok) cases = (await res.json()).cases;
  }
  $effect(() => {
    $snapshot?.caseId;
    loadCases();
  });

  async function post(url: string, body?: unknown) {
    busy = true;
    error = null;
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      if (!res.ok) error = (await res.json().catch(() => ({}))).error ?? `Failed (${res.status})`;
    } finally {
      busy = false;
      confirm = null;
    }
  }

  const caseLabel = (c: Summary) => [c.number && `Case ${c.number}`, c.title || "Untitled", c.box && `(${c.box})`].filter(Boolean).join(" ");
  const SEED_LABELS = {
    new: "Start a blank case (keeps maps, players and layout)",
    duplicate: "Duplicate this case (keeps the cast, clears the trail)",
    next: "Next case in this campaign (carries the cast and pinned notes forward)",
  };
</script>

{#if app}
  <div class="case">
    <fieldset>
      <legend>This case</legend>
      <div class="row">
        <label class="num">Number <input value={app.case.number} maxlength="20" placeholder="3" onchange={(e) => setCase({ number: e.currentTarget.value })} /></label>
        <label class="grow">Title <input value={app.case.title} maxlength="200" placeholder="The Tin Soldier" onchange={(e) => setCase({ title: e.currentTarget.value })} /></label>
      </div>
      <div class="row">
        <label class="grow">Box <input value={app.case.box} maxlength="80" placeholder="Thames Murders" onchange={(e) => setCase({ box: e.currentTarget.value })} /></label>
        <label>Paper date <input type="date" value={app.case.paperDate ?? ""} onchange={(e) => setDate(e.currentTarget.value)} /></label>
      </div>
      <label>Campaign <input value={app.case.campaignId ?? ""} maxlength="60" placeholder="(none)" onchange={(e) => setCase({ campaignId: e.currentTarget.value.trim() || null })} /></label>
    </fieldset>

    <fieldset>
      <legend>Lead investigator</legend>
      <p class="hint">List the players in seating order; the book passes left each turn and the title bar shows whose turn it is.</p>
      <ol class="players">
        {#each players as p, i (p.id)}
          <li>
            {i + 1}. {p.name}
            <button type="button" class="x" aria-label="Remove {p.name}" onclick={() => setPlayers(players.filter((x) => x.id !== p.id))}>×</button>
          </li>
        {/each}
      </ol>
      <div class="row">
        <input bind:value={newPlayer} placeholder="Player name" maxlength="40" onkeydown={(e) => e.key === "Enter" && addPlayer()} />
        <button type="button" onclick={addPlayer}>Add</button>
      </div>
    </fieldset>

    <fieldset>
      <legend>Timesheet (Queen's Park)</legend>
      <label class="check">
        <input type="checkbox" checked={app.case.timesheet} onchange={(e) => setCase({ timesheet: e.currentTarget.checked })} />
        Track the clock: 15 min per move (more across areas), plus each lead's stated time
      </label>
      {#if app.case.timesheet}
        <p class="clock">{formatClock(timesheet(app.trail, app.maps).now)}</p>
        <p class="hint">Enter each lead's duration when recording. Set which areas border each other in Zones → the map → Area adjacency.</p>
      {/if}
    </fieldset>

    <fieldset>
      <legend>Scoring (end of case)</legend>
      <div class="row">
        <label>Series 1 <input type="number" value={app.scoring.series1 ?? ""} onchange={(e) => dispatch({ type: "scoring/update", patch: { series1: num(e.currentTarget.value) } })} /></label>
        <label>Series 2 <input type="number" value={app.scoring.series2 ?? ""} onchange={(e) => dispatch({ type: "scoring/update", patch: { series2: num(e.currentTarget.value) } })} /></label>
        <label>Holmes's leads <input type="number" min="0" value={app.scoring.holmesLeads ?? ""} onchange={(e) => dispatch({ type: "scoring/update", patch: { holmesLeads: num(e.currentTarget.value) } })} /></label>
      </div>
      {#if app.trail.some((t) => t.kind === "lead")}
        <details>
          <summary>Steps the solution declares free ({app.scoring.freeStepIds.length})</summary>
          {#each app.trail as t, i (t.id)}
            {#if t.kind === "lead"}
              <label class="check">
                <input type="checkbox" checked={app.scoring.freeStepIds.includes(t.id)} onchange={(e) => toggleFree(t.id, e.currentTarget.checked)} />
                {i + 1}. {stepPlace(t, app.maps)}
              </label>
            {/if}
          {/each}
        </details>
      {/if}
      {#if result}
        <p class="score">
          {result.points} points · {result.leads} leads
          {#if result.score !== null}· <strong>score {result.score}</strong> (Holmes 100){:else}· enter Holmes's leads to score{/if}
        </p>
      {/if}
      <button
        type="button"
        class:primary={app.overlay.focus !== "verdict"}
        onclick={() => dispatch(app.overlay.focus === "verdict" ? { type: "overlay/returnFocus" } : { type: "overlay/setFocus", focus: "verdict" })}
      >
        {app.overlay.focus === "verdict" ? "Hide the verdict card" : "Show the verdict card"}
      </button>
    </fieldset>

    <fieldset>
      <legend>Cases</legend>
      <label>
        Open case
        <select
          value={$snapshot?.caseId}
          disabled={busy}
          onchange={(e) => post(`/api/cases/${encodeURIComponent(e.currentTarget.value)}/open`)}
        >
          {#each cases as c (c.id)}<option value={c.id}>{caseLabel(c)} · {c.steps} steps</option>{/each}
        </select>
      </label>
      {#each ["new", "duplicate", "next"] as const as kind (kind)}
        {#if confirm === kind}
          <div class="confirm">
            {SEED_LABELS[kind]}? The overlay switches to it straight away.
            <button type="button" class="primary" disabled={busy} onclick={() => post("/api/cases", { kind })}>Start it</button>
            <button type="button" onclick={() => (confirm = null)}>Cancel</button>
          </div>
        {:else}
          <button type="button" class="wide" onclick={() => (confirm = kind)}>{SEED_LABELS[kind]}</button>
        {/if}
      {/each}
      <div class="row">
        <a class="button" href="/api/case/export" download>Export case JSON</a>
        <a class="button" href="/api/snapshot.png" download title="Transparent PNG of the overlay right now">Snapshot PNG</a>
        <a class="button" href="/api/snapshot.png?bg=paper" download title="Same, on a solid background">PNG (solid)</a>
      </div>
      {#if error}<p class="error">{error}</p>{/if}
    </fieldset>

    <p class="hint">Case folder <code>{$snapshot?.caseId}</code> · revision {$snapshot?.rev} · <button type="button" class="link" onclick={() => dispatch({ type: "debug/ping" })} disabled={$status !== "open"}>bump</button></p>
  </div>
{/if}

<style>
  .case {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid #d8c9aa;
    border-radius: 6px;
  }
  legend {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b5a44;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: end;
  }
  .grow {
    flex: 1;
  }
  .num input {
    width: 56px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #6b5a44;
  }
  .check {
    flex-direction: row;
    align-items: center;
    gap: 6px;
    color: inherit;
    font-size: 13px;
  }
  input,
  select {
    min-width: 0;
    padding: 6px;
    font: inherit;
    font-size: 14px;
    border: 1px solid #b9a787;
    border-radius: 4px;
    background: #fffaf0;
    color: #2b2118;
  }
  input[type="number"] {
    width: 80px;
  }
  .players {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 14px;
  }
  .players li {
    display: flex;
    justify-content: space-between;
  }
  .x {
    padding: 0 8px;
    border: none;
    background: none;
  }
  .clock {
    margin: 0;
    font-family: Georgia, serif;
    font-size: 18px;
  }
  .score {
    margin: 0;
    font-size: 14px;
  }
  .wide {
    text-align: left;
  }
  .confirm {
    padding: 8px;
    background: #fdf2c9;
    border-radius: 4px;
    font-size: 13px;
  }
  .button {
    padding: 6px 10px;
    border: 1px solid #8a7354;
    border-radius: 4px;
    background: #efe4cc;
    color: inherit;
    font-size: 13px;
    text-decoration: none;
  }
  .primary {
    background: #8b2e22;
    border-color: #8b2e22;
    color: #fff;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: #6b5a44;
  }
  .error {
    margin: 0;
    padding: 6px 8px;
    background: #f7d9d4;
    border-radius: 4px;
    font-size: 13px;
  }
  .link {
    border: none;
    background: none;
    padding: 0;
    text-decoration: underline;
    font-size: 12px;
  }
</style>
