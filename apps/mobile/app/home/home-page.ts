
import {
  Dialogs,
  Frame,
  GestureEventData,
  NavigatedData,
  Page,
  CoreTypes,
  EventData,
  Switch
} from '@nativescript/core';

import { startNewGame } from '~/state/game-store';

import { HomeViewModel, type PowerOptionVm, type VariantOptionVm } from './home-view-model';

let viewModel: HomeViewModel | null = null;

export function onNavigatingTo(args: NavigatedData) {
  const page = args.object as Page;
  viewModel = viewModel ?? new HomeViewModel();
  page.bindingContext = viewModel;
}

export function onWinLengthInfo() {
  Dialogs.alert({
    title: 'Win Length',
    message: 'Choose how many in a row wins the game.\nMinium is 3-in-a-row.\nMaximum is limited by board size.',
    okButtonText: 'Close',
  });
}
export function onVariantsInfo() {
  Dialogs.alert({
    title: 'Variants',
    message: 'Players can enable multiple toggles at game start; conflicts are flagged.\nVariants can be a Rule or a One-Time-Power.\nRules are applied throughout the game.\nPlayers can trade their turn for a One-Time-Power.',
    okButtonText: 'Close',
  });
}
export function onRulesInfo() {
  Dialogs.alert({
    title: 'Rules',
    message: 'Gravity - Pieces fall to the lowest empty cell in the chosen column. (Connect Four style)\nWrap - Lines can wrap across edges (e.g., right edge continues at left).\nMisere - You lose if you make a required win length row. (try not to win!)\nRandom blocks - 1–3 cells blocked at start; cannot play there.\n\nAnimated guides coming soon for each variant.',
    okButtonText: 'Close',
  });
}
export function onOTPInfo(){
  Dialogs.alert({
    title: 'One-Time-Powers',
    message: 'Double Move - On the same turn, place 2 marks that are not in 1 cell space next to your other marks.\n\nAnimated guides coming soon for each power.',
    okButtonText: 'Close',
  });
}
export function onOpponentInfo() {
  Dialogs.alert({
    title: 'Opponent',
    message: 'Currently only AI opponent is supported.\nHuman vs Human coming soon.',
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

export async function onSelectWinLength(args: GestureEventData) {
  if (!viewModel) {
    return;
  }
  const target = args.object as any;
  const context = target?.bindingContext as { value: number; enabled: boolean } | undefined;
  if (!context || !context.enabled) {
    return;
  }
  viewModel.setWinLength(context.value);
  await animateTap(target);
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

export async function onTogglePower(args: GestureEventData) {
  if (!viewModel) {
    return;
  }
  const tile = args.object as any;
  const context = tile.bindingContext as PowerOptionVm;
  if (context.disabled) {
    return;
  }
  viewModel.togglePower(context.key);
  await animateTap(tile);
}

export function onPowerToggleChange(args: EventData) {
  if (!viewModel) {
    return;
  }
  const control = args.object as Switch;
  const context = control.bindingContext as PowerOptionVm | undefined;
  if (!context || context.disabled) {
    control.checked = false;
    return;
  }
  const desired = control.checked;
  const current = !!viewModel.get(context.key);
  if (current === desired) {
    return;
  }
  viewModel.togglePower(context.key, desired);
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
