import type { Cell, GameState, Player } from '../types.js';

export function evaluate(state: GameState, forPlayer: Player): number {
  // Simple heuristic: count open lines of length 2 and 3 (or winLength-1) weighted.
  // Works for 3–5 sized boards; wrap/misere handled lightly.
  const n = state.board.length;
  const need = state.config.winLength;
  const wrap = !!state.config.wrap;

  function cell(r: number, c: number): Cell {
    if (wrap) {
      return state.board[(r + n) % n][(c + n) % n];
    }
    if (r < 0 || c < 0 || r >= n || c >= n) return 'B';
    return state.board[r][c];
  }

  const dirs = [
    [0, 1], [1, 0], [1, 1], [1, -1],
  ];

  let score = 0;
  const opp: Player = forPlayer === 'X' ? 'O' : 'X';

  function windowScore(sr: number, sc: number, dr: number, dc: number): number {
    let mine = 0, theirs = 0, blocks = 0;
    for (let k = 0; k < need; k++) {
      const v = cell(sr + dr * k, sc + dc * k);
      if (v === forPlayer) mine++;
      else if (v === opp) theirs++;
      else if (v === 'B') blocks++;
    }
    if (blocks > 0) return 0; // blocked window
    if (mine > 0 && theirs > 0) return 0; // contested window
    const w = (state.config.misere ? -1 : 1);
    if (mine === need) return 5000 * w;
    if (theirs === need) return -5000 * w;
    const base = mine > 0 ? mine : -theirs;
    return base * base; // non-linear preference
  }

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      for (const [dr, dc] of dirs) {
        score += windowScore(r, c, dr, dc);
      }
    }
  }
  return score;
}

