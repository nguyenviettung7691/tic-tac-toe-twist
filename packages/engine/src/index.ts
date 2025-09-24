export * from './types.js';
export { defaultConfig, validateConfig } from './variants.js';
export {
  initState as createGame,
  applyMove,
  legalMoves,
  checkWinner,
  canUseDoubleMove,
  isDoubleMoveLegal,
  isDoubleMoveFirstPlacementLegal,
  canUseLaneShift,
  isLaneShiftLegal,
} from './board.js';
export { bestMove } from './ai/minimax.js';
export { evaluate } from './ai/heuristics.js';
