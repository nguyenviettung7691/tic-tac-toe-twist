import {
  applyMove,
  bestMove,
  checkWinner,
  createGame,
  isDoubleMoveLegal,
  isBombLegal,
  isLaneShiftLegal,
  legalMoves,
} from '@ttt/engine';
import type { Difficulty, GameState, Move, VariantConfig } from '@ttt/engine';
import { getApiBaseUrl, requestMove } from '~/services/api';

export type { GameState, Move } from '@ttt/engine';

export interface GameSetup {
  boardSize: 3 | 4 | 5 | 6;
  winLength: 3 | 4;
  gravity: boolean;
  wrap: boolean;
  randomBlocks: boolean;
  misere: boolean;
  laneShiftPower: boolean;
  doubleMovePower: boolean;
  bombPower: boolean;
  chaosMode: boolean;
  difficulty: Difficulty;
  vsAi: boolean;
}

export interface GameSnapshot {
  game: GameState | null;
  settings: GameSetup;
  busy: boolean;
  lastResult: GameState | null;
}

type Listener = (snapshot: GameSnapshot) => void;

const defaultSetup: GameSetup = {
  boardSize: 3,
  winLength: 3,
  gravity: false,
  wrap: false,
  randomBlocks: false,
  misere: false,
  laneShiftPower: false,
  doubleMovePower: false,
  bombPower: false,
  chaosMode: false,
  difficulty: 'balanced',
  vsAi: true,
};

let currentSetup: GameSetup = { ...defaultSetup };
let currentGame: GameState | null = null;
let lastFinishedGame: GameState | null = null;
let busy = false;
let aiThinkTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<Listener>();
const ALLOWED_BOARD_SIZES: GameSetup['boardSize'][] = [3, 4, 5, 6];


function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const details: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };

    if (typeof error.stack === 'string') {
      details.stack = error.stack;
    }

    const errorWithExtras = error as Error & Record<string, unknown>;
    for (const key of ['code', 'status', 'cause', 'errno'] as const) {
      const value = errorWithExtras[key];
      if (value !== undefined) {
        details[key] = value;
      }
    }

    return details;
  }

  if (!error || typeof error !== 'object') {
    return { message: String(error) };
  }

  const plain: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(error as Record<string, unknown>)) {
    plain[key] = value;
  }

  const constructorName = (error as { constructor?: { name?: string } }).constructor?.name;
  if (constructorName && constructorName !== 'Object') {
    plain.type = constructorName;
  }

  if (Object.keys(plain).length === 0) {
    plain.message = String(error);
  }

  return plain;
}

