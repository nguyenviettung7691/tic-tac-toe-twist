import type { GameState, Move, Player } from '../types.js';
import { applyMove, checkWinner, legalMoves } from '../board.js';
import { evaluate } from './heuristics.js';

export interface SearchOpts {
  depth?: number;
}

export function bestMove(state: GameState, forPlayer: Player, opts: SearchOpts = {}): Move | null {
  const depth = opts.depth ?? (state.board.length === 3 ? 8 : 4);
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const m of legalMoves(state)) {
    const s1 = applyMove(state, m);
    const sc = -negamax(s1, forPlayer, depth - 1, -Infinity, Infinity);
    if (sc > bestScore) {
      bestScore = sc;
      best = m;
    }
  }
  return best;
}

function negamax(state: GameState, forPlayer: Player, depth: number, alpha: number, beta: number): number {
  const winner = checkWinner(state);
  if (winner) {
    if (winner === 'Draw') return 0;
    return winner === forPlayer ? 10000 : -10000;
  }
  if (depth <= 0) {
    return evaluate(state, forPlayer);
  }
  let best = -Infinity;
  for (const m of legalMoves(state)) {
    const s1 = applyMove(state, m);
    const val = -negamax(s1, forPlayer, depth - 1, -beta, -alpha);
    if (val > best) best = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break; // prune
  }
  return best;
}

