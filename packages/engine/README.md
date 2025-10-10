# @ttt/engine (packages/engine)

Pure TypeScript game engine for Tic-Tac-Toe Twist: board model, variant system, move generation, heuristics and minimax search.

Purpose
- Implement all game rules and the AI logic in a library that can be consumed by the NativeScript app (`apps/mobile`) and the AI service (`services/ai`). Keep logic deterministic and typed so consumers can reproduce and validate game state.

Quick commands
- From repo root (recommended):

```bash
# install workspaces
npm install

# build the engine (produces dist/)
npm run build:engine
```

- From inside the `packages/engine` folder:

```bash
npm install
npm run build
```

Public API (what other packages import)
- Exported functions (see `src/index.ts` and README root):
  - `createGame(config: VariantConfig): GameState`
  - `generateMoves(state: GameState): Move[]`
  - `applyMove(state: GameState, move: Move): GameState`
  - `checkWinner(state: GameState): { winner: 'X'|'O'|'Draw'|null }`
  - `evaluate(state: GameState, forPlayer: Player): number`
  - `bestMove(state: GameState, options?: { depth?: number }): Move`

Key source files (anchors)
- `src/board.ts` — core board representation and utilities
- `src/variants.ts` — variant definitions, validation and config defaults
- `src/types.ts` — shared TypeScript types used across engine, mobile UI and AI service
- `src/index.ts` — public exports
- `src/ai/minimax.ts` — alpha-beta search implementation
- `src/ai/heuristics.ts` — heuristic evaluator used by non-perfect difficulties

Editing guidance for agents
- Prefer making rule/logic changes inside `packages/engine/src` and keeping the public exports behavior stable.
- If you change exported shapes, update `types.ts` and the package `types` output (run the build and verify `dist/index.d.ts`).
- Keep changes small and well-scoped. There's no test suite in the repo; validate changes by running `npm run build:engine` and exercising the engine from `apps/mobile` or `services/ai`.

Example — use from code

```ts
import { createGame, bestMove } from '@ttt/engine';

const cfg = { boardSize: 3, winLength: 3, gravity: false };
let state = createGame(cfg);
const mv = bestMove(state, { depth: 6 });
// apply via applyMove and persist moves[] for replay
```

Quality gates before PR
- Run `npm run build:engine` and confirm no TypeScript errors.
- If changes impact the AI service contract (e.g., move shape), update `services/ai` and `apps/mobile` callers accordingly.

Notes / gotchas
- Variants: many advanced variants are declared and validated in code, but some have TODOs and unsafe guards. Look for `TODO` comments in `variants.ts` and `ai/*`.
- Performance: minimax depth grows quickly with board size; heuristics are used for larger boards. Prefer small, incremental changes to search code and benchmark locally if you change pruning or move ordering.

Where to look for help
- Root `README.md` contains architecture and setup notes.
- `apps/mobile/app/services/api.ts` and `services/ai/src/flows/move.ts` show how the engine is used in the mobile app and AI service.
