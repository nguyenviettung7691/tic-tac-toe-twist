import { NavigatedData, Observable, Page } from '@nativescript/core'

import { bindAuthTo } from '~/state/auth-bindings'
import {
  clearAuthError,
  signInWithGoogle,
} from '~/state/auth-store'
import {
  navigateToAbout,
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
  const page = args.object as Page
  const vm = ensureViewModel()
  vm.set('navActive', 'profile')
  vm.set('formError', '')
  page.bindingContext = vm
  clearAuthError()
}

export async function onGoogleTap() {
  clearAuthError()
  setFormError('')
  try {
    const user = await signInWithGoogle()
    if (user) {
      navigateToProfile()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google sign-in failed.'
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
  navigateToProfile(false)
}
