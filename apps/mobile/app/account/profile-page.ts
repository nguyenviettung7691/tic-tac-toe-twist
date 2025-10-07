import { Dialogs, NavigatedData, Observable, Page, ViewBase } from '@nativescript/core'
import type { GestureEventData } from '@nativescript/core'

import { bindAuthTo } from '~/state/auth-bindings'
import {
  clearAuthError,
  getAuthState,
  signOut,
  updateDisplayName,
} from '~/state/auth-store'
import { subscribeToMatches, type StoredMatch } from '~/state/match-store'
import {
  navigateToAbout,
  navigateToLogin,
  navigateToMatchDetail,
  navigateToPlay,
  navigateToProfile,
} from '~/services/navigation'

let viewModel: Observable | null = null
let detachAuth: (() => void) | null = null
let detachMatches: (() => void) | null = null
let matchesUserId: string | null = null
let authWatcherAttached = false
let authChangeHandler: ((args: any) => void) | null = null

interface MatchCardVM {
  id: string
  outcomeLabel: string
  outcomeClass: 'win' | 'loss' | 'draw'
  cssClass: string
  opponentLabel: string
  setupLabel: string
  dateLabel: string
  movesLabel: string
  variantsLabel: string
  hidden: boolean
}

interface MatchRowVM {
  left: MatchCardVM
  right: MatchCardVM
}

function ensureViewModel() {
  if (!viewModel) {
    viewModel = new Observable()
    viewModel.set('navActive', 'profile')
    viewModel.set('formError', '')
    viewModel.set('matchesEmpty', true)
    viewModel.set('matchesCount', 0)
    viewModel.set('matchRows', [] as MatchRowVM[])
  }
  if (!detachAuth) {
    detachAuth = bindAuthTo(viewModel)
  }
  if (!authWatcherAttached) {
    authWatcherAttached = true
    authChangeHandler = (args) => {
      if (!args || args.propertyName !== 'authLoggedIn') {
        return
      }
      const loggedIn = !!args.value
      console.log('[profile] authLoggedIn changed', { loggedIn })
      if (!loggedIn) {
        navigateToLogin()
      }
    }
    viewModel.on(Observable.propertyChangeEvent, authChangeHandler)
  }
  return viewModel
}

function setFormError(message: string) {
  const vm = ensureViewModel()
  vm.set('formError', message)
}

function clearMatches() {
  const vm = ensureViewModel()
  vm.set('matchRows', [] as MatchRowVM[])
  vm.set('matchesEmpty', true)
  vm.set('matchesCount', 0)
}

