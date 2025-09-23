import { applyMove, bestMove, checkWinner, createGame, legalMoves } from '@ttt/engine';
import type { Difficulty, GameState, Move, VariantConfig } from '@ttt/engine';

export type { GameState, Move } from '@ttt/engine';

export interface GameSetup {
  boardSize: 3 | 4 | 5 | 6;
  winLength: 3 | 4;
  gravity: boolean;
  wrap: boolean;
  randomBlocks: boolean;
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
  difficulty: 'balanced',
  vsAi: true,
};

let currentSetup: GameSetup = { ...defaultSetup };
let currentGame: GameState | null = null;
let lastFinishedGame: GameState | null = null;
let busy = false;

const listeners = new Set<Listener>();

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
  currentSetup = { ...setup };
  busy = false;
  currentGame = withWinner(createGame(toVariantConfig(currentSetup)));
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
    const aiMove = bestMove(currentGame, currentGame.current);
    if (aiMove) {
      applyMoveAndUpdate(aiMove);
    }
  }

  busy = false;
  notifyListeners();

  return currentGame;
}

export function getLastResult(): GameState | null {
  return lastFinishedGame;
}

export function reset(): void {
  currentSetup = { ...defaultSetup };
  currentGame = null;
  lastFinishedGame = null;
  busy = false;
  notifyListeners();
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
    randomBlocks: setup.randomBlocks ? 3 : 0,
  };
}

function withWinner(state: GameState): GameState {
  const winner = checkWinner(state);
  return { ...state, winner };
}
