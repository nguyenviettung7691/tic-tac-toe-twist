import type { VariantConfig } from './types.js';

export const defaultConfig = (): VariantConfig => ({
  boardSize: 3,
  winLength: 3,
  misere: false,
  gravity: false,
  wrap: false,
  randomBlocks: 0,
  doubleMove: false,
  allowRowColShift: false,
  bomb: false,
  chaosMode: false,
});

export function validateConfig(config: VariantConfig): { ok: true } | { ok: false; reason: string } {
  if (config.winLength > config.boardSize) {
    return { ok: false, reason: 'winLength cannot exceed boardSize' };
  }
  return { ok: true };
}

