import { Frame, NavigationEntry } from '@nativescript/core'

import { getAuthState } from '~/state/auth-store'

function isCurrent(moduleName: string) {
  const frame = Frame.topmost()
  const current = frame?.currentEntry?.moduleName
  return current === moduleName
}

function navigate(entry: NavigationEntry) {
  const frame = Frame.topmost()
  if (!frame) {
    console.warn('[nav] No frame available for navigation', entry)
    return
  }
  frame.navigate(entry)
}

export function navigateToPlay(fromNav = false) {
  if (fromNav && isCurrent('home/home-page')) {
    return
  }
  navigate({
    moduleName: 'home/home-page',
    clearHistory: fromNav,
    animated: fromNav,
    transition: { name: 'fade' },
  })
}

export function navigateToProfile(fromNav = false) {
  const { user } = getAuthState()
  const target = user ? 'account/profile-page' : 'account/login-page'
  if (fromNav && isCurrent(target)) {
    return
  }
  navigate({
    moduleName: target,
    clearHistory: fromNav,
    animated: fromNav,
    transition: { name: 'fade' },
  })
}

export function navigateToLogin() {
  navigate({
    moduleName: 'account/login-page',
    animated: true,
    transition: { name: 'fade' },
  })
}

export function navigateToAbout(fromNav = false) {
  if (fromNav && isCurrent('about/about-page')) {
    return
  }
  navigate({
    moduleName: 'about/about-page',
    clearHistory: fromNav,
    animated: true,
    transition: { name: 'fade' },
  })
}
