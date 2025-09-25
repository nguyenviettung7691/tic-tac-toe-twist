
import { Observable } from '@nativescript/core';
import type { Difficulty } from '@ttt/engine';
import { getSnapshot, type GameSetup } from '~/state/game-store';

type VariantKey = 'gravity' | 'wrap' | 'randomBlocks' | 'misere';
type PowerKey = 'doubleMovePower' | 'laneShiftPower' | 'bombPower';
type BoardSegment = {
  size: 3 | 4 | 5 | 6;
  label: string;
};

const BOARD_SEGMENTS: BoardSegment[] = [
  { size: 3, label: '3×3' },
  { size: 4, label: '4×4' },
  { size: 5, label: '5×5' },
  { size: 6, label: '6×6' },
];

const DIFFICULTY_META: Array<{ key: Difficulty; title: string; caption: string }> = [
  { key: 'chill', title: '🤓 Chill', caption: 'learn & vibe' },
  { key: 'balanced', title: '🤔 Balanced', caption: 'smart, fair play' },
  { key: 'sharp', title: '👿 Sharp', caption: 'max brain burn' },
];

export interface BoardOptionVm {
  index: number;
  size: 3 | 4 | 5 | 6;
  label: string;
  selected: boolean;
}

export interface DifficultyOptionVm {
  index: number;
  key: Difficulty;
  title: string;
  caption: string;
  active: boolean;
}

export interface WinLengthOptionVm {
  value: number;
  enabled: boolean;
  selected: boolean;
  className: string;
}

export interface VariantOptionVm {
  key: VariantKey;
  title: string;
  description: string;
  icon: string;
  active: boolean;
}

export interface PowerOptionVm {
  key: PowerKey;
  title: string;
  description: string;
  icon: string;
  active: boolean;
  disabled: boolean;
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
    this.set('gravity', setup.gravity);
    this.set('wrap', setup.wrap);
    this.set('randomBlocks', setup.randomBlocks);
    this.set('misere', setup.misere);
    this.set('doubleMovePower', setup.doubleMovePower);
    this.set('laneShiftPower', setup.laneShiftPower);
    this.set('bombPower', setup.bombPower);

    this.set('winLengthOptions', [] as WinLengthOptionVm[]);
    this.set('otpOptions', [] as PowerOptionVm[]);
    this.set('opponentOptions', [
      { key: 'human', title: 'Human', icon: '🧑‍🤝‍🧑', active: false, disabled: true },
      { key: 'ai', title: 'AI', icon: '🤖', active: true },
    ]);

    this.refreshBoardOptions();
    this.refreshDifficultyOptions();
    this.refreshVariantOptions();
    this.refreshOtpOptions();
    this.applyWinLengthBounds();
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
    this.updateWinLengthOptions();
  }

  toggleVariant(key: VariantKey, next?: boolean): void {
    const current = !!this.get(key);
    const value = typeof next === 'boolean' ? next : !current;
    this.set(key, value);
    this.refreshVariantOptions();
  }

  togglePower(key: PowerKey, next?: boolean): void {
    const current = !!this.get(key);
    const value = typeof next === 'boolean' ? next : !current;
    this.set(key, value);
    this.refreshOtpOptions();
  }

  refreshBoardOptions(): void {
    const index = this.get('boardSizeIndex') ?? 0;
    const options: BoardOptionVm[] = BOARD_SEGMENTS.map((segment, idx) => ({
      index: idx,
      size: segment.size,
      label: segment.label,
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
        title: 'Wrap',
        description: 'Lines continue across opposite edges.',
        icon: '🔄',
        active: !!this.get('wrap')
      },
      {
        key: 'misere',
        title: 'Misere',
        description: 'Complete a winning line and you lose.',
        icon: '🎭',
        active: !!this.get('misere')
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

  refreshOtpOptions(): void {
    const powers: PowerOptionVm[] = [
      {
        key: 'doubleMovePower',
        title: 'Double Move',
        description: 'Place two marks on one turn.',
        icon: '⚡',
        active: !!this.get('doubleMovePower'),
        disabled: false,
      },
      {
        key: 'laneShiftPower',
        title: 'Lane Shift',
        description: 'Shift a lane by one cell cyclically.',
        icon: '🔁',
        active: !!this.get('laneShiftPower'),
        disabled: false,
      },
      {
        key: 'bombPower',
        title: 'Bomb',
        description: 'Destroy a cell and block it forever.',
        icon: '🔥',
        active: !!this.get('bombPower'),
        disabled: false,
      },
    ];
    this.set('otpOptions', powers);
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
      misere: !!this.get('misere'),
      randomBlocks: !!this.get('randomBlocks'),
      laneShiftPower: !!this.get('laneShiftPower'),
      doubleMovePower: !!this.get('doubleMovePower'),
      bombPower: !!this.get('bombPower'),
      difficulty: difficultyMeta?.key ?? 'balanced',
      vsAi: true,
    };
  }

  private getSelectedBoardSize(): 3 | 4 | 5 | 6 {
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

    const current = this.get('winLength');
    const clamped = this.clampWinLength(
      typeof current === 'number' ? current : max
    );
    if (clamped !== current) {
      this.set('winLength', clamped);
    }
    this.updateWinLengthOptions();
  }

  private updateWinLengthOptions() {
    const min = this.get('winLengthMin') ?? 3;
    const max = this.get('winLengthMax') ?? min;
    const current = this.get('winLength') ?? min;

    const options: WinLengthOptionVm[] = Array.from({ length: max }, (_, idx) => {
      const value = idx + 1;
      const enabled = value >= min;
      const selected = enabled && value === current;
      const classes = ['winlength-chip', enabled ? 'enabled' : 'disabled'];
      if (selected) {
        classes.push('selected');
      }
      return {
        value,
        enabled,
        selected,
        className: classes.join(' '),
      };
    });

    this.set('winLengthOptions', options);
  }
}
