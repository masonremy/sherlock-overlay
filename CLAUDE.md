# Consulting Detective Stream Overlay

A local web app for streaming Sherlock Holmes Consulting Detective: a read-only OBS overlay plus a control panel, synced through a small local server.

## Source of truth

- `DESIGN.md` is the full design. Read it before any work and follow it; if something in it is unclear or seems wrong, ask rather than guess.
- Build one phase at a time from the "Build plan" section. Don't start the next phase until asked.

## How to work

- TypeScript everywhere. Shared types, actions and the reducer live in `shared/`; the server and both pages use the same reducer.
- Write Vitest tests for every new action before implementing it.
- Every state change is an action, so it syncs, persists and can be undone. Anything set live must be editable live.
- The overlay page background is always transparent.
- Never bundle or fetch game content (case text, map or newspaper images). Everything game-specific comes from the streamer's uploads.
- `maps/`, `cases/`, `fonts/` user uploads and `layouts.json` / `theme.json` are user data: git-ignored, never overwritten by code changes.

## Running

- `npm run dev` starts the server on `localhost:7777`.
- Overlay: `/overlay` (add `?bg=checker` to see transparency). Control panel: `/control`.
- At the end of each phase, report how to check its "Done when" condition.
