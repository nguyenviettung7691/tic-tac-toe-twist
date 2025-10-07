import { Dialogs, Frame, NavigatedData, Observable, Page } from '@nativescript/core'
import type { GameState, PowerUsage, VariantConfig } from '@ttt/engine'

import { getAuthState } from '~/state/auth-store'
import { deleteMatch, getMatch, type StoredMatch } from '~/state/match-store'
import { queueReplay, startNewGame } from '~/state/game-store'
import { formatReplayEntry } from '~/utils/game-format'
import { navigateToLogin, navigateToProfile } from '~/services/navigation'

let viewModel: Observable | null = null
let currentMatch: StoredMatch | null = null
let currentUserId: string | null = null
let currentPage: Page | null = null

function ensureViewModel() {
  if (!viewModel) {
    viewModel = new Observable()
    viewModel.set('resultLabel', '')
    viewModel.set('summaryLabel', '')
    viewModel.set('dateLabel', '')
    viewModel.set('opponentLabel', '')
    viewModel.set('setupLabel', '')
    viewModel.set('variantsLabel', '')
    viewModel.set('powersLabel', '')
    viewModel.set('movesLabel', '')
    viewModel.set('winningLineLabel', '')
    viewModel.set('winningLineVisible', false)
    viewModel.set('hasReplay', false)
    viewModel.set('replaySteps', [] as string[])
    viewModel.set('isDeleting', false)
  }
  return viewModel
}

function formatDateLabel(iso: string): string {
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) {
    return 'Date unavailable'
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp))
  } catch {
    return new Date(timestamp).toLocaleString()
  }
}

function formatDifficultyLabel(value: StoredMatch['difficulty']): string {
  switch (value) {
    case 'chill':
      return 'Chill'
    case 'sharp':
      return 'Sharp'
    default:
      return 'Balanced'
  }
}

function variantTags(setup: StoredMatch['setup']): string[] {
  const tags: string[] = []
  if (setup.chaosMode) {
    tags.push('Chaos Mode')
  }
  if (setup.gravity) {
    tags.push('Gravity')
  }
  if (setup.wrap) {
    tags.push('Wrap')
  }
  if (setup.misere) {
    tags.push('Misere')
  }
  if (setup.randomBlocks) {
    tags.push('Random Blocks')
  }
  return tags
}

function powerTags(setup: StoredMatch['setup']): string[] {
  const tags: string[] = []
  if (setup.laneShiftPower) {
    tags.push('Lane Shift')
  }
  if (setup.doubleMovePower) {
    tags.push('Double Move')
  }
  if (setup.bombPower) {
    tags.push('Bomb')
  }
  return tags
}

function cloneReplayPowers(powers: PowerUsage | undefined): PowerUsage {
  const base: PowerUsage = {
    doubleMove: { X: false, O: false },
    laneShift: { X: false, O: false },
    bomb: { X: false, O: false },
  }
  if (!powers) {
    return base
  }
  return {
    doubleMove: { ...base.doubleMove, ...powers.doubleMove },
    laneShift: { ...base.laneShift, ...powers.laneShift },
    bomb: { ...base.bomb, ...powers.bomb },
  }
}

function deriveVariantConfig(game: StoredMatch['game'], setup: StoredMatch['setup']): VariantConfig {
  const base: VariantConfig = {
    boardSize: setup.boardSize,
    winLength: setup.winLength,
    misere: setup.misere,
    gravity: setup.gravity,
    wrap: setup.wrap,
    randomBlocks: setup.randomBlocks ? 3 : 0,
    doubleMove: setup.doubleMovePower,
    laneShift: setup.laneShiftPower,
    allowRowColShift: false,
    bomb: setup.bombPower,
    chaosMode: setup.chaosMode,
  }
  return { ...base, ...(game.config ?? {}) }
}

function toGameState(game: StoredMatch['game'], setup: StoredMatch['setup']): GameState {
  return {
    board: (game.board ?? []).map((row) => (Array.isArray(row) ? row.slice() : [])),
    current: game.current === 'O' ? 'O' : 'X',
    config: deriveVariantConfig(game, setup),
    moves: (game.moves ?? []).map((move) => ({ ...move })),
    winner: game.winner ?? null,
    lastMove: game.lastMove ? { ...game.lastMove } : undefined,
    powers: cloneReplayPowers(game.powers),
  }
}

function buildReplaySteps(match: StoredMatch): string[] {
  const moves = match.game.moves ?? []
  const total = moves.length
  if (!total) {
    return []
  }
  return moves.map((move, index) => formatReplayEntry(move, move.player, index + 1, total))
}

function formatResultLabel(match: StoredMatch): string {
  switch (match.outcome) {
    case 'win':
      return 'You won'
    case 'loss':
      return 'You lost'
    default:
      return 'Draw'
  }
}

function formatSummary(match: StoredMatch): string {
  const segments: string[] = []
  const winner = match.resultWinner
  if (!winner || winner === 'Draw') {
    segments.push('Result: Draw')
  } else if (winner === 'X') {
    segments.push('Winner: You (X)')
  } else {
    segments.push('Winner: Opponent (O)')
  }
  segments.push(match.movesCount === 1 ? '1 move' : `${match.movesCount} moves`)
  return segments.join(' · ')
}

