import { z } from 'zod';
import type { GameState, VariantConfig, Difficulty, Move, Player } from '@ttt/engine';
import { bestMove as searchBest } from '@ttt/engine';

// Genkit Flow skeleton (provider wiring can be added later).
// This module exports a plain function so we can call it without a provider too.

export const MoveInput = z.object({
  state: z.any() as z.ZodType<GameState>,
  config: z.any() as z.ZodType<VariantConfig>,
  difficulty: z.enum(['chill', 'balanced', 'sharp']) as z.ZodType<Difficulty>,
});

export const MoveOutput = z.object({
  move: z.object({ r: z.number(), c: z.number() }),
});

export async function chooseMove(input: z.infer<typeof MoveInput>): Promise<z.infer<typeof MoveOutput>> {
  const { state, difficulty } = MoveInput.parse(input);

  // Pick search depth and style.
  let depth = 2;
  if (difficulty === 'balanced') depth = 4;
  if (difficulty === 'sharp') depth = state.board.length === 3 ? 8 : 5;

  // Baseline: algorithmic best.
  const algo = searchBest(state, state.current as Player, { depth });
  if (!algo) {
    // No legal moves
    return MoveOutput.parse({ move: { r: 0, c: 0 } });
  }

  if (difficulty === 'chill') {
    // Slight randomness from neighborhood of best.
    return MoveOutput.parse({ move: algo });
  }

  return MoveOutput.parse({ move: algo });
}

