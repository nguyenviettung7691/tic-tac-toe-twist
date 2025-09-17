
import {
  Dialogs,
  EventData,
  Frame,
  GestureEventData,
  NavigatedData,
  Page,
  Slider,
} from '@nativescript/core';

import { startNewGame } from '~/state/game-store';

import { HomeViewModel, type VariantOptionVm } from './home-view-model';

let viewModel: HomeViewModel | null = null;

export function onNavigatingTo(args: NavigatedData) {
  const page = args.object as Page;
  viewModel = viewModel ?? new HomeViewModel();
  page.bindingContext = viewModel;
}

export function onInfoTap() {
  Dialogs.alert({
    title: 'About',
    message:
      'Tic-Tac-Toe Twist lets you explore creative variants with shared engine rules and an adaptive AI opponent. Mix and match twists, then hit Start to play instantly.',
    okButtonText: 'Close',
  });
}

export async function onSelectBoard(args: GestureEventData) {
  if (!viewModel) {
    return;
  }
  const tile = args.object as any;
  const context = tile.bindingContext as { index: number };
  viewModel.selectBoardSize(context.index);
  await animateTap(tile);
}

export async function onSelectDifficulty(args: GestureEventData) {
  if (!viewModel) {
    return;
  }
  const chip = args.object as any;
  const context = chip.bindingContext as { index: number };
  viewModel.selectDifficulty(context.index);
  await animateTap(chip);
}

export async function onToggleVariant(args: GestureEventData) {
  if (!viewModel) {
    return;
  }
  const tile = args.object as any;
  const context = tile.bindingContext as VariantOptionVm;
  viewModel.toggleVariant(context.key);
  await animateTap(tile);
}

export function onWinLengthChanged(args: EventData) {
  if (!viewModel) {
    return;
  }
  const slider = args.object as Slider;
  viewModel.setWinLength(slider.value);
}

export function onAutoWinLength() {
  viewModel?.setAutoWinLength();
}

export function onHowToPlay() {
  Dialogs.alert({
    title: 'How to play',
    message:
      'Line up the required number of marks before the AI does. Activate Gravity to let marks drop, Wrap edges to connect across the board, and switch up the difficulty to suit your mood.',
    okButtonText: 'Got it',
  });
}

export function onStartGame() {
  if (!viewModel) {
    viewModel = new HomeViewModel();
  }
  const setup = viewModel.getSetup();
  startNewGame(setup);
  Frame.topmost().navigate('game/game-page');
}

async function animateTap(target: any) {
  if (!target || typeof target.animate !== 'function') {
    return;
  }
  try {
    await target.animate({ scale: { x: 0.94, y: 0.94 }, duration: 80, curve: 'easeOut' });
    await target.animate({ scale: { x: 1, y: 1 }, duration: 120, curve: 'spring' });
  } catch (err) {
    // best effort animation
  }
}
