import { AbsoluteLayout, CoreTypes, Dialogs, EventData, Frame, Label, NavigatedData, Observable, Page } from '@nativescript/core';
import type { GestureEventData } from '@nativescript/core';
import {
  canUseBomb,
  canUseDoubleMove,
  canUseLaneShift,
  isBombLegal,
  isDoubleMoveFirstPlacementLegal,
  isDoubleMoveLegal,
  legalMoves,
} from '@ttt/engine';
import type { Player } from '@ttt/engine';

import type { GameState, Move } from '~/state/game-store';
import {
  activateReplay,
  clearReplayMode,
  consumeQueuedReplay,
  getSnapshot,
  playerMove,
  rematch,
  subscribe,
  type GameSnapshot,
} from '~/state/game-store';
import { bindAuthTo } from '~/state/auth-bindings';
import { navigateToPlay, navigateToProfile, navigateToAbout } from '~/services/navigation';
import { findWinningLine, formatReplayEntry } from '~/utils/game-format';

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
let authBindingDetach: (() => void) | null = null;

interface PendingDoubleMove {
  armed: boolean;
  firstSelection: { r: number; c: number } | null;
}

const pendingDoubleMove: PendingDoubleMove = {
  armed: false,
  firstSelection: null,
};

interface PendingLaneShift {
  armed: boolean;
}

const pendingLaneShift: PendingLaneShift = {
  armed: false,
};

interface PendingBomb {
  armed: boolean;
}

const pendingBomb: PendingBomb = {
  armed: false,
};

function resetPendingDoubleMove() {
  pendingDoubleMove.armed = false;
  pendingDoubleMove.firstSelection = null;
}

function resetPendingLaneShift() {
  pendingLaneShift.armed = false;
}

function resetPendingBomb() {
  pendingBomb.armed = false;
}

function setPendingFirstSelection(cell: { r: number; c: number } | null) {
  pendingDoubleMove.firstSelection = cell;
}

function pendingFirstSelectionKey(): string | null {
  if (!pendingDoubleMove.firstSelection) {
    return null;
  }
  const { r, c } = pendingDoubleMove.firstSelection;
  return `${r}:${c}`;
}

function canPlayerArmDoubleMove(snapshot: GameSnapshot): boolean {
  if (snapshot.replayContext) {
    return false;
  }
  const { game, busy } = snapshot;
  if (!game || busy || game.winner) {
    return false;
  }
  if (game.current !== 'X') {
    return false;
  }
  if (!game.config.doubleMove) {
    return false;
  }
  return canUseDoubleMove(game);
}

function canPlayerArmLaneShift(snapshot: GameSnapshot): boolean {
  if (snapshot.replayContext) {
    return false;
  }
  const { game, busy } = snapshot;
  if (!game || busy || game.winner) {
    return false;
  }
  if (game.current !== 'X') {
    return false;
  }
  if (!game.config.laneShift) {
    return false;
  }
  return canUseLaneShift(game);
}

function canPlayerArmBomb(snapshot: GameSnapshot): boolean {
  if (snapshot.replayContext) {
    return false;
  }
  const { game, busy } = snapshot;
  if (!game || busy || game.winner) {
    return false;
  }
  if (game.current !== 'X') {
    return false;
  }
  if (!game.config.bomb) {
    return false;
  }
  return canUseBomb(game);
}

export function onNavigatingTo(args: NavigatedData) {
  const page = args.object as Page;
  currentPage = page;
  resetPendingDoubleMove();
  resetPendingLaneShift();
  resetPendingBomb();
  viewModel = viewModel ?? createViewModel();
  page.bindingContext = viewModel;
  viewModel.set('navActive', 'play');
  if (!authBindingDetach) {
    authBindingDetach = bindAuthTo(viewModel);
  }

  unsubscribe?.();
  unsubscribe = subscribe((snapshot) => updateViewModel(viewModel!, snapshot));

  const queuedReplay = consumeQueuedReplay();
  if (queuedReplay) {
    activateReplay(queuedReplay);
  }

  const snapshot = getSnapshot();
  if (!snapshot.game) {
    viewModel.set('statusText', 'Head back to the home screen to start a new match.');
  }
}

