import type { Cell, GameState, Move, Player, VariantConfig } from './types.js';

export function createBoard(n: number): Cell[][] {
  return Array.from({ length: n }, () => Array<Cell>(n).fill(null));
}

export function cloneBoard(b: Cell[][]): Cell[][] {
  return b.map((row) => row.slice());
}

export function place(b: Cell[][], r: number, c: number, p: Player): Cell[][] {
  const nb = cloneBoard(b);
  nb[r][c] = p;
  return nb;
}

export function inBounds(n: number, r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < n && c < n;
}

export function applyGravity(board: Cell[][], r: number, c: number): { r: number; c: number } {
  const n = board.length;
  let rr = r;
  while (rr + 1 < n && board[rr + 1][c] === null) rr++;
  return { r: rr, c };
}

export function emptyCells(board: Cell[][]): Move[] {
  const n = board.length;
  const out: Move[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (board[r][c] === null) out.push({ r, c });
    }
  }
  return out;
}

export function nextPlayer(p: Player): Player {
  return p === 'X' ? 'O' : 'X';
}

export function initState(config: VariantConfig): GameState {
  const board = createBoard(config.boardSize);
  // Random blocks
  const blocks = Math.min(config.randomBlocks ?? 0, Math.floor((config.boardSize ** 2) / 4));
  if (blocks > 0) {
    let placed = 0;
    while (placed < blocks) {
      const r = Math.floor(Math.random() * config.boardSize);
      const c = Math.floor(Math.random() * config.boardSize);
      if (board[r][c] === null) {
        board[r][c] = 'B';
        placed++;
      }
    }
  }
  return { board, current: 'X', config, moves: [], winner: null };
}

export function legalMoves(state: GameState): Move[] {
  // For now, support placements on empty cells only. Powers/constraints are TODO.
  const base = emptyCells(state.board).filter((m) => state.board[m.r][m.c] === null);
  if (!state.config.knightConstraint || !state.lastMove) return base;
  // Knight constraint relative to opponent's last move
  const { r: lr, c: lc } = state.lastMove;
  const deltas = [
    [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [1, -2], [-1, 2], [-1, -2],
  ];
  const set = new Set(base.map((m) => `${m.r}:${m.c}`));
  const allowed = new Set<string>();
  for (const [dr, dc] of deltas) {
    const r = lr + dr, c = lc + dc;
    if (inBounds(state.board.length, r, c) && set.has(`${r}:${c}`)) allowed.add(`${r}:${c}`);
  }
  return [...allowed].map((s) => {
    const [r, c] = s.split(':').map((x) => parseInt(x, 10));
    return { r, c };
  });
}

export function applyMove(state: GameState, move: Move): GameState {
  const { r, c } = move;
  const n = state.board.length;
  if (!inBounds(n, r, c) || state.board[r][c] !== null) throw new Error('Illegal move');
  const { gravity } = state.config;
  const final = gravity ? applyGravity(state.board, r, c) : { r, c };
  const nb = place(state.board, final.r, final.c, state.current);
  return {
    ...state,
    board: nb,
    moves: [...state.moves, final],
    current: nextPlayer(state.current),
    lastMove: final,
  };
}

export function checkWinner(state: GameState): Player | 'Draw' | null {
  const n = state.board.length;
  const need = state.config.winLength;
  const wrap = !!state.config.wrap;

  const lines: [number, number][] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) lines.push([r, c]);

  function cell(r: number, c: number) {
    if (wrap) {
      const rr = (r + n) % n;
      const cc = (c + n) % n;
      return state.board[rr][cc];
    }
    if (!inBounds(n, r, c)) return 'B';
    return state.board[r][c];
  }

  const dirs = [
    [0, 1],  // horiz
    [1, 0],  // vert
    [1, 1],  // diag down-right
    [1, -1], // diag down-left
  ];

  for (const [sr, sc] of lines) {
    for (const [dr, dc] of dirs) {
      let x = 0, o = 0;
      for (let k = 0; k < need; k++) {
        const v = cell(sr + dr * k, sc + dc * k);
        if (v === 'X') x++;
        else if (v === 'O') o++;
        else { x = o = 0; break; }
      }
      if (x === need) return state.config.misere ? 'O' : 'X';
      if (o === need) return state.config.misere ? 'X' : 'O';
    }
  }

  // Draw if no empties
  if (emptyCells(state.board).length === 0) return 'Draw';
  return null;
}

