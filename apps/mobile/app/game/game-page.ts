import { AbsoluteLayout, CoreTypes, Frame, Label, NavigatedData, Observable, Page } from '@nativescript/core';
import type { GestureEventData } from '@nativescript/core';
import { legalMoves } from '@ttt/engine';
import type { Player } from '@ttt/engine';

import type { GameState } from '~/state/game-store';
import { getSnapshot, playerMove, rematch, subscribe, type GameSnapshot } from '~/state/game-store';

interface BoardCellVM {
  r: number;
  c: number;
  text: string;
  cssClass: string;
  interactive: boolean;
  winning: boolean;
}

interface BoardRowVM {
  cells: BoardCellVM[];
}

let viewModel: Observable | null = null;
let unsubscribe: (() => void) | null = null;
let currentPage: Page | null = null;
let confettiTimer: ReturnType<typeof setTimeout> | null = null;
let replayTimer: ReturnType<typeof setTimeout> | null = null;

export function onNavigatingTo(args: NavigatedData) {
  const page = args.object as Page;
  currentPage = page;
  viewModel = viewModel ?? createViewModel();
  page.bindingContext = viewModel;

  unsubscribe?.();
  unsubscribe = subscribe((snapshot) => updateViewModel(viewModel!, snapshot));

  const snapshot = getSnapshot();
  if (!snapshot.game) {
    viewModel.set('statusText', 'Head back to the home screen to start a new match.');
  }
}

export function onNavigatingFrom() {
  unsubscribe?.();
  unsubscribe = null;
  stopReplay();
  clearConfetti(currentPage);
  currentPage = null;
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

export function onRematch() {
  stopReplay();
  rematch();
}

export function onChangeGameSetup() {
  stopReplay();
  const frame = Frame.topmost();
  frame.navigate({ moduleName: 'home/home-page', clearHistory: true });
}

export function onReplay() {
  if (!viewModel) {
    return;
  }
  const snapshot = getSnapshot();
  const game = snapshot.game;
  if (!game || !game.winner) {
    stopReplay();
    return;
  }
  startReplay(viewModel, game);
}

function createViewModel() {
  const vm = new Observable();
  vm.set('statusText', 'Preparing game...');
  vm.set('variantSummary', '');
  vm.set('difficultyLabel', '');
  vm.set('boardRows', [] as BoardRowVM[]);
  vm.set('boardClass', 'board board-3');
  vm.set('busy', false);
  vm.set('aiThinkingVisible', false);
  vm.set('aiThinkingMessage', '');
  vm.set('resultVisible', false);
  vm.set('resultTitle', '');
  vm.set('resultSummary', '');
  vm.set('resultVariantSummary', '');
  vm.set('resultDifficultyLabel', '');
  vm.set('confettiVisible', false);
  vm.set('replayActive', false);
  vm.set('replayCaption', '');
  vm.set('replayStep', 0);
  vm.set('replayTotal', 0);
  vm.set('winLengthLabel', '');
  vm.set('resultWinLengthLabel', '');
  vm.set('replayLogs', [] as { text: string }[]);
  vm.set('replayLogsVisible', false);
  return vm;
}
function updateViewModel(vm: Observable, snapshot: GameSnapshot) {
  const { game, busy, settings } = snapshot;
  vm.set('busy', busy);
  const aiThinking = busy && settings.vsAi;
  vm.set('aiThinkingVisible', aiThinking);
  vm.set('aiThinkingMessage', aiThinking ? 'AI is thinking...' : '');

  if (!game) {
    stopReplay();
    vm.set('boardRows', []);
    vm.set('variantSummary', '');
    vm.set('difficultyLabel', '');
    vm.set('statusText', 'Head back to the home screen to start a new match.');
    vm.set('resultVisible', false);
    vm.set('resultTitle', '');
    vm.set('resultSummary', '');
    vm.set('resultVariantSummary', '');
    vm.set('resultDifficultyLabel', '');
    vm.set('resultWinLengthLabel', '');
    vm.set('confettiVisible', false);
    vm.set('replayActive', false);
    vm.set('replayCaption', '');
    vm.set('replayStep', 0);
    vm.set('replayTotal', 0);
    vm.set('winLengthLabel', '');
    clearReplayLogs(vm);
    clearConfetti(currentPage);
    return;
  }


  vm.set('boardClass', `board board-${game.board.length}`);
  vm.set('variantSummary', formatVariantSummary(game));
  vm.set('difficultyLabel', formatDifficulty(settings.difficulty));
  vm.set('statusText', buildStatusText(game, busy));
  vm.set('replayTotal', game.moves.length);
  vm.set('winLengthLabel', formatWinLength(game));
  if (!vm.get('replayActive')) {
    vm.set('replayStep', 0);
    vm.set('replayCaption', '');
  }

  const winningLine = game.winner && game.winner !== 'Draw' ? findWinningLine(game) : null;
  const winningCells = winningLine ? new Set(winningLine.map(({ r, c }) => `${r}:${c}`)) : undefined;
  vm.set('boardRows', buildBoardRows(game, busy, winningCells));

  const hasResult = !!game.winner;
  vm.set('resultVisible', hasResult);
  if (hasResult) {
    vm.set('resultTitle', buildResultTitle(game));
    vm.set('resultSummary', buildResultSummary(game));
    vm.set('resultVariantSummary', formatVariantSummary(game));
    vm.set('resultDifficultyLabel', formatResultDifficulty(settings.difficulty));
    vm.set('resultWinLengthLabel', formatWinLength(game));
    const playerWon = game.winner === 'X';
    vm.set('confettiVisible', playerWon);
    if (playerWon) {
      triggerConfetti(currentPage);
    } else {
      clearConfetti(currentPage);
    }
  } else {
    stopReplay();
    vm.set('resultTitle', '');
    vm.set('resultSummary', '');
    vm.set('resultVariantSummary', '');
    vm.set('resultDifficultyLabel', '');
    vm.set('resultWinLengthLabel', '');
    vm.set('confettiVisible', false);
    clearConfetti(currentPage);
  }
}

function buildBoardRows(game: GameState, busy: boolean, winningCells?: Set<string>): BoardRowVM[] {
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
      const winning = winningCells?.has(key) ?? false;

      if (cell === 'X' || cell === 'O') {
        text = cell;
        classes.push(cell === 'X' ? 'cell-player-x' : 'cell-player-o');
      } else if (cell === 'B') {
        text = '🧱';
        classes.push('cell-blocked');
      }

      if (game.lastMove && game.lastMove.r === r && game.lastMove.c === c) {
        classes.push('cell-last');
      }

      if (winning) {
        classes.push('cell-winning');
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
        winning,
      };
    }),
  }));
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
    return 'Your turn. You are X.';
  }
  return 'Waiting for opponent.';
}