export function onNavigatingFrom() {
  unsubscribe?.();
  unsubscribe = null;
  clearReplayMode();
  stopReplay();
  clearConfetti(currentPage);
  resetPendingLaneShift();
  resetPendingDoubleMove();
  resetPendingBomb();
  currentPage = null;
}

export function onCellTap(args: GestureEventData) {
  const cell = (args.object as any).bindingContext as BoardCellVM | undefined;
  if (!cell?.interactive) {
    return;
  }
  const snapshot = getSnapshot();
  if (snapshot.replayContext) {
    return;
  }
  if (pendingLaneShift.armed) {
    void handleLaneShiftTap(cell, snapshot);
    return;
  }
  if (pendingBomb.armed) {
    handleBombTap(cell, snapshot);
    return;
  }
  if (pendingDoubleMove.armed) {
    handleDoubleMoveTap(cell, snapshot);
    return;
  }
  playerMove({ r: cell.r, c: cell.c });
}

function handleDoubleMoveTap(cell: BoardCellVM, snapshot: GameSnapshot) {
  if (snapshot.replayContext) {
    return;
  }
  const { game } = snapshot;
  if (!viewModel || !game) {
    resetPendingDoubleMove();
    if (viewModel) updateViewModel(viewModel, snapshot);
    return;
  }

  const usableNow = canPlayerArmDoubleMove(snapshot) && !game.powers.doubleMove.X;
  if (!usableNow) {
    resetPendingDoubleMove();
    updateViewModel(viewModel, snapshot);
    return;
  }

  if (!pendingDoubleMove.firstSelection) {
    setPendingFirstSelection({ r: cell.r, c: cell.c });
    updateViewModel(viewModel, snapshot);
    return;
  }

  const first = pendingDoubleMove.firstSelection;
  if (first.r === cell.r && first.c === cell.c) {
    setPendingFirstSelection(null);
    updateViewModel(viewModel, snapshot);
    return;
  }

  const move: Move = {
    r: first.r,
    c: first.c,
    extra: { r: cell.r, c: cell.c },
    power: 'doubleMove',
  };

  const beforeMoves = game.moves.length;
  playerMove(move);
  const updated = getSnapshot();
  const moved = updated.game && updated.game.moves.length > beforeMoves;
  if (!moved) {
    setPendingFirstSelection(null);
    updateViewModel(viewModel, updated);
    return;
  }

  resetPendingDoubleMove();
  updateViewModel(viewModel, updated);
}

async function handleLaneShiftTap(cell: BoardCellVM, snapshot: GameSnapshot) {
  if (!pendingLaneShift.armed) {
    return;
  }
  if (snapshot.replayContext) {
    return;
  }
  const { game } = snapshot;
  if (!viewModel || !game) {
    resetPendingLaneShift();
    if (viewModel) updateViewModel(viewModel, snapshot);
    return;
  }

  const usableNow = canPlayerArmLaneShift(snapshot) && !game.powers.laneShift.X;
  if (!usableNow) {
    resetPendingLaneShift();
    updateViewModel(viewModel, snapshot);
    return;
  }

  const options = [
    { label: '⬅️ Shift row left', axis: 'row' as const, direction: -1 as const },
    { label: '➡️ Shift row right', axis: 'row' as const, direction: 1 as const },
    { label: '⬆️ Shift column up', axis: 'column' as const, direction: -1 as const },
    { label: '⬇️ Shift column down', axis: 'column' as const, direction: 1 as const },
  ];

  const choiceLabel = await Dialogs.action({
    title: '🔁 Choose Lane Shift',
    cancelButtonText: 'Cancel',
    actions: options.map((o) => o.label),
  });

  const choice = options.find((o) => o.label === choiceLabel);
  if (!choice) {
    return;
  }

  const index = choice.axis === 'row' ? cell.r : cell.c;
  const move: Move = {
    power: 'laneShift',
    shift: {
      axis: choice.axis,
      index,
      direction: choice.direction,
    },
  };

  const beforeMoves = game.moves.length;
  playerMove(move);
  const updated = getSnapshot();
  const moved = updated.game && updated.game.moves.length > beforeMoves;
  if (!moved) {
    updateViewModel(viewModel, updated);
    return;
  }

  resetPendingLaneShift();
  updateViewModel(viewModel, updated);
}