function formatDateLabel(iso: string): string {
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) {
    return 'Unknown date'
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

function collectVariantTags(setup: StoredMatch['setup']): string[] {
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
  if (setup.laneShiftPower) {
    tags.push('Lane Shift Power')
  }
  if (setup.doubleMovePower) {
    tags.push('Double Move Power')
  }
  if (setup.bombPower) {
    tags.push('Bomb Power')
  }
  return tags
}

function buildMatchCard(match: StoredMatch): MatchCardVM {
  const opponentLabel = match.vsAi
    ? `vs AI (${formatDifficultyLabel(match.difficulty)})`
    : 'vs Human'
  const setup = match.setup
  const setupLabel = `Board ${setup.boardSize}x${setup.boardSize} | Win ${setup.winLength}`
  const movesLabel = match.movesCount === 1 ? '1 move' : `${match.movesCount} moves`
  const variants = collectVariantTags(setup)
  const variantsLabel = variants.length ? `Variants: ${variants.join(', ')}` : 'Variants: None'

  let outcomeLabel = 'Draw'
  if (match.outcome === 'win') {
    outcomeLabel = 'You won'
  } else if (match.outcome === 'loss') {
    outcomeLabel = 'You lost'
  }

  return {
    id: match.id,
    outcomeLabel,
    outcomeClass: match.outcome,
    cssClass: `match-card match-card--${match.outcome}`,
    opponentLabel,
    setupLabel,
    dateLabel: formatDateLabel(match.createdAtIso),
    movesLabel,
    variantsLabel,
    hidden: false,
  }
}

function createEmptyCard(): MatchCardVM {
  return {
    id: '',
    outcomeLabel: '',
    outcomeClass: 'draw',
    cssClass: 'match-card match-card--hidden',
    opponentLabel: '',
    setupLabel: '',
    dateLabel: '',
    movesLabel: '',
    variantsLabel: '',
    hidden: true,
  }
}

function buildMatchRows(cards: MatchCardVM[]): MatchRowVM[] {
  const rows: MatchRowVM[] = []
  for (let index = 0; index < cards.length; index += 2) {
    rows.push({
      left: cards[index],
      right: cards[index + 1] ?? createEmptyCard(),
    })
  }
  return rows
}

function updateMatchBindings(matches: StoredMatch[]) {
  const vm = ensureViewModel()
  const cards = matches.map(buildMatchCard)
  console.log('[profile] Matches updated', {
    count: matches.length,
    ids: matches.map((m) => m.id),
  })
  vm.set('matchesCount', cards.length)
  vm.set('matchesEmpty', cards.length === 0)
  vm.set('matchRows', buildMatchRows(cards))
}

function attachMatches(userId: string) {
  if (!userId) {
    console.warn('[profile] attachMatches called without userId')
    clearMatches()
    detachMatches?.()
    detachMatches = null
    matchesUserId = null
    return
  }
  if (matchesUserId === userId && detachMatches) {
    return
  }
  detachMatches?.()
  clearMatches()
  matchesUserId = userId
  console.log('[profile] Subscribing to matches', { userId })
  detachMatches = subscribeToMatches(userId, updateMatchBindings)
}

export function onNavigatingTo(args: NavigatedData) {
  const { user } = getAuthState()
  if (!user) {
    console.warn('[profile] Navigated to profile without auth user, redirecting to login')
    navigateToLogin()
    return
  }
  const page = args.object as Page
  const vm = ensureViewModel()
  vm.set('navActive', 'profile')
  vm.set('formError', '')
  page.bindingContext = vm
  clearAuthError()
  console.log('[profile] Navigated to profile', {
    uid: user.uid,
    providers: user.providerIds,
  })
  attachMatches(user.uid)
}

export async function onEditDisplayName() {
  const state = getAuthState()
  if (!state.user) {
    navigateToLogin()
    return
  }
  const currentName = state.user.displayName ?? ''
  const result = await Dialogs.prompt({
    title: 'Update display name',
    defaultText: currentName,
    okButtonText: 'Save',
    cancelButtonText: 'Cancel',
  })
  if (!result.result) {
    return
  }
  const trimmed = (result.text ?? '').trim()
  if (!trimmed) {
    setFormError('Display name cannot be empty.')
    return
  }
  try {
    await updateDisplayName(trimmed)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update display name.'
    setFormError(message)
  }
}

export async function onSignOut() {
  try {
    const stateBefore = getAuthState()
    console.log('[profile] Sign out requested', {
      user: stateBefore.user ? { uid: stateBefore.user.uid, providers: stateBefore.user.providerIds } : null,
      matchesCount: ensureViewModel().get('matchesCount'),
    })
    await signOut()
    console.log('[profile] Sign out complete, navigating to login')
    detachMatches?.()
    detachMatches = null
    matchesUserId = null
    clearMatches()
    navigateToLogin()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign out.'
    console.error('[profile] Sign out failed', error)
    setFormError(message)
    ensureViewModel().set('formError', message)
  }
}

export function onMatchCardTap(args: GestureEventData) {
  const target = args.object as ViewBase | undefined
  const context = target?.bindingContext as MatchCardVM | null | undefined
  if (!context || context.hidden || !context.id) {
    return
  }
  navigateToMatchDetail(context.id)
}

export function onNavPlay() {
  const vm = ensureViewModel()
  if (vm.get('navActive') === 'play') {
    return
  }
  vm.set('navActive', 'play')
  navigateToPlay(true)
}

export function onNavProfile() {
  const vm = ensureViewModel()
  if (vm.get('navActive') === 'profile') {
    return
  }
  vm.set('navActive', 'profile')
  navigateToProfile(true)
}

export function onNavAbout() {
  const vm = ensureViewModel()
  if (vm.get('navActive') === 'about') {
    return
  }
  vm.set('navActive', 'about')
  navigateToAbout(true)
}

export function onAvatarTap() {
  // onEditDisplayName()
}

export function onUnloaded() {
  detachMatches?.()
  detachMatches = null
  matchesUserId = null
  if (authWatcherAttached && viewModel && authChangeHandler) {
    viewModel.off(Observable.propertyChangeEvent, authChangeHandler)
    authWatcherAttached = false
    authChangeHandler = null
  }
  if (detachAuth) {
    detachAuth()
    detachAuth = null
  }
}
