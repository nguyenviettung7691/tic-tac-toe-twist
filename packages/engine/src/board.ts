import type {
  Cell,
  GameState,
  LaneShift,
  Move,
  MovePlacement,
  Player,
  OneTimePowerId,
  PowerUsage,
  VariantConfig,
} from './types.js';

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

function areAdjacent(a: MovePlacement, b: MovePlacement): boolean {
  const dr = Math.abs(a.r - b.r);
  const dc = Math.abs(a.c - b.c);
  return Math.max(dr, dc) <= 1;
}

function adjacentToAny(target: MovePlacement, marks: MovePlacement[]): boolean {
  for (const mark of marks) {
    if (areAdjacent(target, mark)) {
      return true;
    }
  }
  return false;
}

function collectPlayerMarks(board: Cell[][], player: Player): MovePlacement[] {
  const marks: MovePlacement[] = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === player) {
        marks.push({ r, c });
      }
    }
  }
  return marks;
}

function createInitialPowerUsage(): PowerUsage {
  return {
    doubleMove: { X: false, O: false },
    laneShift: { X: false, O: false },
  };
}

function shiftRowInPlace(board: Cell[][], rowIndex: number, direction: 1 | -1): void {
  const row = board[rowIndex].slice();
  const n = row.length;
  const next: Cell[] = Array(n);
  for (let c = 0; c < n; c++) {
    const source = (c - direction + n) % n;
    next[c] = row[source];
  }
  board[rowIndex] = next;
}

function shiftColumnInPlace(board: Cell[][], columnIndex: number, direction: 1 | -1): void {
  const n = board.length;
  const next: Cell[] = Array(n);
  for (let r = 0; r < n; r++) {
    const source = (r - direction + n) % n;
    next[r] = board[source][columnIndex];
  }
  for (let r = 0; r < n; r++) {
    board[r][columnIndex] = next[r];
  }
}

function markPowerUsed(powers: PowerUsage, power: OneTimePowerId, player: Player): PowerUsage {
  return {
    ...powers,
    [power]: {
      ...powers[power],
      [player]: true,
    },
  };
}

function simulatePlacement(
  board: Cell[][],
  target: MovePlacement,
  config: VariantConfig,
  player: Player
): { board: Cell[][]; final: MovePlacement } | null {
  const n = board.length;
  if (!inBounds(n, target.r, target.c)) {
    return null;
  }
  const cell = board[target.r][target.c];
  if (cell !== null) {
    return null;
  }
  const { gravity } = config;
  const final = gravity ? applyGravity(board, target.r, target.c) : { r: target.r, c: target.c };
  if (!inBounds(n, final.r, final.c)) {
    return null;
  }
  if (board[final.r][final.c] !== null) {
    return null;
  }
  const next = place(board, final.r, final.c, player);
  return { board: next, final };
}

function resolveDoubleMove(state: GameState, move: Move): { board: Cell[][]; placements: [MovePlacement, MovePlacement] } | null {
  if (move.power !== 'doubleMove') {
    return null;
  }
  if (!state.config.doubleMove) {
    return null;
  }
  const usage = state.powers.doubleMove;
  if (usage[state.current]) {
    return null;
  }
  const secondary = move.extra;
  if (!secondary) {
    return null;
  }
  const r = move.r;
  const c = move.c;
  if (typeof r !== 'number' || typeof c !== 'number') {
    return null;
  }
  const baseLegals = new Set(legalMoves(state).map((m) => `${m.r}:${m.c}`));
  const firstKey = `${r}:${c}`;
  const secondKey = `${secondary.r}:${secondary.c}`;
  if (!baseLegals.has(firstKey) || !baseLegals.has(secondKey)) {
    return null;
  }
  if (r === secondary.r && c === secondary.c) {
    return null;
  }

  const attempts: Array<[MovePlacement, MovePlacement]> = [
    [
      { r, c },
      { r: secondary.r, c: secondary.c },
    ],
  ];
  if (r !== secondary.r || c !== secondary.c) {
    attempts.push([
      { r: secondary.r, c: secondary.c },
      { r, c },
    ]);
  }

  const ownMarks = collectPlayerMarks(state.board, state.current);

  for (const order of attempts) {
    let board = cloneBoard(state.board);
    const finals: MovePlacement[] = [];
    let valid = true;
    const marksCheck = [...ownMarks];
    for (const target of order) {
      const result = simulatePlacement(board, target, state.config, state.current);
      if (!result) {
        valid = false;
        break;
      }
      if (adjacentToAny(result.final, marksCheck)) {
        valid = false;
        break;
      }
      board = result.board;
      finals.push(result.final);
      marksCheck.push(result.final);
    }
    if (!valid || finals.length !== 2) {
      continue;
    }
    if (areAdjacent(finals[0], finals[1])) {
      continue;
    }
    return { board, placements: [finals[0], finals[1]] };
  }

  return null;
}