function handleBombTap(cell: BoardCellVM, snapshot: GameSnapshot) {
  if (!pendingBomb.armed) {
    return;
  }
  if (snapshot.replayContext) {
    return;
  }
  const { game } = snapshot;
  if (!viewModel || !game) {
    resetPendingBomb();
    if (viewModel) updateViewModel(viewModel, snapshot);
    return;
  }

  const usage = game.powers.bomb;
  const usableNow = canPlayerArmBomb(snapshot) && !(usage ? usage.X : false);
  if (!usableNow) {
    resetPendingBomb();
    updateViewModel(viewModel, snapshot);
    return;
  }

  const move: Move = {
    power: 'bomb',
    r: cell.r,
    c: cell.c,
  };
  if (!isBombLegal(game, move)) {
    resetPendingBomb();
    updateViewModel(viewModel, snapshot);
    return;
  }

  const beforeMoves = game.moves.length;
  playerMove(move);
  const updated = getSnapshot();
  const moved = updated.game && updated.game.moves.length > beforeMoves;
  if (!moved) {
    updateViewModel(viewModel, updated);
    return;
  }

  resetPendingBomb();
  setPendingFirstSelection(null);
  updateViewModel(viewModel, updated);
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

export function onOtpPowerAction(args: EventData) {
  if (!viewModel) {
    return;
  }
  const target = args.object as any;
  const context = target?.bindingContext as { id: 'doubleMove' | 'laneShift' | 'bomb'; armed: boolean; buttonEnabled?: boolean } | undefined;
  if (!context) {
    return;
  }
  if (!context.armed && context.buttonEnabled === false) {
    return;
  }
  const snapshot = getSnapshot();
  if (snapshot.replayContext) {
    return;
  }

  if (context.id === 'doubleMove') {
    if (pendingDoubleMove.armed) {
      resetPendingDoubleMove();
      updateViewModel(viewModel, snapshot);
      return;
    }
    if (!canPlayerArmDoubleMove(snapshot)) {
      return;
    }
    resetPendingLaneShift();
    resetPendingBomb();
    pendingDoubleMove.armed = true;
    setPendingFirstSelection(null);
    updateViewModel(viewModel, snapshot);
    return;
  }

  if (context.id === 'bomb') {
    if (pendingBomb.armed) {
      resetPendingBomb();
      updateViewModel(viewModel, snapshot);
      return;
    }
    if (!canPlayerArmBomb(snapshot)) {
      return;
    }
    resetPendingDoubleMove();
    setPendingFirstSelection(null);
    resetPendingLaneShift();
    pendingBomb.armed = true;
    updateViewModel(viewModel, snapshot);
    return;
  }

  if (context.id === 'laneShift') {
    if (pendingLaneShift.armed) {
      resetPendingLaneShift();
      updateViewModel(viewModel, snapshot);
      return;
    }
    if (!canPlayerArmLaneShift(snapshot)) {
      return;
    }
    resetPendingDoubleMove();
    setPendingFirstSelection(null);
    resetPendingBomb();
    pendingLaneShift.armed = true;
    updateViewModel(viewModel, snapshot);
  }
}

function createViewModel() {
  const vm = new Observable();
  vm.set('statusText', 'Preparing game...');
  vm.set('variantSummary', [] as string[]);
  vm.set('otpSummary', [] as string[]);
  vm.set('difficultyLabel', '');
  vm.set('boardRows', [] as BoardRowVM[]);
  vm.set('boardClass', 'board board-3');
  vm.set('busy', false);
  vm.set('aiThinkingVisible', false);
  vm.set('aiThinkingMessage', '');
  vm.set('resultVisible', false);
  vm.set('resultTitle', '');
  vm.set('resultSummary', '');
  vm.set('resultVariantSummary', [] as string[]);
  vm.set('resultOtpSummary', [] as string[]);
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
  vm.set('replayMode', false);
  vm.set('replaySourceLabel', '');
  vm.set('replaySourceId', '');
  vm.set('otpPowerItems', [] as any[]);
  return vm;
}
function updateViewModel(vm: Observable, snapshot: GameSnapshot) {
  const { game, busy, settings, replayContext } = snapshot;
  const previousReplaySourceId = (vm.get('replaySourceId') as string) || '';
  const isReplay = !!replayContext;
  const currentReplaySourceId = replayContext ? replayContext.matchId : '';

  vm.set('busy', busy);
  vm.set('replayMode', isReplay);
  vm.set('replaySourceLabel', replayContext ? formatReplaySourceLabel(replayContext) : '');

  const aiThinking = busy && settings.vsAi && !isReplay;
  vm.set('aiThinkingVisible', aiThinking);
  vm.set('aiThinkingMessage', aiThinking ? 'AI is thinking...' : '');

  syncOtpPowerUi(vm, snapshot);

  if (!game) {
    stopReplay();
    vm.set('boardRows', []);
    vm.set('variantSummary', [] as string[]);
    vm.set('otpSummary', '');
    vm.set('modeSummary', [] as string[]);
    vm.set('difficultyLabel', '');
    vm.set('statusText', 'Head back to the home screen to start a new match.');
    vm.set('resultVisible', false);
    vm.set('resultTitle', '');
    vm.set('resultSummary', '');
    vm.set('resultVariantSummary', [] as string[]);
    vm.set('resultOtpSummary', [] as string[]);
    vm.set('resultModeSummary', [] as string[]);
    vm.set('resultDifficultyLabel', '');
    vm.set('resultWinLengthLabel', '');
    vm.set('confettiVisible', false);
    vm.set('replayActive', false);
    vm.set('replayCaption', '');
    vm.set('replayStep', 0);
    vm.set('replayTotal', 0);
    vm.set('winLengthLabel', '');
    vm.set('replaySourceId', '');
    clearReplayLogs(vm);
    clearConfetti(currentPage);
    return;
  }

  vm.set('boardClass', `board board-${game.board.length}`);
  vm.set('variantSummary', formatVariantSummary(game));
  vm.set('otpSummary', formatOtpSummary(game));
  vm.set('modeSummary', formatGameModeSummary(game));
  vm.set('difficultyLabel', formatDifficulty(settings.difficulty));
  vm.set('statusText', buildStatusText(game, busy, isReplay));
  vm.set('replayTotal', game.moves.length);
  vm.set('winLengthLabel', formatWinLength(game));
  if (!vm.get('replayActive')) {
    vm.set('replayStep', 0);
    vm.set('replayCaption', '');
  }

  const winningLine = game.winner && game.winner !== 'Draw' ? findWinningLine(game) : null;
  const winningCells = winningLine ? new Set(winningLine.map(({ r, c }) => `${r}:${c}`)) : undefined;
  vm.set('boardRows', buildBoardRows(game, busy, winningCells, isReplay));

  const hasResult = !!game.winner;
  vm.set('resultVisible', hasResult);
  if (hasResult) {
    vm.set('resultTitle', buildResultTitle(game));
    vm.set('resultSummary', buildResultSummary(game));
    vm.set('resultVariantSummary', formatVariantSummary(game));
    vm.set('resultOtpSummary', formatOtpSummary(game));
    vm.set('resultModeSummary', formatGameModeSummary(game));
    vm.set('resultDifficultyLabel', formatResultDifficulty(settings.difficulty));
    vm.set('resultWinLengthLabel', formatWinLength(game));
    const playerWon = game.winner === 'X';
    const shouldCelebrate = playerWon && !isReplay;
    vm.set('confettiVisible', shouldCelebrate);
    if (shouldCelebrate) {
      triggerConfetti(currentPage);
    } else {
      clearConfetti(currentPage);
    }
  } else {
    vm.set('resultTitle', '');
    vm.set('resultSummary', '');
    vm.set('resultVariantSummary', [] as string[]);
    vm.set('resultOtpSummary', [] as string[]);
    vm.set('resultModeSummary', [] as string[]);
    vm.set('resultDifficultyLabel', '');
    vm.set('resultWinLengthLabel', '');
    vm.set('confettiVisible', false);
    if (!isReplay) {
      clearConfetti(currentPage);
    }
  }

  if (isReplay) {
    if (currentReplaySourceId && currentReplaySourceId !== previousReplaySourceId) {
      stopReplay();
      startReplay(vm, game);
    }
  } else if (previousReplaySourceId) {
    stopReplay();
  }

  vm.set('replaySourceId', currentReplaySourceId);
}

function syncOtpPowerUi(vm: Observable, snapshot: GameSnapshot) {
  if (snapshot.replayContext) {
    resetPendingDoubleMove();
    resetPendingLaneShift();
    resetPendingBomb();
    vm.set('otpPowerItems', []);
    return;
  }
  const { game } = snapshot;
  if (!game) {
    resetPendingDoubleMove();
    resetPendingLaneShift();
    resetPendingBomb();
    vm.set('otpPowerItems', []);
    return;
  }

  const items: Array<{
    id: 'doubleMove' | 'laneShift' | 'bomb';
    title: string;
    description: string;
    buttonText: string;
    buttonEnabled: boolean;
    armed: boolean;
  }> = [];

  if (game.config.doubleMove) {
    const used = game.powers.doubleMove.X;
    const available = canPlayerArmDoubleMove(snapshot);
    if ((!available || used) && pendingDoubleMove.armed) {
      resetPendingDoubleMove();
    } else if (!available) {
      setPendingFirstSelection(null);
    }
    const armed = pendingDoubleMove.armed;
    items.push({
      id: 'doubleMove',
      title: '⚡ Double Move',
      description: 'Place two marks on one turn.',
      buttonText: used ? 'Used' : armed ? 'Cancel' : 'Invoke',
      buttonEnabled: armed || (!used && available),
      armed,
    });
  } else {
    resetPendingDoubleMove();
  }

  if (game.config.laneShift) {
    const usage = game.powers.laneShift;
    const used = usage ? usage.X : false;
    const available = canPlayerArmLaneShift(snapshot);
    if ((!available || used) && pendingLaneShift.armed) {
      resetPendingLaneShift();
    }
    const armed = pendingLaneShift.armed;
    items.push({
      id: 'laneShift',
      title: '🔁 Lane Shift',
      description: 'Shift a row or column by one cell.',
      buttonText: used ? 'Used' : armed ? 'Cancel' : 'Invoke',
      buttonEnabled: armed || (!used && available),
      armed,
    });
  } else {
    resetPendingLaneShift();
  }

  if (game.config.bomb) {
    const usage = game.powers.bomb;
    const used = usage ? usage.X : false;
    const available = canPlayerArmBomb(snapshot);
    if ((!available || used) && pendingBomb.armed) {
      resetPendingBomb();
    }
    const armed = pendingBomb.armed;
    items.push({
      id: 'bomb',
      title: '🔥 Bomb',
      description: 'Destroy a cell and make it unplayable.',
      buttonText: used ? 'Used' : armed ? 'Cancel' : 'Invoke',
      buttonEnabled: armed || (!used && available),
      armed,
    });
  } else {
    resetPendingBomb();
  }

  vm.set('otpPowerItems', items);
}

function buildBoardRows(
  game: GameState,
  busy: boolean,
  winningCells?: Set<string>,
  readOnly = false,
): BoardRowVM[] {
  const isHumanTurn = !readOnly && !busy && !game.winner && game.current === 'X';
  const laneShiftAvailable = isHumanTurn && game.config.laneShift && canUseLaneShift(game);
  const laneShiftArmed = laneShiftAvailable && pendingLaneShift.armed;
  const legalMovesList = isHumanTurn && !laneShiftArmed ? legalMoves(game) : [];
  const legal = new Set<string>(legalMovesList.map((m) => `${m.r}:${m.c}`));

  const bombAvailable = isHumanTurn && game.config.bomb && canUseBomb(game);
  const bombArmed = bombAvailable && pendingBomb.armed && !laneShiftArmed;
  let bombChoices: Set<string> | null = null;
  if (bombArmed) {
    bombChoices = new Set<string>();
    for (let rr = 0; rr < game.board.length; rr++) {
      for (let cc = 0; cc < game.board[rr].length; cc++) {
        if (isBombLegal(game, { power: 'bomb', r: rr, c: cc })) {
          bombChoices.add(`${rr}:${cc}`);
        }
      }
    }
  }

  const doubleMoveEligible = isHumanTurn && !game.winner && game.config.doubleMove && !laneShiftArmed && !bombArmed;
  const powerArmed = doubleMoveEligible && pendingDoubleMove.armed;
  const powerFirst = powerArmed ? pendingDoubleMove.firstSelection : null;
  const powerFirstKey = powerFirst ? `${powerFirst.r}:${powerFirst.c}` : null;
  let powerFirstChoices: Set<string> | null = null;
  let powerSecondChoices: Set<string> | null = null;
  if (powerArmed && !powerFirst) {
    powerFirstChoices = new Set<string>();
    for (const m of legalMovesList) {
      if (isDoubleMoveFirstPlacementLegal(game, { r: m.r, c: m.c })) {
        powerFirstChoices.add(`${m.r}:${m.c}`);
      }
    }
  }
  if (powerFirst) {
    powerSecondChoices = new Set<string>();
    for (const m of legalMovesList) {
      if (m.r === powerFirst.r && m.c === powerFirst.c) {
        continue;
      }
      const candidateMove: Move = {
        r: powerFirst.r,
        c: powerFirst.c,
        extra: { r: m.r, c: m.c },
        power: 'doubleMove',
      };
      if (isDoubleMoveLegal(game, candidateMove)) {
        powerSecondChoices.add(`${m.r}:${m.c}`);
      }
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
      } else if (cell === 'F') {
        text = '🔥';
        classes.push('cell-bombed');
      }

      const lastMove = game.lastMove;
      if (
        lastMove &&
        ((typeof lastMove.r === 'number' && typeof lastMove.c === 'number' && lastMove.r === r && lastMove.c === c) ||
          (lastMove.power === 'doubleMove' && lastMove.extra && lastMove.extra.r === r && lastMove.extra.c === c))
      ) {
        classes.push('cell-last');
      }

      if (winning) {
        classes.push('cell-winning');
      }

      let interactive = false;

      if (laneShiftArmed) {
        interactive = true;
        classes.push('cell-power-lane');
      } else if (bombArmed) {
        const allowedBomb = bombChoices?.has(key) ?? false;
        interactive = allowedBomb;
        if (allowedBomb) {
          classes.push('cell-power-bomb-option');
        }
      } else {
        interactive = isHumanTurn && legal.has(key) && cell === null;
        if (powerArmed) {
          if (!powerFirst) {
            const allowedFirst = powerFirstChoices?.has(key) ?? false;
            interactive = interactive && allowedFirst;
            if (interactive) {
              classes.push('cell-power-armed');
            }
          } else if (powerFirstKey === key) {
            interactive = true;
            classes.push('cell-power-selected');
          } else {
            const allowedSecond = powerSecondChoices?.has(key) ?? false;
            interactive = interactive && allowedSecond;
            if (interactive) {
              classes.push('cell-power-armed');
            }
          }
        }
      }

      if (readOnly) {
        interactive = false;
      }

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

function formatReplaySourceLabel(context: GameSnapshot['replayContext']): string {
  if (!context) {
    return '';
  }
  const date = new Date(context.createdAtIso);
  let formatted = date.toISOString();
  try {
    formatted = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch (_) {
    formatted = date.toLocaleString();
  }
  return context.title ? `${context.title} • ${formatted}` : `Saved match • ${formatted}`;
}

function buildStatusText(game: GameState, busy: boolean, isReplay: boolean): string {
  if (isReplay) {
    if (game.winner === 'Draw') {
      return 'Watching a drawn match replay.';
    }
    if (game.winner === 'X') {
      return 'Watching your winning replay.';
    }
    if (game.winner === 'O') {
      return 'Watching the opponent’s winning replay.';
    }
    return 'Watching saved match replay.';
  }
  if (game.config.laneShift && pendingLaneShift.armed && game.current === 'X' && !game.winner) {
    return 'Lane Shift armed. Tap a cell on the lane.';
  }
  if (game.config.bomb && pendingBomb.armed && game.current === 'X' && !game.winner) {
    return 'Bomb armed. Tap a cell to blast it.';
  }
  if (game.config.doubleMove && pendingDoubleMove.armed && game.current === 'X' && !game.winner) {
    if (pendingDoubleMove.firstSelection) {
      return 'Double Move armed. Pick the second cell.';
    }
    return 'Double Move armed. Pick the first cell.';
  }
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
  const board: Array<Array<Player | 'B' | 'F' | null>> = Array.from({ length: boardSize }, (_, r) =>
    Array.from({ length: boardSize }, (_, c) => (game.board[r][c] === 'B' ? 'B' : null))
  );

  const limit = Math.min(step, moves.length);
  for (let i = 0; i < limit; i++) {
    const move = moves[i];
    const player: Player = move.player ?? (i % 2 === 0 ? 'X' : 'O');
    if (move.power === 'laneShift' && move.shift) {
      applyReplayLaneShift(board, move.shift);
      continue;
    }
    if (move.power === 'bomb' && typeof move.r === 'number' && typeof move.c === 'number') {
      board[move.r][move.c] = 'F';
      continue;
    }
    if (typeof move.r === 'number' && typeof move.c === 'number') {
      board[move.r][move.c] = player;
      if (move.power === 'doubleMove' && move.extra) {
        board[move.extra.r][move.extra.c] = player;
      }
    }
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
    const move = moves[limit - 1];
    const occupant: Player = move.player ?? ((limit - 1) % 2 === 0 ? 'X' : 'O');
    appendReplayLog(vm, formatReplayEntry(move, occupant, limit, moves.length));
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

function applyReplayLaneShift(board: Array<Array<Player | 'B' | 'F' | null>>, shift: { axis: 'row' | 'column'; index: number; direction: 1 | -1 }) {
  const n = board.length;
  if (shift.axis === 'row') {
    const row = board[shift.index].slice();
    const next: Array<Player | 'B' | 'F' | null> = Array(n);
    for (let c = 0; c < n; c++) {
      const source = (c - shift.direction + n) % n;
      next[c] = row[source];
    }
    board[shift.index] = next;
    return;
  }
  const next: Array<Player | 'B' | 'F' | null> = Array(n);
  for (let r = 0; r < n; r++) {
    const source = (r - shift.direction + n) % n;
    next[r] = board[source][shift.index];
  }
  for (let r = 0; r < n; r++) {
    board[r][shift.index] = next[r];
  }
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

function formatOtpSummary(game: GameState): string[] {
  const otp = [];
  if (game.config.doubleMove) {
    const usage = game.powers.doubleMove;
    let status = 'Unused so far.';
    if (usage.X && usage.O) {
      status = 'Both players used it.';
    } else if (usage.X) {
      status = 'You already used it.';
    } else if (usage.O) {
      status = 'AI already used it.';
    }
    otp.push('⚡ Double Move - Place two marks once. ' + status);
  }
  if (game.config.laneShift) {
    const usage = game.powers.laneShift;
    let status = 'Unused so far.';
    if (usage.X && usage.O) {
      status = 'Both players used it.';
    } else if (usage.X) {
      status = 'You already used it.';
    } else if (usage.O) {
      status = 'AI already used it.';
    }
    otp.push('🔀 Lane Shift - Shift a lane once. ' + status);
  }
  if (game.config.bomb) {
    const usage = game.powers.bomb;
    let status = 'Unused so far.';
    if (usage.X && usage.O) {
      status = 'Both players used it.';
    } else if (usage.X) {
      status = 'You already used it.';
    } else if (usage.O) {
      status = 'AI already used it.';
    }
    otp.push('🔥 Bomb - Blast one cell. ' + status);
  }
  return otp;
}

function formatGameModeSummary(game: GameState): string[] {
  const modes = [];
  if (game.config.chaosMode) {
    modes.push('🎲 Chaos - Variants and powers shuffle each game.');
  }
  return modes;
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

export function onAvatarTap() {
  navigateToProfile(false);
}

export function onNavPlay() {
  if (viewModel?.get('navActive') === 'play') {
    return;
  }
  viewModel?.set('navActive', 'play');
  navigateToPlay(true);
}

export function onNavProfile() {
  if (viewModel?.get('navActive') === 'profile') {
    return;
  }
  viewModel?.set('navActive', 'profile');
  navigateToProfile(true);
}

export function onNavAbout() {
  if (viewModel?.get('navActive') === 'about') {
    return;
  }
  viewModel?.set('navActive', 'about');
  navigateToAbout(true);
}
