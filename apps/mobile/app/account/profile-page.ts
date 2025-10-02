import { Dialogs, NavigatedData, Observable, Page } from '@nativescript/core'

import { bindAuthTo } from '~/state/auth-bindings'
import {
  clearAuthError,
  getAuthState,
  signOut,
  updateDisplayName,
} from '~/state/auth-store'
import {
  navigateToAbout,
  navigateToLogin,
  navigateToPlay,
  navigateToProfile,
} from '~/services/navigation'

let viewModel: Observable | null = null
let detachAuth: (() => void) | null = null

function ensureViewModel() {
  if (!viewModel) {
    viewModel = new Observable()
    viewModel.set('navActive', 'profile')
    viewModel.set('formError', '')
    detachAuth = bindAuthTo(viewModel)
  }
  return viewModel
}

function setFormError(message: string) {
  const vm = ensureViewModel()
  vm.set('formError', message)
}

export function onNavigatingTo(args: NavigatedData) {
  const { user } = getAuthState()
  if (!user) {
    navigateToLogin()
    return
  }
  const page = args.object as Page
  const vm = ensureViewModel()
  vm.set('navActive', 'profile')
  vm.set('formError', '')
  page.bindingContext = vm
  clearAuthError()
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
    await signOut()
    navigateToLogin()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign out.'
    setFormError(message)
  }
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
  onEditDisplayName()
}
