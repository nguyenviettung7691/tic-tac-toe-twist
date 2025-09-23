
import {
  Dialogs,
  Frame,
  GestureEventData,
  NavigatedData,
  Page,
  PropertyChangeData,
  ListPicker,
  CoreTypes,
  EventData,
  Switch
} from '@nativescript/core';

import { startNewGame } from '~/state/game-store';

import { HomeViewModel, type VariantOptionVm } from './home-view-model';

let viewModel: HomeViewModel | null = null;

export function onNavigatingTo(args: NavigatedData) {
  const page = args.object as Page;
  viewModel = viewModel ?? new HomeViewModel();
  page.bindingContext = viewModel;
}

export function onWinLengthInfo() {
  Dialogs.alert({
    title: 'Win Length',
    message: 'Choose how many in a row wins the game.\nSlide up or down to select.\nOptions limited by board size.',
    okButtonText: 'Close',
  });
}

export function onVariantsInfo() {
  Dialogs.alert({
    title: 'Variants',
    message: 'Gravity — marks fall to the lowest empty cell.\nWrap — lines connect across opposite edges.\nMisere — completing the win line hands victory to your opponent.\nRandom blocks — 1-3 cells start blocked.\n\nAnimated guides coming soon for each variant.',
    okButtonText: 'Close',
  });
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

export function onVariantToggleChange(args: EventData) {
  if (!viewModel) {
    return;
  }
  const control = args.object as Switch;
  const context = control.bindingContext as VariantOptionVm | undefined;
  if (!context) {
    return;
  }
  const desired = control.checked;
  const current = !!viewModel.get(context.key);
  if (current === desired) {
    return;
  }
  viewModel.toggleVariant(context.key, desired);
}

export function onWinLengthChanged(args: PropertyChangeData) {
  if (!viewModel) {
    return;
  }
  const picker = args.object as ListPicker;
  viewModel.setWinLength(picker.items[picker.selectedIndex] as number);
}

export function onHowToPlay() {
  Dialogs.alert({
    title: 'ℹ️ How to play',
    message:
      'Line up the required number of marks before the AI does. Enable as well as mix and match variants to add some twists. Switch up the difficulty to suit your mood.',
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
  await target.animate({ scale: { x: 0.94, y: 0.94 }, opacity: 0.9, duration: 80, curve: CoreTypes.AnimationCurve.easeIn });
  await target.animate({ scale: { x: 1, y: 1 }, opacity: 1, duration: 120, curve: CoreTypes.AnimationCurve.easeOut });
}
