import type { GameState, Move, Player } from '../types.js';
import { applyMove, checkWinner, legalMoves } from '../board.js';
import { evaluate } from './heuristics.js';

export interface SearchOpts {
  depth?: number;
  maxMillis?: number;
}

interface SearchResult {
  score: number;
  move: Move | null;
  timedOut: boolean;
}

interface NegamaxResult {
  score: number;
  timedOut: boolean;
}

const enum TTFlag {
  EXACT = 0,
  LOWER = 1,
  UPPER = 2,
}

interface TTEntry {
  depth: number;
  value: number;
  flag: TTFlag;
}

export function bestMove(state: GameState, forPlayer: Player, opts: SearchOpts = {}): Move | null {
  const targetDepth = opts.depth ?? (state.board.length === 3 ? 10 : 5);
  const deadline = opts.maxMillis ? Date.now() + opts.maxMillis : null;
  const transposition = new Map<string, TTEntry>();
  const moves = orderMoves(state, legalMoves(state), forPlayer);
  if (moves.length === 0) {
    return null;
  }

  let best: Move | null = moves[0] ?? null;
  let bestScore = -Infinity;
  let timedOut = false;

  for (let depth = 1; depth <= targetDepth; depth++) {
    const result = searchRoot(state, forPlayer, depth, moves, transposition, deadline);
    if (result.timedOut) {
      timedOut = true;
      break;
    }
    if (result.move) {
      best = result.move;
      bestScore = result.score;
    }
  }

  // If we timed out before completing the first depth, just return the first legal move.
  if (!best && timedOut) {
    return moves[0] ?? null;
  }
  return best;
}

function searchRoot(
  state: GameState,
  forPlayer: Player,
  depth: number,
  orderedMoves: Move[],
  transposition: Map<string, TTEntry>,
  deadline: number | null
): SearchResult {
  let alpha = -Infinity;
  const beta = Infinity;
  let bestScore = -Infinity;
  let bestMove: Move | null = null;

  const key = hashState(state);

  for (const move of orderedMoves) {
    const next = applyMove(state, move);
    const result = negamax(next, forPlayer, depth - 1, -beta, -alpha, transposition, deadline);
    if (result.timedOut) {
      return { score: bestScore, move: bestMove, timedOut: true };
    }
    const score = -result.score;
    if (score > bestScore || !bestMove) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) {
      alpha = score;
    }
  }

  if (bestMove) {
    transposition.set(key, { depth, value: bestScore, flag: TTFlag.EXACT });
  }

  return { score: bestScore, move: bestMove, timedOut: false };
}

function negamax(
  state: GameState,
  forPlayer: Player,
  depth: number,
  alpha: number,
  beta: number,
  transposition: Map<string, TTEntry>,
  deadline: number | null
): NegamaxResult {
  if (deadline && Date.now() >= deadline) {
    return { score: 0, timedOut: true };
  }

  const winner = checkWinner(state);
  if (winner) {
    if (winner === 'Draw') {
      return { score: 0, timedOut: false };
    }
    return { score: winner === forPlayer ? 10000 : -10000, timedOut: false };
  }

  if (depth <= 0) {
    return { score: evaluate(state, forPlayer), timedOut: false };
  }

  const key = hashState(state);
  const entry = transposition.get(key);
  if (entry && entry.depth >= depth) {
    if (entry.flag === TTFlag.EXACT) {
      return { score: entry.value, timedOut: false };
    }
    if (entry.flag === TTFlag.LOWER && entry.value > alpha) {
      alpha = entry.value;
    } else if (entry.flag === TTFlag.UPPER && entry.value < beta) {
      beta = entry.value;
    }
    if (alpha >= beta) {
      return { score: entry.value, timedOut: false };
    }
  }

  const alphaOrig = alpha;
  const betaOrig = beta;

  let best = -Infinity;
  const moves = orderMoves(state, legalMoves(state), forPlayer);
  if (moves.length === 0) {
    return { score: evaluate(state, forPlayer), timedOut: false };
  }

  for (const move of moves) {
    const next = applyMove(state, move);
    const child = negamax(next, forPlayer, depth - 1, -beta, -alpha, transposition, deadline);
    if (child.timedOut) {
      return child;
    }
    const score = -child.score;
    if (score > best) {
      best = score;
    }
    if (score > alpha) {
      alpha = score;
    }
    if (alpha >= beta) {
      break;
    }
  }

  let flag = TTFlag.EXACT;
  if (best <= alphaOrig) {
    flag = TTFlag.UPPER;
  } else if (best >= betaOrig) {
    flag = TTFlag.LOWER;
  }
  transposition.set(key, { depth, value: best, flag });

  return { score: best, timedOut: false };
}

function orderMoves(state: GameState, moves: Move[], forPlayer: Player): Move[] {
  if (moves.length <= 1) {
    return moves.slice();
  }
  const scored = moves.map((move) => {
    const next = applyMove(state, move);
    const winner = checkWinner(next);
    let score = 0;
    if (winner) {
      if (winner === forPlayer) {
        score = Number.POSITIVE_INFINITY;
      } else if (winner === 'Draw') {
        score = 0;
      } else {
        score = Number.NEGATIVE_INFINITY;
      }
    } else {
      score = evaluate(next, forPlayer);
    }
    return { move, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.move);
}

function hashState(state: GameState): string {
  let boardKey = '';
  for (let r = 0; r < state.board.length; r++) {
    const row = state.board[r];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      boardKey += cell === null ? '.' : cell === 'B' ? 'B' : cell === 'F' ? 'F' : cell;
    }
    boardKey += '/';
  }
  boardKey += `|${state.current}`;
  boardKey += `|${state.config.winLength}`;
  boardKey += state.config.wrap ? 'w' : '-';
  boardKey += state.config.gravity ? 'g' : '-';
  boardKey += state.config.misere ? 'm' : '-';
  boardKey += state.config.doubleMove ? 'd' : '-';
  boardKey += state.config.laneShift ? 'l' : '-';
  boardKey += state.config.bomb ? 'b' : '-';
  return boardKey;
}