function startReplay(vm: Observable, game: GameState) {
  const winningSet = toWinningCellSet(game);
  stopReplay({ vm, game, winning: winningSet });
  const moves = game.moves;
  clearReplayLogs(vm);
  if (!moves.length) {
    vm.set('replayActive', false);
    vm.set('replayStep', 0);
    vm.set('replayTotal', 0);
    appendReplayLog(vm, 'No moves to replay.');
    return;
  }
  vm.set('replayActive', true);
  vm.set('replayStep', 0);
  vm.set('replayTotal', moves.length);
  appendReplayLog(vm, 'Replay starting...');
  runReplayStep(vm, game, winningSet, 0);
}

function stopReplay(restore?: { vm: Observable; game?: GameState; winning?: Set<string> | null }) {
  if (replayTimer !== null) {
    clearTimeout(replayTimer);
    replayTimer = null;
  }
  const target = restore?.vm ?? viewModel;
  if (!target) {
    return;
  }
  clearReplayLogs(target);
  target.set('replayActive', false);
  target.set('replayStep', 0);
  target.set('replayTotal', restore?.game ? restore.game.moves.length : 0);
  if (restore?.game) {
    target.set('boardRows', buildBoardRows(restore.game, false, restore.winning ?? undefined));
  }
}

function runReplayStep(vm: Observable, game: GameState, winningSet: Set<string> | null, step: number) {
  if (!currentPage) {
    stopReplay();
    return;
  }
  const moves = game.moves;
  const boardSize = game.board.length;
  const board: Array<Array<Player | 'B' | null>> = Array.from({ length: boardSize }, (_, r) =>
    Array.from({ length: boardSize }, (_, c) => (game.board[r][c] === 'B' ? 'B' : null))
  );

  const limit = Math.min(step, moves.length);
  for (let i = 0; i < limit; i++) {
    const move = moves[i];
    const player: Player = i % 2 === 0 ? 'X' : 'O';
    board[move.r][move.c] = player;
  }

  const lastMove = limit > 0 ? moves[limit - 1] : undefined;
  const displayGame: GameState = {
    ...game,
    board,
    moves: moves.slice(0, limit),
    lastMove,
    current: limit % 2 === 0 ? 'X' : 'O',
    winner: limit === moves.length ? game.winner : null,
  };

  const highlight = displayGame.winner ? winningSet ?? undefined : undefined;
  vm.set('boardRows', buildBoardRows(displayGame, true, highlight));
  vm.set('replayStep', limit);
  vm.set('replayTotal', moves.length);

  if (limit > 0) {
    const occupant: Player = (limit - 1) % 2 === 0 ? 'X' : 'O';
    const move = moves[limit - 1];
    appendReplayLog(vm, `Move ${limit}/${moves.length}: ${occupant} -> (${move.r + 1}, ${move.c + 1})`);
  }

  if (step >= moves.length) {
    appendReplayLog(vm, 'Replay complete.');
    vm.set('replayActive', false);
    replayTimer = null;
    return;
  }

  const delay = step === 0 ? 700 : 900;
  replayTimer = setTimeout(() => runReplayStep(vm, game, winningSet, step + 1), delay);
}

