export type Player = 'X' | 'O';
export type Cell = Player | null | 'B' | 'F'; // 'B' for blocked, 'F' for bombed

export type OneTimePowerId = 'doubleMove' | 'laneShift' | 'bomb';

export interface LaneShift {
  axis: 'row' | 'column';
  index: number;
  direction: 1 | -1;
}

export interface MovePlacement {
  r: number;
  c: number;
}

export interface Move {
  r?: number;
  c?: number;
  player?: Player;
  power?: OneTimePowerId;
  extra?: MovePlacement;
  shift?: LaneShift;
  // Future: power actions, shifts, bombs, etc.
}

export interface VariantConfig {
  boardSize: 3 | 4 | 5 | 6;
  winLength: 3 | 4;
  misere?: boolean;
  gravity?: boolean;
  wrap?: boolean;
  randomBlocks?: number; // 0..N (random 1..N blocks when >0)
  doubleMove?: boolean;
  laneShift?: boolean;
  allowRowColShift?: boolean;
  bomb?: boolean;
}

export type PowerUsage = Record<OneTimePowerId, Record<Player, boolean>>;

export interface GameState {
  board: Cell[][];
  current: Player;
  config: VariantConfig;
  moves: Move[];
  winner: Player | 'Draw' | null;
  lastMove?: Move;
  powers: PowerUsage;
}

export type Difficulty = 'chill' | 'balanced' | 'sharp';

