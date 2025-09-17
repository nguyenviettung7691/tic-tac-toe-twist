export type Player = 'X' | 'O';
export type Cell = Player | null | 'B'; // 'B' for blocked

export interface Move {
  r: number;
  c: number;
  // Future: power actions, shifts, bombs, etc.
}

export interface VariantConfig {
  boardSize: 3 | 4 | 5;
  winLength: 3 | 4;
  misere?: boolean;
  notakto?: boolean;
  gravity?: boolean;
  wrap?: boolean;
  randomBlocks?: number; // 0..3
  doubleMove?: boolean;
  knightConstraint?: boolean;
  allowRowColShift?: boolean;
  allowBomb?: boolean;
}

export interface GameState {
  board: Cell[][];
  current: Player;
  config: VariantConfig;
  moves: Move[];
  winner: Player | 'Draw' | null;
  lastMove?: Move;
}

export type Difficulty = 'chill' | 'balanced' | 'sharp' | 'creative';

