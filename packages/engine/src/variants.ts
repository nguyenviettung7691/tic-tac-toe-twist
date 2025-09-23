import type { VariantConfig } from './types.js';

export const defaultConfig = (): VariantConfig => ({
  boardSize: 3,
  winLength: 3,
  misere: false,
  notakto: false,
  gravity: false,
  wrap: false,
  randomBlocks: 0,
  doubleMove: false,
  knightConstraint: false,
  allowRowColShift: false,
  allowBomb: false,
});

export function validateConfig(config: VariantConfig): { ok: true } | { ok: false; reason: string } {
  if (config.winLength > config.boardSize) {
    return { ok: false, reason: 'winLength cannot exceed boardSize' };
  }
  if (config.notakto && config.misere) {
    return { ok: false, reason: 'Notakto conflicts with Misere' };
  }
  if (config.knightConstraint && config.boardSize < 4) {
    return { ok: false, reason: 'Knight constraint is too restrictive on < 4x4' };
  }
  return { ok: true };
}

