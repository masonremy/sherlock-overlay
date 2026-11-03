<script lang="ts">
  import { connect } from "../lib/socket";

  // Read-only: the overlay never sends actions.
  const { snapshot } = connect();
  const checker = new URLSearchParams(location.search).get("bg") === "checker";
</script>

<div class="stage" class:checker>
  {#if $snapshot}
    <header class="card">
      <span class="title">{$snapshot.state.case.title || "Untitled case"}</span>
      {#key $snapshot.rev}
        <span class="rev">rev {$snapshot.rev}</span>
      {/key}
    </header>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 1920px;
    height: 1080px;
    background: transparent;
    font-family: Georgia, "Times New Roman", serif;
  }
  .stage.checker {
    background: repeating-conic-gradient(#bbb 0 25%, #eee 0 50%) 0 0 / 40px 40px;
  }
  .card {
    position: absolute;
    left: 24px;
    top: 24px;
    display: flex;
    align-items: baseline;
    gap: 24px;
    padding: 12px 24px;
    background: #efe4cc;
    color: #2b2118;
    border: 1px solid #8a7354;
    border-radius: 4px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.35);
  }
  .title {
    font-size: 32px;
  }
  .rev {
    font-family: system-ui, sans-serif;
    font-size: 24px;
    font-variant-numeric: tabular-nums;
    animation: ink 400ms ease-out;
  }
  @keyframes ink {
    from { opacity: 0; transform: translateY(-6px); }
  }
</style>
