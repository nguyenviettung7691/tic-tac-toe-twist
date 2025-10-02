import { Observable } from '@nativescript/core'

import type { AuthState, AuthUser } from './auth-store'
import { subscribeToAuth } from './auth-store'

const FALLBACK_INITIAL = 'U'

function computeInitial(user: AuthUser | null): string {
  if (!user) {
    return FALLBACK_INITIAL
  }
  const basis = user.displayName?.trim() || user.email?.trim() || ''
  if (!basis) {
    return FALLBACK_INITIAL
  }
  const firstLetter = basis.charAt(0)?.toUpperCase()
  return firstLetter || FALLBACK_INITIAL
}

function providerLabels(user: AuthUser | null): string[] {
  if (!user || !Array.isArray(user.providerIds)) {
    return []
  }
  const map: Record<string, string> = {
    password: 'Email & Password',
    'google.com': 'Google',
    'apple.com': 'Apple',
  }
  return user.providerIds
    .map((id) => map[id] || id)
    .filter((label, index, arr) => label && arr.indexOf(label) === index)
}

export function bindAuthTo(target: Observable) {
  const update = (state: AuthState) => {
    target.set('authState', state)
    target.set('authUser', state.user)
    target.set('authLoading', state.loading)
    target.set('authError', state.error)
    target.set('authLoggedIn', !!state.user)
    target.set('authAvatarUrl', state.user?.photoURL ?? '')
    target.set('authInitial', computeInitial(state.user))
    target.set('authProviderLabels', providerLabels(state.user))
    const displayName = state.user?.displayName?.trim() || state.user?.email || 'Player'
    target.set('authDisplayName', displayName)
    target.set('authEmail', state.user?.email ?? '')
  }

  return subscribeToAuth(update)
}
