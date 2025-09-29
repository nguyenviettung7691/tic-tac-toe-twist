import type { Cell, GameState, Player } from '../types.js';

const LARGE_WIN_SCORE = 10000;
const NEAR_WIN_BONUS = 900;

export function evaluate(state: GameState, forPlayer: Player): number {
  const n = state.board.length;
  const need = state.config.winLength;
  const wrap = !!state.config.wrap;
  const misereFactor = state.config.misere ? -1 : 1;

  function cell(r: number, c: number): Cell {
    if (wrap) {
      const rr = (r + n) % n;
      const cc = (c + n) % n;
      return state.board[rr][cc];
    }
    if (r < 0 || c < 0 || r >= n || c >= n) return 'B';
    return state.board[r][c];
  }

  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ] as const;

  const opponent: Player = forPlayer === 'X' ? 'O' : 'X';

  let score = 0;

  const center = (n - 1) / 2;
  const centerScale = n <= 3 ? 6 : 8;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const val = state.board[r][c];
      if (val === forPlayer || val === opponent) {
        const dist = Math.abs(r - center) + Math.abs(c - center);
        const weight = Math.max(0, centerScale - dist * 2);
        if (val === forPlayer) {
          score += weight;
        } else {
          score -= weight;
        }
      }
    }
  }

  function isOpenCell(v: Cell): boolean {
    return v === null;
  }

  function windowValue(sr: number, sc: number, dr: number, dc: number): number {
    let mine = 0;
    let theirs = 0;
    let empties = 0;
    let blocked = false;

    for (let k = 0; k < need; k++) {
      const v = cell(sr + dr * k, sc + dc * k);
      if (v === forPlayer) mine++;
      else if (v === opponent) theirs++;
      else if (v === null) empties++;
      else {
        blocked = true;
        break;
      }
    }

    if (blocked) {
      return 0;
    }

    if (mine > 0 && theirs > 0) {
      return 0;
    }

    const before = cell(sr - dr, sc - dc);
    const after = cell(sr + dr * need, sc + dc * need);
    const openEnds = (isOpenCell(before) ? 1 : 0) + (isOpenCell(after) ? 1 : 0);

    if (mine === need) {
      return LARGE_WIN_SCORE * misereFactor;
    }
    if (theirs === need) {
      return -LARGE_WIN_SCORE * misereFactor;
    }

    if (mine > 0) {
      let base = Math.pow(4, mine);
      if (empties === 1) {
        base += NEAR_WIN_BONUS;
      }
      base += openEnds * 60;
      return base * misereFactor;
    }

    if (theirs > 0) {
      let base = Math.pow(4, theirs);
      if (empties === 1) {
        base += NEAR_WIN_BONUS;
      }
      base += openEnds * 60;
      return -base * misereFactor;
    }

    return 0;
  }

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      for (const [dr, dc] of dirs) {
        score += windowValue(r, c, dr, dc);
      }
    }
  }

  return score;
}
