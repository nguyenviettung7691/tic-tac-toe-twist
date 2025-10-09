import { NavigatedData, Observable, Page } from '@nativescript/core'

import { bindAuthTo } from '~/state/auth-bindings'
import { bindBadgeTo } from '~/state/badge-bindings'
import { navigateToPlay, navigateToProfile, navigateToAbout } from '~/services/navigation'

let viewModel: Observable | null = null
let detachAuth: (() => void) | null = null
let detachBadge: (() => void) | null = null

function ensureViewModel() {
  if (!viewModel) {
    viewModel = new Observable()
    viewModel.set('navActive', 'about')
  }
  if (!detachAuth) {
    detachAuth = bindAuthTo(viewModel)
  }
  if (!detachBadge) {
    detachBadge = bindBadgeTo(viewModel)
  }
  return viewModel
}

export function onNavigatingTo(args: NavigatedData) {
  const page = args.object as Page
  const vm = ensureViewModel()
  vm.set('navActive', 'about')
  page.bindingContext = vm
}

export function onNavigatingFrom() {
  detachAuth?.()
  detachAuth = null
  detachBadge?.()
  detachBadge = null
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