function appendReplayLog(vm: Observable, text: string) {
  const existing = (vm.get('replayLogs') as { text: string }[] | undefined) ?? [];
  const next = [...existing, { text }];
  vm.set('replayLogs', next);
  vm.set('replayLogsVisible', true);
  vm.set('replayCaption', text);
}

function clearReplayLogs(vm: Observable) {
  vm.set('replayLogs', [] as { text: string }[]);
  vm.set('replayLogsVisible', false);
  vm.set('replayCaption', '');
}

function toWinningCellSet(game: GameState): Set<string> | null {
  const winningLine = findWinningLine(game);
  if (!winningLine) {
    return null;
  }
  return new Set(winningLine.map(({ r, c }) => `${r}:${c}`));
}
function findWinningLine(game: GameState): { r: number; c: number }[] | null {
  if (!game.winner || game.winner === 'Draw') {
    return null;
  }
  const n = game.board.length;
  const need = game.config.winLength;
  const wrap = !!game.config.wrap;

  const normalize = (value: number) => ((value % n) + n) % n;

  const cell = (r: number, c: number) => {
    if (wrap) {
      return game.board[normalize(r)][normalize(c)];
    }
    if (r < 0 || c < 0 || r >= n || c >= n) {
      return 'B';
    }
    return game.board[r][c];
  };

  const dirs: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let sr = 0; sr < n; sr++) {
    for (let sc = 0; sc < n; sc++) {
      for (const [dr, dc] of dirs) {
        const coords: { r: number; c: number }[] = [];
        let occupant: Player | null = null;
        let valid = true;
        for (let k = 0; k < need; k++) {
          const rr = sr + dr * k;
          const cc = sc + dc * k;
          const value = cell(rr, cc);
          if (value !== 'X' && value !== 'O') {
            valid = false;
            break;
          }
          if (!occupant) {
            occupant = value;
          } else if (value !== occupant) {
            valid = false;
            break;
          }
          const nr = wrap ? normalize(rr) : rr;
          const nc = wrap ? normalize(cc) : cc;
          coords.push({ r: nr, c: nc });
        }
        if (valid && coords.length === need && occupant) {
          const expectedWinner = game.config.misere ? (occupant === 'X' ? 'O' : 'X') : occupant;
          if (expectedWinner === game.winner) {
            const seen = new Set<string>();
            const unique: { r: number; c: number }[] = [];
            for (const coord of coords) {
              const key = `${coord.r}:${coord.c}`;
              if (!seen.has(key)) {
                seen.add(key);
                unique.push(coord);
              }
            }
            return unique;
          }
        }
      }
    }
  }
  return null;
}

function triggerConfetti(page: Page | null, count = 24) {
  if (!page) {
    return;
  }
  if (confettiTimer !== null) {
    clearTimeout(confettiTimer);
    confettiTimer = null;
  }
  confettiTimer = setTimeout(() => {
    confettiTimer = null;
    renderConfetti(page, count);
  }, 80);
}

