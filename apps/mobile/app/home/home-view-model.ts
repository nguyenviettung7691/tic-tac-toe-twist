
import { Observable } from '@nativescript/core';
import type { Difficulty } from '@ttt/engine';

import { getSnapshot, type GameSetup } from '~/state/game-store';

type VariantKey = 'gravity' | 'wrap' | 'randomBlocks';
type BoardSegment = {
  size: 3 | 4 | 5;
  label: string;
  icon: string;
};

const BOARD_SEGMENTS: BoardSegment[] = [
  { size: 3, label: '3×3', icon: '⊞' },
  { size: 4, label: '4×4', icon: '▦' },
  { size: 5, label: '5×5', icon: '▩' },
];

const DIFFICULTY_META: Array<{ key: Difficulty; title: string; caption: string }> = [
  { key: 'chill', title: '🤓 Chill', caption: 'learn & vibe' },
  { key: 'balanced', title: '🤔 Balanced', caption: 'smart, fair play' },
  { key: 'sharp', title: '👿 Sharp', caption: 'max brain burn' },
];

export interface BoardOptionVm {
  index: number;
  size: 3 | 4 | 5;
  label: string;
  icon: string;
  selected: boolean;
}

export interface DifficultyOptionVm {
  index: number;
  key: Difficulty;
  title: string;
  caption: string;
  active: boolean;
}

export interface VariantOptionVm {
  key: VariantKey;
  title: string;
  description: string;
  icon: string;
  active: boolean;
}

export class HomeViewModel extends Observable {
  constructor() {
    super();

    const snapshot = getSnapshot();
    const setup = snapshot.settings;

    const initialBoardIndex = Math.max(
      BOARD_SEGMENTS.findIndex((segment) => segment.size === setup.boardSize),
      0
    );
    const initialDifficultyIndex = Math.max(
      DIFFICULTY_META.findIndex((d) => d.key === setup.difficulty),
      0
    );

    this.set('boardSizeIndex', initialBoardIndex);
    this.set('difficultyIndex', initialDifficultyIndex);
    this.set('winLength', setup.winLength);
    this.set('winLengthIndex', 0);
    this.set('gravity', setup.gravity);
    this.set('wrap', setup.wrap);
    this.set('randomBlocks', setup.randomBlocks);

    this.refreshBoardOptions();
    this.refreshDifficultyOptions();
    this.refreshVariantOptions();
    this.applyWinLengthBounds();
    this.updateWinLengthLabel(this.get('winLength'));
  }

  selectBoardSize(index: number): void {
    this.set('boardSizeIndex', index);
    this.refreshBoardOptions();
    this.applyWinLengthBounds();
    const boardSize = this.getSelectedBoardSize();
    const current = this.clampWinLength(this.get('winLength') ?? boardSize);
    this.setWinLength(current);
  }

  selectDifficulty(index: number): void {
    this.set('difficultyIndex', index);
    this.refreshDifficultyOptions();
  }

  setWinLength(value: number): void {
    const clamped = this.clampWinLength(value);
    this.set('winLength', clamped);
    this.updateWinLengthLabel(clamped);
  }

  toggleVariant(key: VariantKey, next?: boolean): void {
    const current = !!this.get(key);
    const value = typeof next === 'boolean' ? next : !current;
    this.set(key, value);
    this.refreshVariantOptions();
  }

  refreshBoardOptions(): void {
    const index = this.get('boardSizeIndex') ?? 0;
    const options: BoardOptionVm[] = BOARD_SEGMENTS.map((segment, idx) => ({
      index: idx,
      size: segment.size,
      label: segment.label,
      icon: segment.icon,
      selected: idx === index,
    }));
    this.set('boardOptions', options);
  }

  refreshDifficultyOptions(): void {
    const selected = this.get('difficultyIndex') ?? 0;
    const options: DifficultyOptionVm[] = DIFFICULTY_META.map((meta, index) => ({
      index,
      key: meta.key,
      title: meta.title,
      caption: meta.caption,
      active: index === selected,
    }));
    this.set('difficultyOptions', options);
  }

  refreshVariantOptions(): void {
    const variants: VariantOptionVm[] = [
      {
        key: 'gravity',
        title: 'Gravity',
        description: 'Marks fall to the lowest empty cell.',
        icon: '⬇️',
        active: !!this.get('gravity')
      },
      {
        key: 'wrap',
        title: 'Wrap edges',
        description: 'Lines continue across opposite edges.',
        icon: '🔄',
        active: !!this.get('wrap')
      },
      {
        key: 'randomBlocks',
        title: 'Random blocks',
        description: 'Random blocked cells at start.',
        icon: '🧱',
        active: !!this.get('randomBlocks')
      },
    ];
    this.set('variantOptions', variants);
  }

  getSetup(): GameSetup {
    const boardSize = this.getSelectedBoardSize();
    const winLength = this.clampWinLength(this.get('winLength') ?? boardSize) as 3 | 4;
    const difficultyMeta = DIFFICULTY_META[this.get('difficultyIndex') ?? 0];

    return {
      boardSize,
      winLength,
      gravity: !!this.get('gravity'),
      wrap: !!this.get('wrap'),
      randomBlocks: !!this.get('randomBlocks'),
      difficulty: difficultyMeta?.key ?? 'balanced',
      vsAi: true,
    };
  }

  private getSelectedBoardSize(): 3 | 4 | 5 {
    const index = this.get('boardSizeIndex') ?? 0;
    return BOARD_SEGMENTS[index]?.size ?? 3;
  }

  private clampWinLength(value: number): 3 | 4 {
    const boardSize = this.getSelectedBoardSize();
    const max = Math.min(boardSize, 4);
    const clamped = Math.max(3, Math.min(max, Math.round(value)));
    return clamped === 4 ? 4 : 3;
  }

  private applyWinLengthBounds() {
    const boardSize = this.getSelectedBoardSize();
    const min = 3;
    const max = Math.min(boardSize, 4);
    this.set('winLengthMin', min);
    this.set('winLengthMax', max);
    this.set('winLengthArray', [...Array(max - min + 1).keys()].map(i => i + min));
    this.set('winLengthIndex', 0);

    const current = this.get('winLength');
    const clamped = this.clampWinLength(
      typeof current === 'number' ? current : max
    );
    if (clamped !== current) {
      this.set('winLength', clamped);
      this.updateWinLengthLabel(clamped);
    }
  }

  private updateWinLengthLabel(value: number) {
    this.set('winLengthLabel', `${"❌".repeat(value)}`);
  }
}
