# @ttt/engine

Pure TypeScript game engine for Tic-Tac-Toe Twist — board model, variant system, move generation, heuristics, and minimax search with alpha-beta pruning.

**Version:** 0.3.0 · **Module:** ESM · **Runtime deps:** none

## Purpose

Implements all game rules and AI logic in a standalone library consumed by:

- `apps/mobile` — NativeScript app (imported as `@ttt/engine`)
- `services/ai` — Genkit microservice (engine-based move fallback)

All logic is deterministic and fully typed so consumers can reproduce and validate game state.

## Quick Commands

```bash
# From repo root (recommended)
npm install
npm run build:engine        # tsc → packages/engine/dist/

# From inside packages/engine/
npm run build               # same thing, local
npm run clean               # rimraf dist/
```

## Source Layout

```
packages/engine/
├── package.json            # @ttt/engine v0.3.0
├── tsconfig.json
└── src/
    ├── index.ts            # Public API re-exports
    ├── types.ts            # Core type definitions
    ├── board.ts            # Board model, move gen, win detection, power-ups
    ├── variants.ts         # Variant defaults & config validation
    └── ai/
        ├── minimax.ts      # Alpha-beta search with transposition table
        └── heuristics.ts   # Position evaluation & scoring
```

## Public API

Everything below is exported from `@ttt/engine` (see `src/index.ts`).

### Types

```typescript
type Player     = 'X' | 'O'
type Cell       = Player | null | 'B' | 'F'   // B = blocked, F = bombed
type Difficulty = 'chill' | 'balanced' | 'sharp'
type OneTimePowerId = 'doubleMove' | 'laneShift' | 'bomb'
type PowerUsage = Record<OneTimePowerId, Record<Player, boolean>>

interface MovePlacement { r: number; c: number }
interface LaneShift    { axis: 'row' | 'column'; index: number; direction: 1 | -1 }
interface Move         { r?: number; c?: number; player?: Player; power?: OneTimePowerId; extra?: MovePlacement; shift?: LaneShift }

interface VariantConfig {
  boardSize: 3 | 4 | 5 | 6
  winLength: 3 | 4
  misere: boolean
  gravity: boolean
  wrap: boolean
  randomBlocks: number
  doubleMove: boolean
  laneShift: boolean
  allowRowColShift: boolean
  bomb: boolean
  chaosMode: boolean
}

interface GameState {
  board: Cell[][]
  current: Player
  config: VariantConfig
  moves: Move[]
  winner: Player | 'Draw' | null
  lastMove?: Move
  powers: PowerUsage
}
```

### Game Lifecycle

```typescript
createGame(config?: VariantConfig): GameState
applyMove(state: GameState, move: Move): GameState
legalMoves(state: GameState): Move[]
checkWinner(state: GameState): Player | 'Draw' | null
```

### AI

```typescript
bestMove(state: GameState, forPlayer: Player, opts?: { depth?: number; maxMillis?: number }): Move | null
evaluate(state: GameState, forPlayer: Player): number
```

### Configuration

```typescript
defaultConfig(): VariantConfig
validateConfig(config: VariantConfig): { ok: true } | { ok: false; reason: string }
```

### Power-Up Helpers

```typescript
canUseDoubleMove(state: GameState): boolean
isDoubleMoveLegal(state: GameState, move: Move): boolean
isDoubleMoveFirstPlacementLegal(state: GameState, move: Move): boolean
canUseBomb(state: GameState): boolean
isBombLegal(state: GameState, move: Move): boolean
canUseLaneShift(state: GameState): boolean
isLaneShiftLegal(state: GameState, move: Move): boolean
```

## Variant Configuration Defaults

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `boardSize` | `3 \| 4 \| 5 \| 6` | `3` | Board dimensions (N×N) |
| `winLength` | `3 \| 4` | `3` | Consecutive marks to win |
| `misere` | `boolean` | `false` | Completing a line **loses** |
| `gravity` | `boolean` | `false` | Pieces fall to column bottom |
| `wrap` | `boolean` | `false` | Toroidal board (edges wrap) |
| `randomBlocks` | `number` | `0` | Randomly blocked cells at start |
| `doubleMove` | `boolean` | `false` | One-time double-move power-up |
| `laneShift` | `boolean` | `false` | Lane-shift power-up |
| `allowRowColShift` | `boolean` | `false` | Allow shifting rows/columns |
| `bomb` | `boolean` | `false` | Bomb power-up (destroys a cell) |
| `chaosMode` | `boolean` | `false` | Chaos mode |

## AI Engine Details

The minimax module (`src/ai/minimax.ts`) implements:

- **Alpha-beta pruning** with negamax formulation
- **Transposition table** for caching evaluated positions
- **Iterative deepening** from depth 1 to target depth
- **Move ordering** based on heuristic evaluation for better pruning
- **Timeout support** via `maxMillis` option

Default search depths: **10** for 3×3 boards, **5** for larger boards.

The heuristic evaluator (`src/ai/heuristics.ts`) scores positions by:

- Window pattern analysis (own marks, opponent marks, open ends)
- Large win score: 10,000; near-win bonus: 900
- Center control bonus (scales with board size)
- Misère mode support (negated scoring)
- Wrap mode boundary handling

## Usage Example

```typescript
import { createGame, applyMove, bestMove, checkWinner } from '@ttt/engine';

const state = createGame({ boardSize: 3, winLength: 3, gravity: false });
const mv = bestMove(state, 'X', { depth: 6 });
if (mv) {
  const next = applyMove(state, mv);
  const result = checkWinner(next); // 'X' | 'O' | 'Draw' | null
}
```

## Editing Guidance

- Make rule/logic changes inside `src/` and keep exported API behaviour stable.
- If you change exported shapes, update `types.ts` and rebuild — verify `dist/index.d.ts`.
- No test suite exists; validate by running `npm run build:engine` and exercising from `apps/mobile` or `services/ai`.
- Keep changes small and well-scoped; minimax depth grows quickly with board size.

## See Also

- Root `README.md` — architecture and setup overview
- `apps/README.md` — mobile app integration
- `services/ai/README.md` — AI service that consumes this engine