export function canUseDoubleMove(state: GameState): boolean {
  if (!state.config.doubleMove) {
    return false;
  }
  return !state.powers.doubleMove[state.current];
}

export function isDoubleMoveLegal(state: GameState, move: Move): boolean {
  return resolveDoubleMove(state, move) !== null;
}

export function isDoubleMoveFirstPlacementLegal(state: GameState, move: Move): boolean {
  if (!state.config.doubleMove) {
    return false;
  }
  if (state.powers.doubleMove[state.current]) {
    return false;
  }
  if (typeof move.r !== 'number' || typeof move.c !== 'number') {
    return false;
  }
  const key = `${move.r}:${move.c}`;
  const baseLegal = legalMoves(state).some((m) => `${m.r}:${m.c}` === key);
  if (!baseLegal) {
    return false;
  }
  const result = simulatePlacement(state.board, { r: move.r, c: move.c }, state.config, state.current);
  if (!result) {
    return false;
  }
  const ownMarks = collectPlayerMarks(state.board, state.current);
  if (adjacentToAny(result.final, ownMarks)) {
    return false;
  }
  return true;
}

function resolveLaneShift(state: GameState, move: Move): Cell[][] | null {
  if (move.power !== 'laneShift') {
    return null;
  }
  if (!state.config.laneShift) {
    return null;
  }
  const usage = state.powers.laneShift;
  if (usage[state.current]) {
    return null;
  }
  const shift = move.shift;
  if (!shift) {
    return null;
  }
  const { axis, index, direction } = shift;
  if (direction !== 1 && direction !== -1) {
    return null;
  }
  if (axis !== 'row' && axis !== 'column') {
    return null;
  }
  const n = state.board.length;
  if (index < 0 || index >= n) {
    return null;
  }
  const board = cloneBoard(state.board);
  if (axis === 'row') {
    shiftRowInPlace(board, index, direction);
  } else {
    shiftColumnInPlace(board, index, direction);
  }
  return board;
}

export function canUseLaneShift(state: GameState): boolean {
  if (!state.config.laneShift) {
    return false;
  }
  return !state.powers.laneShift[state.current];
}

export function isLaneShiftLegal(state: GameState, move: Move): boolean {
  return resolveLaneShift(state, move) !== null;
}

export function nextPlayer(p: Player): Player {
  return p === 'X' ? 'O' : 'X';
}

export function initState(config: VariantConfig): GameState {
  const board = createBoard(config.boardSize);
  // Random blocks
  const maxBlocks = Math.min(config.randomBlocks ?? 0, Math.floor((config.boardSize ** 2) / 4));
  const blocks = maxBlocks > 1 ? Math.floor(Math.random() * maxBlocks) + 1 : maxBlocks;
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
  return {
    board,
    current: 'X',
    config,
    moves: [],
    winner: null,
    powers: createInitialPowerUsage(),
  };
}

export function legalMoves(state: GameState): Move[] {
  // For now, support placements on empty cells only. Powers/constraints are TODO.
  return emptyCells(state.board);
}

export function applyMove(state: GameState, move: Move): GameState {
  if (move.power === 'doubleMove') {
    const resolved = resolveDoubleMove(state, move);
    if (!resolved) {
      throw new Error('Illegal move');
    }
    const [first, second] = resolved.placements;
    const player = state.current;
    const storedMove: Move = {
      r: second.r,
      c: second.c,
      extra: { r: first.r, c: first.c },
      player,
      power: 'doubleMove',
    };
    return {
      ...state,
      board: resolved.board,
      moves: [...state.moves, storedMove],
      current: nextPlayer(player),
      lastMove: storedMove,
      powers: markPowerUsed(state.powers, 'doubleMove', player),
    };
  }

  if (move.power === 'laneShift') {
    const board = resolveLaneShift(state, move);
    if (!board || !move.shift) {
      throw new Error('Illegal move');
    }
    const player = state.current;
    const storedMove: Move = {
      power: 'laneShift',
      shift: { ...move.shift },
      player,
    };
    return {
      ...state,
      board,
      moves: [...state.moves, storedMove],
      current: nextPlayer(player),
      lastMove: storedMove,
      powers: markPowerUsed(state.powers, 'laneShift', player),
    };
  }

  const { r, c } = move;
  if (typeof r !== 'number' || typeof c !== 'number') {
    throw new Error('Illegal move');
  }
  const n = state.board.length;
  if (!inBounds(n, r, c) || state.board[r][c] !== null) throw new Error('Illegal move');
  const { gravity } = state.config;
  const final = gravity ? applyGravity(state.board, r, c) : { r, c };
  if (state.board[final.r][final.c] !== null) {
    throw new Error('Illegal move');
  }
  const nb = place(state.board, final.r, final.c, state.current);
  const player = state.current;
  const storedMove: Move = { r: final.r, c: final.c, player };
  return {
    ...state,
    board: nb,
    moves: [...state.moves, storedMove],
    current: nextPlayer(player),
    lastMove: storedMove,
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

