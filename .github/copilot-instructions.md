This repo is a TypeScript monorepo for "Tic-Tac-Toe Twist": a NativeScript mobile app, a shared game engine, and an AI service.

Quick goal for an AI assistant
- Make small, scoped changes that preserve existing build scripts and TypeScript types.
- When modifying game logic, prefer edits inside `packages/engine/src` and keep public API (exports in `packages/engine/package.json`) stable.

What you need to know (big picture)
- Monorepo layout: root workspaces defined in `package.json` include `packages/*`, `services/*`, and `apps/*`.
- apps/mobile: NativeScript UI (TypeScript) that imports the engine as `@ttt/engine` (see `apps/mobile/package.json`).
- packages/engine: pure TypeScript library implementing board, rules, move generation, heuristics, and minimax (`src/{board,variants,ai}`).
- services/ai: Node/Genkit service exposing `/move` to compute AI moves for non-local play (configure via `.env` in `services/ai`).

Important files and patterns (use these as anchors)
- Root README.md — architecture overview, setup steps, engine API and Genkit notes. Read before changing workflow docs.
- `scripts/ns-mobile-run.js` — wrapper to run `ns run` that avoids workspace ENOWORKSPACES issues; prefer `npm run mobile:android` (root) which calls this script.
- `packages/engine/src` — the canonical place for game logic. Public API functions mentioned in README: `createGame`, `generateMoves`, `applyMove`, `checkWinner`, `evaluate`, `bestMove`.
- `apps/mobile/app/services/api.ts` — the mobile-to-AI-service integration point (calls `/move`).
- `apps/mobile/App_Resources/Android/src/google-services.json` — Firebase config placeholder; mobile builds often fail without replacing this file for Google sign-in.

Build / run / debug (developer shortcuts)
- Install all workspaces from repo root: `npm install`.
- Build engine: `npm run build:engine` (root script forwards to `packages/engine` build). This produces `packages/engine/dist` and is required before installing the engine into the NativeScript app.
- Run Genkit AI service (dev): from repo root `npm run dev:ai` or `npm --workspace services/ai run dev`.
- Run mobile app (preferred via helper): `npm run mobile:android` (calls `scripts/ns-mobile-run.js`). To pass extra NativeScript flags, append after `--`, e.g. `npm run mobile:android -- --device emulator-5554`.
- Direct `ns run` inside `apps/mobile` may error due to workspaces; use the helper or run `ns` with `--path` to the app.

Project-specific conventions and gotchas
- NativeScript path handling: the repo ships a helper script because running `ns` inside an npm workspace triggers ENOWORKSPACES; use `scripts/ns-mobile-run.js` or `npm run mobile:android` instead of calling `ns` directly in many cases.
- Engine linkage: `apps/mobile/package.json` references the engine as a file dependency (`file:../../packages/engine`). In development, rebuild the engine and reinstall or use `npm i ../../packages/engine --save` from `apps/mobile` after `npm run build:engine` at root.
- Firebase: the repo keeps a placeholder `google-services.json`; mobile runs that require Google sign-in must have real Firebase config at `apps/mobile/App_Resources/Android/src/google-services.json` and the package id match (`com.tictactoetwist`).
- Genkit: `services/ai` expects an `.env` (derived from `.env.example`) and may default to ports 9191 (API) and 3100 (Genkit UI). Mobile emulator usually connects to `http://10.0.2.2:9191` for Android.

When you change behavior
- Unit-like tests are not present; follow these guidelines:
  - Add small, self-contained changes to `packages/engine/src` with clear exported API behavior.
  - Update `packages/engine` TypeScript types in `types.ts` when changing shapes.
  - Run `npm run build:engine` and manually test in the mobile app or `services/ai` if the change affects AI move generation.

Useful examples (search these when editing)
- Move generation & heuristics: `packages/engine/src/ai/minimax.ts`, `packages/engine/src/ai/heuristics.ts`.
- Variant definitions and validation: `packages/engine/src/variants.ts`.
- Mobile API usage: `apps/mobile/app/services/api.ts` (calls `/move`).

Edge cases for agents
- Avoid changing NativeScript UI markup (`*.xml`) unless you can test on a device/emulator; layout regressions are easy to introduce.
- Do not change app IDs or bundle identifiers without updating Firebase config (`App_Resources/*`) and the `apps/mobile/package.json` `nativescript.id`.
- When editing `services/ai`, preserve the `/move` contract: request body { state, config, difficulty } and response { move }.

If unsure, ask the human
- Which platform to test on (Android emulator vs iOS device).
- Whether the change should be library-only (`packages/engine`) or require mobile UI/integration updates.

Files added/edited by agents must include a short, single-line reason in the commit message and reference related files (e.g., "engine: simplify generateMoves — updates variants.ts and minimax.ts").

Next step for you (human): review and tell me if you want additional examples, or prefer stricter rules about tests/PR format.
