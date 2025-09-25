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

    try {
      const aiMove = bestMove(currentGame, currentGame.current);
      if (aiMove) {
        applyMoveAndUpdate(aiMove);
      }
    } finally {
      busy = false;
      notifyListeners();
    }
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

function toVariantConfig(setup: GameSetup): VariantConfig {
  const winLength = (setup.boardSize === 3 ? 3 : setup.winLength) as 3 | 4;
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
  };
}

function withWinner(state: GameState): GameState {
  const winner = checkWinner(state);
  return { ...state, winner };
}
