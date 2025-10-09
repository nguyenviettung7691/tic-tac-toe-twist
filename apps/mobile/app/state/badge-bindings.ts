import { Observable } from '@nativescript/core'

import { subscribeToAuth, type AuthState } from './auth-store'
import { subscribeToAchievements, type AchievementSnapshot } from './achievement-store'

function applyBadgeSnapshot(target: Observable, snapshot: AchievementSnapshot | null) {
  const achievements = snapshot?.achievements ?? []
  const badgeId = snapshot?.badgeId ?? null
  const selected = badgeId ? achievements.find((item) => item.id === badgeId && item.earned) : null
  target.set('badgeIcon', selected?.icon ?? '')
  target.set('badgeVisible', !!selected)
  target.set('badgeSelectedId', selected?.id ?? '')
}

export function bindBadgeTo(target: Observable) {
  let currentUserId: string | null = null
  let detachAchievements: (() => void) | null = null

  const handleAuthChange = (state: AuthState) => {
    const nextUserId = state.user?.uid ?? null
    if (nextUserId === currentUserId) {
      if (!nextUserId) {
        applyBadgeSnapshot(target, null)
      }
      return
    }

    currentUserId = nextUserId
    detachAchievements?.()
    detachAchievements = null

    if (!nextUserId) {
      applyBadgeSnapshot(target, null)
      return
    }

    detachAchievements = subscribeToAchievements(nextUserId, (snapshot) => {
      applyBadgeSnapshot(target, snapshot)
    })
  }

  target.set('badgeIcon', '')
  target.set('badgeVisible', false)
  target.set('badgeSelectedId', '')

  const detachAuth = subscribeToAuth(handleAuthChange)

  return () => {
    detachAchievements?.()
    detachAchievements = null
    detachAuth()
  }
}
