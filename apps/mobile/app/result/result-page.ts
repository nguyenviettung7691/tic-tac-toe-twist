import { Frame, NavigatedData, Observable, Page } from '@nativescript/core';

import type { GameState } from '~/state/game-store';
import { getLastResult, getSnapshot, rematch } from '~/state/game-store';

let viewModel: Observable | null = null;

export function onNavigatingTo(args: NavigatedData) {
  const page = args.object as Page;
  viewModel = createViewModel();
  page.bindingContext = viewModel;
  populateViewModel(viewModel);
}

export function onRematch() {
  rematch();
  const frame = Frame.topmost();
  if (frame.canGoBack()) {
    frame.goBack();
  } else {
    frame.navigate('game/game-page');
  }
}

export function onChangeVariants() {
  const frame = Frame.topmost();
  frame.navigate({ moduleName: 'home/home-page', clearHistory: true });
}

function createViewModel() {
  const vm = new Observable();
  vm.set('title', 'Game Over');
  vm.set('summary', 'Start a new match to keep playing.');
  vm.set('variantSummary', '');
  vm.set('difficultyLabel', '');
  vm.set('movesCount', 0);
  return vm;
}

function populateViewModel(vm: Observable) {
  const result = getLastResult();
  const snapshot = getSnapshot();

  if (!result) {
    vm.set('title', 'Start a new game');
    vm.set('summary', 'Pick your variants on the home screen to begin.');
    vm.set('variantSummary', '');
    vm.set('difficultyLabel', '');
    vm.set('movesCount', 0);
    return;
  }

  vm.set('title', winnerTitle(result));
  vm.set('summary', buildSummary(result));
  vm.set('variantSummary', formatVariantSummary(result));
  vm.set('difficultyLabel', formatDifficulty(snapshot.settings.difficulty));
  vm.set('movesCount', result.moves.length);
}

function winnerTitle(result: GameState): string {
  if (result.winner === 'Draw') {
    return "It's a draw!";
  }
  if (result.winner === 'X') {
    return 'Victory!';
  }
  if (result.winner === 'O') {
    return 'Defeat this time';
  }
  return 'Match complete';
}

function buildSummary(result: GameState): string {
  const moves = result.moves.length;
  const turns = moves === 1 ? '1 move' : moves + ' moves';
  return 'Finished after ' + turns + '.';
}
function formatVariantSummary(result: GameState): string {
  const parts: string[] = [];
  if (result.config.gravity) {
    parts.push( 'Gravity'); 
  }
  if (result.config.wrap) {
    parts.push( 'Wrap'); 
  }
  return parts.length ? parts.join( ' | ') : 'Classic rules'; 
}

function formatDifficulty(value: ReturnType<typeof getSnapshot>[ 'settings']['difficulty']): string { 
  switch (value) {
    case  'chill': 
      return  'Played on Chill difficulty'; 
    case  'sharp': 
      return  'Played on Sharp difficulty'; 
    case  'creative': 
      return  'Played on Creative difficulty'; 
    default:
      return  'Played on Balanced difficulty'; 
  }
}