function formatOpponent(match: StoredMatch): string {
  if (match.vsAi) {
    return `Opponent: AI (${formatDifficultyLabel(match.difficulty)})`
  }
  return 'Opponent: Human'
}

function formatSetup(setup: StoredMatch['setup']): string {
  return `Board ${setup.boardSize}x${setup.boardSize} | Win length ${setup.winLength}`
}

function formatWinningLine(match: StoredMatch): { text: string; visible: boolean } {
  if (!match.winningLine || match.winningLine.length === 0 || match.outcome === 'draw') {
    return { text: '', visible: false }
  }
  const coords = match.winningLine
    .map(({ r, c }) => `(${r + 1}, ${c + 1})`)
    .join(', ')
  return {
    text: `Winning line: ${coords}`,
    visible: true,
  }
}

function populate(match: StoredMatch, page: Page) {
  currentMatch = match
  const vm = ensureViewModel()
  page.bindingContext = vm
  vm.set('isDeleting', false)

  const setup = match.setup
  vm.set('matchId', match.id)
  vm.set('resultLabel', formatResultLabel(match))
  vm.set('summaryLabel', formatSummary(match))
  vm.set('dateLabel', `Played on ${formatDateLabel(match.createdAtIso)}`)
  vm.set('opponentLabel', formatOpponent(match))
  vm.set('setupLabel', formatSetup(setup))

  const variantLabel = variantTags(setup)
  vm.set('variantsLabel', variantLabel.length ? `Variants: ${variantLabel.join(', ')}` : 'Variants: None')

  const powers = powerTags(setup)
  vm.set('powersLabel', powers.length ? `Powers: ${powers.join(', ')}` : 'Powers: None')

  vm.set('movesLabel', match.movesCount === 1 ? 'Moves played: 1' : `Moves played: ${match.movesCount}`)

  const winningLine = formatWinningLine(match)
  vm.set('winningLineLabel', winningLine.text)
  vm.set('winningLineVisible', winningLine.visible)

  const replaySteps = buildReplaySteps(match)
  vm.set('replaySteps', replaySteps)
  vm.set('hasReplay', replaySteps.length > 0)
}

function failAndExit(message: string) {
  void Dialogs.alert({
    title: 'Match unavailable',
    message,
    okButtonText: 'OK',
  }).finally(() => {
    void goBackToMatches()
  })
}

function goBackToMatches(): boolean {
  const frame = currentPage?.frame ?? Frame.topmost()
  if (frame) {
    const backStack = (frame as { backStack?: unknown[] }).backStack
    const canGoBack =
      typeof (frame as { canGoBack?: () => boolean }).canGoBack === 'function'
        ? (frame as { canGoBack: () => boolean }).canGoBack()
        : Array.isArray(backStack) && backStack.length > 0
    if (canGoBack) {
      frame.goBack()
      return true
    }
  }
  navigateToProfile()
  return false
}

export function onNavigatingTo(args: NavigatedData) {
  const page = args.object as Page
  const vm = ensureViewModel()
  page.bindingContext = vm
  currentPage = page

  const { user } = getAuthState()
  if (!user) {
    navigateToLogin()
    return
  }
  currentUserId = user.uid

  const context = (args.context ?? {}) as { matchId?: string }
  const matchId = context.matchId
  if (!matchId) {
    failAndExit('The selected match could not be found.')
    return
  }

  const match = getMatch(currentUserId, matchId)
  if (!match) {
    failAndExit('The selected match has been removed.')
    return
  }
  populate(match, page)
}

export function onBack() {
  void goBackToMatches()
}

export function onUnloaded() {
  currentPage = null
}

export function onWatchReplay() {
  if (!currentMatch) {
    return
  }
  const game = toGameState(currentMatch.game, currentMatch.setup)
  queueReplay({
    matchId: currentMatch.id,
    createdAtIso: currentMatch.createdAtIso,
    title: currentMatch.vsAi ? 'vs AI match' : 'vs Human match',
    setup: { ...currentMatch.setup },
    game,
  })
  Frame.topmost()?.navigate('game/game-page')
}

export function onStartAgain() {
  if (!currentMatch) {
    return
  }
  startNewGame({ ...currentMatch.setup })
  Frame.topmost()?.navigate('game/game-page')
}

export async function onDeleteMatch() {
  if (!currentUserId || !currentMatch) {
    return
  }
  const vm = ensureViewModel()
  if (vm.get('isDeleting')) {
    return
  }
  const confirmed = await Dialogs.confirm({
    title: 'Delete match',
    message: 'This will remove the saved match and its replay steps. Continue?',
    okButtonText: 'Delete',
    cancelButtonText: 'Cancel',
  })
  if (!confirmed) {
    return
  }
  vm.set('isDeleting', true)
  try {
    const success = await deleteMatch(currentUserId, currentMatch.id)
    if (!success) {
      await Dialogs.alert({
        title: 'Unable to delete',
        message: 'The match could not be deleted. Please try again.',
        okButtonText: 'OK',
      })
      return
    }
    await Dialogs.alert({
      title: 'Match deleted',
      message: 'The match has been removed from your history.',
      okButtonText: 'OK',
    })
    currentMatch = null
    void goBackToMatches()
  } finally {
    vm.set('isDeleting', false)
  }
}
