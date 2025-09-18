import { Frame, NavigatedData, Observable, Page } from '@nativescript/core';
import type { GestureEventData } from '@nativescript/core';
import { legalMoves } from '@ttt/engine';

import type { GameState } from '~/state/game-store';
import { getSnapshot, playerMove, subscribe, type GameSnapshot } from '~/state/game-store';

interface BoardCellVM {
  r: number;
  c: number;
  text: string;
  cssClass: string;
  interactive: boolean;
}

interface BoardRowVM {
  cells: BoardCellVM[];
}

let viewModel: Observable | null = null;
let unsubscribe: (() => void) | null = null;
let pendingResultNavigation = false;

export function onNavigatingTo(args: NavigatedData) {
  const page = args.object as Page;
  viewModel = viewModel ?? createViewModel();
  page.bindingContext = viewModel;

  unsubscribe?.();
  unsubscribe = subscribe((snapshot) => updateViewModel(viewModel!, snapshot, page));

  const snapshot = getSnapshot();
  if (!snapshot.game) {
    viewModel.set('statusText', 'Head back to the home screen to start a new match.');
  }
}

export function onNavigatingFrom() {
  unsubscribe?.();
  unsubscribe = null;
  pendingResultNavigation = false;
}

export function onCellTap(args: GestureEventData) {
  const cell = (args.object as any).bindingContext as BoardCellVM | undefined;
  if (!cell?.interactive) {
    return;
  }
  playerMove({ r: cell.r, c: cell.c });
}

export function onBack() {
  const frame = Frame.topmost();
  if (frame.canGoBack()) {
    frame.goBack();
  } else {
    frame.navigate('home/home-page');
  }
}

function createViewModel() {
  const vm = new Observable();
  vm.set('statusText', 'Preparing game...');
  vm.set('variantSummary', '');
  vm.set('difficultyLabel', '');
  vm.set('boardRows', [] as BoardRowVM[]);
  vm.set('boardClass', 'board board-3');
  vm.set('busy', false);
  return vm;
}
function updateViewModel(vm: Observable, snapshot: GameSnapshot, page: Page) {
  const { game, busy, settings } = snapshot;
  vm.set('busy', busy);

  if (!game) {
    vm.set('boardRows', []);
    vm.set('variantSummary', '');
    vm.set('difficultyLabel', '');
    vm.set('statusText', 'Head back to the home screen to start a new match.');
    vm.set('hintText', '');
    return;
  }

  vm.set('boardClass', `board board-${game.board.length}`);
  vm.set('variantSummary', formatVariantSummary(game));
  vm.set('difficultyLabel', formatDifficulty(settings.difficulty));
  vm.set('statusText', buildStatusText(game, busy));
  vm.set('hintText', buildHintText(game, settings.gravity));
  vm.set('boardRows', buildBoardRows(game, busy));

  if (game.winner && !pendingResultNavigation) {
    pendingResultNavigation = true;
    setTimeout(() => {
      const frame = Frame.topmost();
      if (frame.currentPage === page) {
        frame.navigate('result/result-page');
      }
      pendingResultNavigation = false;
    }, 350);
  }
}

function buildBoardRows(game: GameState, busy: boolean): BoardRowVM[] {
  const isHumanTurn = !busy && !game.winner && game.current === 'X';
  const legal = new Set<string>();
  if (isHumanTurn) {
    for (const m of legalMoves(game)) {
      legal.add(`${m.r}:${m.c}`);
    }
  }

  return game.board.map((row, r) => ({
    cells: row.map((cell, c) => {
      const key = `${r}:${c}`;
      const classes = ['cell'];
      let text = '';

      if (cell === 'X' || cell === 'O') {
        text = cell;
        classes.push(cell === 'X' ? 'cell-player-x' : 'cell-player-o');
      } else if (cell === 'B') {
        text = '#';
        classes.push('cell-blocked');
      }

      if (game.lastMove && game.lastMove.r === r && game.lastMove.c === c) {
        classes.push('cell-last');
      }

      const interactive = isHumanTurn && legal.has(key) && cell === null;
      if (interactive) {
        classes.push('cell-legal');
      }

      return {
        r,
        c,
        text,
        cssClass: classes.join(' '),
        interactive,
      };
    }),
  }));
}


function buildHintText(game: GameState, gravityEnabled: boolean): string {
  if (game.winner) {
    return '';
  }
  if (game.moves.length <= 1) {
    if (gravityEnabled && game.config.gravity) {
      return 'Tip: gravity drops marks down! Aim above the open spot.';
    }
    return 'Tip: tap a highlighted cell to place your mark.';
  }
  return '';
}

function buildStatusText(game: GameState, busy: boolean): string {
  if (game.winner === 'Draw') {
    return "It's a draw!";
  }
  if (game.winner === 'X') {
    return 'You win!';
  }
  if (game.winner === 'O') {
    return 'AI wins this round.';
  }
  if (busy && game.current === 'O') {
    return 'AI is thinking...';
  }
  if (game.current === 'X') {
    return 'Your turn. Tap a highlighted cell.';
  }
  return 'Waiting for opponent.';
}

function formatVariantSummary(game: GameState): string {
  const parts: string[] = [];
  if (game.config.gravity) {
    parts.push('Gravity');
  }
  if (game.config.wrap) {
    parts.push('Wrap');
  }
  return parts.length ? parts.join(' | ') : 'Classic rules';
}

function formatDifficulty(value: GameSnapshot['settings']['difficulty']): string {
  switch (value) {
    case 'chill':
      return 'Difficulty: Chill';
    case 'sharp':
      return 'Difficulty: Sharp';
    case 'creative':
      return 'Difficulty: Creative';
    default:
      return 'Difficulty: Balanced';
  }
}

