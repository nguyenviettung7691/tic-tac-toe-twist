import { createGame, bestMove } from '@ttt/engine';
import type { GameState, VariantConfig, Player } from '@ttt/engine';

// Re-export engine helpers so UI code can import via '~/services/engine'.
export { createGame, bestMove };
export type { GameState, VariantConfig, Player };

export function createGameState(config: VariantConfig) {
  return createGame(config);
}

export function findBestMove(state: GameState, player: Player) {
  return bestMove(state, player);
}