function renderConfetti(page: Page, count: number) {
  const layer = page.getViewById<AbsoluteLayout>('confettiLayer');
  if (!layer) {
    return;
  }
  removeAllChildren(layer);
  const colors = ['#ffd54f', '#ff8a80', '#80d8ff', '#b388ff'];
  const layoutSize = layer.getActualSize();
  const pageSize = page.getActualSize();
  const width = layoutSize.width || layer.getMeasuredWidth() || pageSize.width || page.getMeasuredWidth() || 220;
  const height = layoutSize.height || layer.getMeasuredHeight() || pageSize.height || page.getMeasuredHeight() || 260;
  for (let i = 0; i < count; i++) {
    const piece = new Label();
    const pieceSize = 6 + Math.random() * 8;
    piece.className = 'confetti-piece';
    piece.backgroundColor = colors[i % colors.length];
    piece.width = pieceSize;
    piece.height = pieceSize * 1.8;
    piece.opacity = 0;
    piece.rotate = Math.random() * 360;
    const left = Math.random() * width;
    AbsoluteLayout.setLeft(piece, left);
    AbsoluteLayout.setTop(piece, 0);
    layer.addChild(piece);
    piece.translateY = -height / 2 - Math.random() * 80;
    piece.translateX = 0;
    const driftX = (Math.random() - 0.5) * (width / 2);
    const fall = height + Math.random() * (height / 2);
    const duration = 1200 + Math.random() * 800;
    const delay = Math.random() * 200;
    const endRotate = piece.rotate + (Math.random() > 0.5 ? 360 : -360);
    piece.animate({
      translate: { x: driftX, y: fall },
      rotate: endRotate,
      opacity: 1,
      duration,
      delay,
      curve: CoreTypes.AnimationCurve.easeInOut,
    }).then(() => piece.animate({
      opacity: 0,
      duration: 250,
    })).then(() => {
      if (piece.parent) {
        (piece.parent as AbsoluteLayout).removeChild(piece);
      }
    }).catch(() => {
      if (piece.parent) {
        (piece.parent as AbsoluteLayout).removeChild(piece);
      }
    });
  }
}

function clearConfetti(page: Page | null) {
  if (confettiTimer !== null) {
    clearTimeout(confettiTimer);
    confettiTimer = null;
  }
  if (!page) {
    return;
  }
  const layer = page.getViewById<AbsoluteLayout>('confettiLayer');
  if (layer) {
    removeAllChildren(layer);
  }
}

function removeAllChildren(layout: AbsoluteLayout) {
  while (layout.getChildrenCount() > 0) {
    layout.removeChild(layout.getChildAt(0));
  }
}
function buildResultTitle(game: GameState): string {
  if (game.winner === 'Draw') {
    return "It's a draw! 😥";
  }
  if (game.winner === 'X') {
    return 'Victory! 🥳';
  }
  if (game.winner === 'O') {
    return 'Defeat this time! 😞';
  }
  return 'Match complete';
}

function buildResultSummary(game: GameState): string {
  const moves = game.moves.length;
  const turns = moves === 1 ? '1 move' : moves + ' moves';
  return 'Finished after ' + turns + '.';
}

function formatWinLength(game: GameState): string {
  return 'Connect ' + game.config.winLength + ' in a row';
}

function formatVariantSummary(game: GameState): string[] {
  const variants = [];
  if (game.config.gravity) {
    variants.push('⬇️ Gravity - Marks fall to the lowest empty cell.');
  }
  if (game.config.wrap) {
    variants.push('🔄 Wrap - Lines continue across opposite edges.');
  }
  if (game.config.misere) {
    variants.push('🎭 Misere - completing the win line makes you lose.');
  }
  if ((game.config.randomBlocks ?? 0) > 0) {
    variants.push('🧱 Blocks - 1-3 cells start blocked.');
  }
  return variants;
}

function formatDifficulty(value: GameSnapshot['settings']['difficulty']): string {
  switch (value) {
    case 'chill':
      return '🤓 Chill';
    case 'sharp':
      return '👿 Sharp';
    default:
      return '🤔 Balanced';
  }
}

function formatResultDifficulty(value: GameSnapshot['settings']['difficulty']): string {
  switch (value) {
    case 'chill':
      return 'Played on Chill difficulty';
    case 'sharp':
      return 'Played on Sharp difficulty';
    default:
      return 'Played on Balanced difficulty';
  }
}