export function getSnapshot(): GameSnapshot {
  return {
    game: currentGame,
    settings: { ...currentSetup },
    busy,
    lastResult: lastFinishedGame,
  };
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(getSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function startNewGame(setup: GameSetup): GameState {
  if (aiThinkTimer !== null) {
    clearTimeout(aiThinkTimer);
    aiThinkTimer = null;
  }
  const normalized = normalizeSetup(setup);
  currentSetup = { ...normalized };
  busy = false;
  currentGame = withWinner(createGame(toVariantConfig(normalized)));
  lastFinishedGame = null;
  notifyListeners();
  return currentGame;
}

export function rematch(): GameState | null {
  return startNewGame(currentSetup);
}

export function playerMove(move: Move): GameState | null {
  if (!currentGame || currentGame.winner || busy) return currentGame;

  if (!isMoveLegal(currentGame, move)) {
    return currentGame;
  }

  busy = true;
  notifyListeners();

  applyMoveAndUpdate(move);

  if (currentSetup.vsAi && currentGame && !currentGame.winner) {
    scheduleAiMove();
    return currentGame;
  }

  busy = false;
  notifyListeners();

  return currentGame;
}

export function getLastResult(): GameState | null {
  return lastFinishedGame;
}

export function reset(): void {
  if (aiThinkTimer !== null) {
    clearTimeout(aiThinkTimer);
    aiThinkTimer = null;
  }
  currentSetup = { ...defaultSetup };
  currentGame = null;
  lastFinishedGame = null;
  busy = false;
  notifyListeners();
}


function normalizeSetup(setup: GameSetup): GameSetup {
  const boardSize = ALLOWED_BOARD_SIZES.includes(setup.boardSize) ? setup.boardSize : defaultSetup.boardSize;
  const maxWin = boardSize === 3 ? 3 : 4;
  const winLength = Math.min(Math.max(setup.winLength, 3), maxWin) as 3 | 4;
  const misere = !!setup.misere;
  return {
    ...setup,
    boardSize,
    winLength,
    misere,
    laneShiftPower: !!setup.laneShiftPower,
    doubleMovePower: !!setup.doubleMovePower,
    bombPower: !!setup.bombPower,
    chaosMode: !!setup.chaosMode,
  };
}


function scheduleAiMove() {
  if (aiThinkTimer !== null) {
    clearTimeout(aiThinkTimer);
    aiThinkTimer = null;
  }

  aiThinkTimer = setTimeout(() => {
    aiThinkTimer = null;
    if (!currentGame || currentGame.winner) {
      busy = false;
      notifyListeners();
      return;
    }

    const pendingState = currentGame;
    const difficulty = currentSetup.difficulty;

    const run = async () => {
      try {
        console.info('[ai] Requesting Genkit move', {
          difficulty,
          current: pendingState.current,
          movesPlayed: pendingState.moves.length,
        });

        const response = await requestMove({
          state: pendingState,
          config: pendingState.config,
          difficulty,
        });

        const move = response?.move;
        console.info('[ai] Received Genkit response', {
          strategy: response?.strategy ?? 'unknown',
          reason: response?.reason,
          move,
        });

        if (!move) {
          throw new Error('AI response did not include a move.');
        }

        if (!currentGame || currentGame.winner) {
          return;
        }

        if (currentGame !== pendingState) {
          return;
        }

        const aiMove: Move = { r: move.r, c: move.c };
        if (!isMoveLegal(currentGame, aiMove)) {
          throw new Error(`AI proposed illegal move at ${aiMove.r}:${aiMove.c}.`);
        }

        applyMoveAndUpdate(aiMove);
      } catch (err) {
        const errorDetails = describeError(err);
        console.error('[ai] Genkit move request failed', {
          endpoint: `${getApiBaseUrl()}/move`,
          request: {
            current: pendingState.current,
            difficulty,
            movesPlayed: pendingState.moves.length,
          },
          error: errorDetails,
        });
        console.warn('[ai] Falling back to local solver', {
          reason: 'Genkit move request failed',
          error: errorDetails,
        });
        if (currentGame && !currentGame.winner) {
          const fallback = bestMove(currentGame, currentGame.current);
          if (fallback && isMoveLegal(currentGame, fallback)) {
            console.info('[ai] Applying local fallback move', fallback);
            applyMoveAndUpdate(fallback);
          }
        }
      } finally {
        busy = false;
        notifyListeners();
      }
    };

    void run();
  }, 16);
}

function notifyListeners() {
  const snapshot = getSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

function applyMoveAndUpdate(move: Move) {
  if (!currentGame) {
    return;
  }

  const updated = applyMove(currentGame, move);
  const winner = checkWinner(updated);
  currentGame = { ...updated, winner };
  if (winner) {
    lastFinishedGame = currentGame;
  }
  notifyListeners();
}

function isMoveLegal(state: GameState, move: Move): boolean {
  if (move.power === 'doubleMove') {
    if (!state.config.doubleMove) {
      return false;
    }
    return isDoubleMoveLegal(state, move);
  }
  if (move.power === 'bomb') {
    if (!state.config.bomb) {
      return false;
    }
    return isBombLegal(state, move);
  }
  if (move.power === 'laneShift') {
    if (!state.config.laneShift) {
      return false;
    }
    return isLaneShiftLegal(state, move);
  }
  if (typeof move.r !== 'number' || typeof move.c !== 'number') {
    return false;
  }
  const key = `${move.r}:${move.c}`;
  return legalMoves(state).some((m) => `${m.r}:${m.c}` === key);
}

const CHAOS_RULE_KEYS = ['gravity', 'wrap', 'misere', 'randomBlocks'] as const;
const CHAOS_POWER_KEYS = ['laneShiftPower', 'doubleMovePower', 'bombPower'] as const;

function pickRandomSubset<T>(items: readonly T[], minCount = 0): Set<T> {
  if (items.length === 0) {
    return new Set();
  }
  const min = Math.max(0, Math.min(items.length, minCount));
  const max = items.length;
  const count = Math.floor(Math.random() * (max - min + 1)) + min;
  const pool = items.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = pool[i];
    pool[i] = pool[j];
    pool[j] = swap;
  }
  return new Set(pool.slice(0, count));
}

function toVariantConfig(setup: GameSetup): VariantConfig {
  const winLength = (setup.boardSize === 3 ? 3 : setup.winLength) as 3 | 4;
  if (setup.chaosMode) {
    const rules = pickRandomSubset(CHAOS_RULE_KEYS, CHAOS_RULE_KEYS.length ? 1 : 0);
    const powers = pickRandomSubset(CHAOS_POWER_KEYS, CHAOS_POWER_KEYS.length ? 1 : 0);
    return {
      boardSize: setup.boardSize,
      winLength,
      gravity: rules.has('gravity'),
      wrap: rules.has('wrap'),
      misere: rules.has('misere'),
      randomBlocks: rules.has('randomBlocks') ? 3 : 0,
      laneShift: powers.has('laneShiftPower'),
      doubleMove: powers.has('doubleMovePower'),
      bomb: powers.has('bombPower'),
      chaosMode: true,
    };
  }
  return {
    boardSize: setup.boardSize,
    winLength,
    gravity: setup.gravity,
    wrap: setup.wrap,
    misere: setup.misere,
    randomBlocks: setup.randomBlocks ? 3 : 0,
    laneShift: setup.laneShiftPower,
    doubleMove: setup.doubleMovePower,
    bomb: setup.bombPower,
    chaosMode: false,
  };
}

function withWinner(state: GameState): GameState {
  const winner = checkWinner(state);
  return { ...state, winner };
}
