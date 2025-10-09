import { ApplicationSettings } from '@nativescript/core'
import '@nativescript/firebase-firestore'
import { firebase } from '@nativescript/firebase-core'
import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from '@nativescript/firebase-firestore'
import type { Player } from '@ttt/engine'

import type { StoredMatch } from './match-store'
import { showAlert, showToast } from '~/services/notifier'
import { initFirebase } from '~/services/firebase'

const STORAGE_KEY = 'ttt.achievements.v1'
const VARIANT_EXPLORER_TARGET = 5
const GRAVITY_WIN_TARGET = 5
const MISERE_WIN_TARGET = 5
const CHAOS_WIN_TARGET = 5
const BOARD_MASTER_TARGET = 4
const POWER_TRIFECTA_TARGET = 3
const MARATHONER_TARGET = 25

type AchievementDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Legendary'

export interface AchievementDefinition {
  id: string
  title: string
  description: string
  icon: string
  difficulty: AchievementDifficulty
  target: number
}

export interface AchievementProgress {
  id: string
  title: string
  description: string
  icon: string
  difficulty: AchievementDifficulty
  progress: number
  target: number
  earned: boolean
  earnedAtIso: string | null
  updatedAtIso: string
}

interface StoredAchievementEntry {
  progress: number
  target: number
  earned: boolean
  earnedAtIso: string | null
  updatedAtIso: string
}

type UserAchievementState = Record<string, StoredAchievementEntry>
interface UserAchievementBundle {
  entries: UserAchievementState
  badgeId: string | null
  updatedAtIso: string
}

export interface AchievementSnapshot {
  achievements: AchievementProgress[]
  badgeId: string | null
}

interface AchievementCache {
  [userId: string]: UserAchievementBundle
}

const definitions: AchievementDefinition[] = [
  {
    id: 'first_win',
    title: 'First Win',
    description: 'Secure your very first victory in Tic-Tac-Toe Twist.',
    icon: '\u2B50',
    difficulty: 'Easy',
    target: 1,
  },
  {
    id: 'flawless_victory',
    title: 'Flawless',
    description: 'Win a match without using any special powers.',
    icon: '\uD83E\uDDFC',
    difficulty: 'Medium',
    target: 1,
  },
  {
    id: 'fork_master',
    title: 'Fork Master',
    description: 'Win a match after using a double-move to split the defense.',
    icon: '\uD83C\uDF74',
    difficulty: 'Hard',
    target: 1,
  },
  {
    id: 'center_skeptic',
    title: 'Center Skeptic',
    description: 'Win on an odd board without ever taking the center square.',
    icon: '\uD83C\uDFAF',
    difficulty: 'Medium',
    target: 1,
  },
  {
    id: 'win_streak_3',
    title: 'Streak 3',
    description: 'Build a winning streak of three matches.',
    icon: '\uD83D\uDD25',
    difficulty: 'Medium',
    target: 3,
  },
  {
    id: 'win_streak_5',
    title: 'Streak 5',
    description: 'Keep the momentum going for five straight wins.',
    icon: '\u26A1',
    difficulty: 'Hard',
    target: 5,
  },
  {
    id: 'win_streak_10',
    title: 'Streak 10',
    description: 'Achieve a legendary streak of ten consecutive wins.',
    icon: '\uD83D\uDC51',
    difficulty: 'Legendary',
    target: 10,
  },
  {
    id: 'variant_explorer',
    title: 'Variant Explorer',
    description: 'Play matches with every major rules variant at least once.',
    icon: '\uD83E\uDDED',
    difficulty: 'Medium',
    target: VARIANT_EXPLORER_TARGET,
  },
  {
    id: 'gravity_guru',
    title: 'Gravity Guru',
    description: 'Win five matches with Gravity enabled.',
    icon: '\uD83C\uDF0C',
    difficulty: 'Medium',
    target: GRAVITY_WIN_TARGET,
  },
  {
    id: 'misere_mindset',
    title: 'Misere Mindset',
    description: 'Win five Misere matches—upside-down victories count.',
    icon: '\uD83E\uDDE0',
    difficulty: 'Hard',
    target: MISERE_WIN_TARGET,
  },
  {
    id: 'chaos_wrangler',
    title: 'Chaos Wrangler',
    description: 'Win five matches while Chaos Mode is active.',
    icon: '\uD83C\uDF00',
    difficulty: 'Hard',
    target: CHAOS_WIN_TARGET,
  },
  {
    id: 'board_master',
    title: 'Board Master',
    description: 'Win on every available board size.',
    icon: '\uD83D\uDCD0',
    difficulty: 'Hard',
    target: BOARD_MASTER_TARGET,
  },
  {
    id: 'power_trifecta',
    title: 'Power Trifecta',
    description: 'Win matches after using each special power at least once.',
    icon: '\uD83D\uDCA1',
    difficulty: 'Hard',
    target: POWER_TRIFECTA_TARGET,
  },
  {
    id: 'marathoner',
    title: 'Match Marathoner',
    description: 'Log twenty-five completed matches.',
    icon: '\uD83C\uDFC3',
    difficulty: 'Medium',
    target: MARATHONER_TARGET,
  },
]

const ACHIEVEMENT_STATE_COLLECTION = 'state'
const ACHIEVEMENT_DOC_ID = 'achievements'
const remoteSubscriptions = new Map<string, () => void>()
const remoteSyncDisabled = new Set<string>()
const ensuredUserDocs = new Set<string>()
const pendingRemoteWrites = new Map<string, string>()
const lastRemoteSnapshots = new Map<string, string>()
type AchievementListener = (snapshot: AchievementSnapshot) => void
const listeners = new Map<string, Set<AchievementListener>>()
let cache: AchievementCache | null = null
let firestoreInstance: Firestore | null = null

const POWER_KEYS = ['doubleMove', 'laneShift', 'bomb'] as const
const VARIANT_KEYS = [
  { id: 'gravity', label: 'Gravity', predicate: (match: StoredMatch) => !!match.setup.gravity },
  { id: 'wrap', label: 'Wrap', predicate: (match: StoredMatch) => !!match.setup.wrap },
  { id: 'misere', label: 'Misere', predicate: (match: StoredMatch) => !!match.setup.misere },
  { id: 'chaos', label: 'Chaos', predicate: (match: StoredMatch) => !!match.setup.chaosMode },
  { id: 'randomBlocks', label: 'Random Blocks', predicate: (match: StoredMatch) => !!match.setup.randomBlocks },
]

interface AchievementUpdateOptions {
  source?: 'initial' | 'update' | 'sync'
}

interface DerivedStats {
  matchesCount: number
  latestIso: string
  firstWinAt: string | null
  winCount: number
  flawlessWins: number
  flawlessFirstAt: string | null
  doubleMoveWins: number
  doubleMoveFirstAt: string | null
  centerSkepticWins: number
  centerSkepticFirstAt: string | null
  longestWinStreak: number
  streakMilestones: Map<number, string>
  variantPlays: Set<string>
  variantMilestones: Map<number, string>
  gravityWins: number
  gravityEarnedAt: string | null
  misereWins: number
  misereEarnedAt: string | null
  chaosWins: number
  chaosEarnedAt: string | null
  boardSizesWon: Set<number>
  boardMasterEarnedAt: string | null
  powerWins: Set<typeof POWER_KEYS[number]>
  powerTrifectaEarnedAt: string | null
  marathonerEarnedAt: string | null
}

function ensureCache(): AchievementCache {
  if (cache) {
    return cache
  }
  const raw = ApplicationSettings.getString(STORAGE_KEY)
  if (!raw) {
    cache = Object.create(null)
    return cache
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed && typeof parsed === 'object') {
      const normalized: AchievementCache = Object.create(null)
      Object.keys(parsed).forEach((userId) => {
        normalized[userId] = normalizeBundle(parsed[userId])
      })
      cache = normalized
    } else {
      cache = Object.create(null)
    }
  } catch (error) {
    console.warn('[achievements] Failed to parse stored achievement state; resetting.', error)
    cache = Object.create(null)
  }
  return cache!
}

function persist() {
  try {
    ApplicationSettings.setString(STORAGE_KEY, JSON.stringify(ensureCache()))
  } catch (error) {
    console.error('[achievements] Unable to persist state', error)
  }
}

function cloneEntry(entry: StoredAchievementEntry): StoredAchievementEntry {
  return {
    progress: entry.progress,
    target: entry.target,
    earned: entry.earned,
    earnedAtIso: entry.earnedAtIso,
    updatedAtIso: entry.updatedAtIso,
  }
}

function cloneState(state: UserAchievementState): UserAchievementState {
  const copy: UserAchievementState = {}
  Object.keys(state).forEach((key) => {
    copy[key] = cloneEntry(state[key])
  })
  return copy
}

function cloneBundle(bundle: UserAchievementBundle): UserAchievementBundle {
  return {
    entries: cloneState(bundle.entries),
    badgeId: bundle.badgeId,
    updatedAtIso: bundle.updatedAtIso,
  }
}

function createEmptyBundle(): UserAchievementBundle {
  return {
    entries: Object.create(null),
    badgeId: null,
    updatedAtIso: new Date().toISOString(),
  }
}

function normalizeBundle(raw: unknown): UserAchievementBundle {
  if (!raw || typeof raw !== 'object') {
    return createEmptyBundle()
  }
  const source = raw as Record<string, unknown>
  const entriesRaw = source.entries ?? raw
  const badgeValue = source.badgeId
  const badgeId = typeof badgeValue === 'string' && badgeValue ? badgeValue : null
  const updatedAtIso =
    typeof source.updatedAtIso === 'string' && source.updatedAtIso ? (source.updatedAtIso as string) : new Date().toISOString()
  return {
    entries: sanitizeEntries(entriesRaw),
    badgeId,
    updatedAtIso,
  }
}

function sanitizeEntries(raw: unknown): UserAchievementState {
  if (!raw || typeof raw !== 'object') {
    return Object.create(null)
  }
  const input = raw as Record<string, unknown>
  const state: UserAchievementState = Object.create(null)
  Object.keys(input).forEach((key) => {
    const value = input[key]
    if (!value || typeof value !== 'object') {
      return
    }
    const parsed = value as Record<string, unknown>
    const progress = Number(parsed.progress)
    const target = Number(parsed.target)
    const updatedAtIso =
      typeof parsed.updatedAtIso === 'string' && parsed.updatedAtIso
        ? (parsed.updatedAtIso as string)
        : new Date().toISOString()
    const earnedAtIso =
      typeof parsed.earnedAtIso === 'string' && parsed.earnedAtIso ? (parsed.earnedAtIso as string) : null
    state[key] = buildEntry(progress, target, earnedAtIso, updatedAtIso)
  })
  return state
}

function getUserBundle(userId: string): UserAchievementBundle {
  const state = ensureCache()
  const existing = state[userId]
  if (existing) {
    return cloneBundle(existing)
  }
  return createEmptyBundle()
}

function setUserBundle(userId: string, bundle: UserAchievementBundle) {
  const root = ensureCache()
  root[userId] = cloneBundle(bundle)
  persist()
}

function toSnapshot(bundle: UserAchievementBundle): AchievementSnapshot {
  const achievements = definitions.map((definition) => {
    const stored = bundle.entries[definition.id]
    const safeProgress = stored ? stored.progress : 0
    const safeTarget = stored ? stored.target : definition.target
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      icon: definition.icon,
      difficulty: definition.difficulty,
      progress: safeProgress,
      target: safeTarget,
      earned: stored ? stored.earned : false,
      earnedAtIso: stored ? stored.earnedAtIso : null,
      updatedAtIso: stored ? stored.updatedAtIso : new Date().toISOString(),
    }
  })
  return {
    achievements,
    badgeId: bundle.badgeId,
  }
}

function statesEqual(a: UserAchievementState, b: UserAchievementState): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    const left = a[key]
    const right = b[key]
    if (!left && !right) {
      continue
    }
    if (!left || !right) {
      return false
    }
    if (
      left.progress !== right.progress ||
      left.target !== right.target ||
      left.earned !== right.earned ||
      left.earnedAtIso !== right.earnedAtIso ||
      left.updatedAtIso !== right.updatedAtIso
    ) {
      return false
    }
  }
  return true
}

async function getFirestore(): Promise<Firestore | null> {
  if (firestoreInstance) {
    return firestoreInstance
  }
  try {
    await initFirebase()
    const fb = firebase?.()
    if (!fb || typeof (fb as { firestore?: () => Firestore }).firestore !== 'function') {
      console.warn('[achievements] Firestore is not available on this platform')
      return null
    }
    firestoreInstance = (fb as { firestore: () => Firestore }).firestore()
    return firestoreInstance
  } catch (error) {
    console.error('[achievements] Failed to obtain Firestore instance', error)
    return null
  }
}

async function ensureUserRootDocument(db: Firestore, userId: string): Promise<boolean> {
  if (!userId) {
    return false
  }
  if (remoteSyncDisabled.has(userId)) {
    return false
  }
  if (ensuredUserDocs.has(userId)) {
    return true
  }
  try {
    const docRef = db.collection('users').doc(userId)
    const snapshot = await docRef.get()
    if (!snapshot.exists) {
      await docRef.set({
        ownerUid: userId,
        userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else {
      const existing = snapshot.data() ?? {}
      const payload: Record<string, unknown> = {
        ownerUid: userId,
        userId,
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (!existing || typeof existing !== 'object' || !existing.createdAt) {
        payload.createdAt = FieldValue.serverTimestamp()
      }
      await docRef.update(payload)
    }
    ensuredUserDocs.add(userId)
    return true
  } catch (error) {
    if (isPermissionDenied(error)) {
      const detail = formatFirestoreError(error)
      console.warn('[achievements] Firestore denied access when ensuring user document', {
        userId,
        detail,
        code: (error as { code?: string | number })?.code ?? null,
      })
      remoteSyncDisabled.add(userId)
      return false
    }
    const detail = formatFirestoreError(error)
    console.error('[achievements] Failed to ensure user document', {
      userId,
      detail,
      error,
    })
    return false
  }
}

async function getAchievementDocument(userId: string): Promise<DocumentReference<DocumentData> | null> {
  if (!userId) {
    return null
  }
  if (remoteSyncDisabled.has(userId)) {
    return null
  }
  const db = await getFirestore()
  if (!db) {
    return null
  }
  const ensured = await ensureUserRootDocument(db, userId)
  if (!ensured) {
    return null
  }
  return db.collection(`users/${userId}/${ACHIEVEMENT_STATE_COLLECTION}`).doc(ACHIEVEMENT_DOC_ID)
}

function sanitizeRemoteEntry(raw: unknown): StoredAchievementEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const source = raw as Record<string, unknown>
  const progressValue = Number(source.progress)
  const targetValue = Number(source.target)
  const updatedAtIso =
    typeof source.updatedAtIso === 'string' && source.updatedAtIso ? source.updatedAtIso : new Date().toISOString()
  const earnedAtIso = typeof source.earnedAtIso === 'string' && source.earnedAtIso ? source.earnedAtIso : null
  const entry = buildEntry(progressValue, targetValue, earnedAtIso, updatedAtIso)
  return entry
}

function sanitizeRemoteState(data: DocumentData | undefined): UserAchievementBundle | null {
  if (!data || typeof data !== 'object') {
    return null
  }
  const entriesRaw = (data.entries ?? {}) as Record<string, unknown>
  const state: UserAchievementState = Object.create(null)
  Object.keys(entriesRaw).forEach((key) => {
    const entry = sanitizeRemoteEntry(entriesRaw[key])
    if (entry) {
      state[key] = entry
    }
  })
  const updatedAtIso =
    typeof data.updatedAtIso === 'string' && data.updatedAtIso ? data.updatedAtIso : new Date().toISOString()
  const badgeId = typeof data.badgeId === 'string' && data.badgeId ? data.badgeId : null
  return {
    entries: state,
    badgeId,
    updatedAtIso,
  }
}

async function pushAchievementsToFirestore(userId: string, bundle: UserAchievementBundle) {
  if (!userId) {
    return
  }
  if (remoteSyncDisabled.has(userId)) {
    return
  }
  try {
    const docRef = await getAchievementDocument(userId)
    if (!docRef) {
      return
    }
    const updatedAtIso = bundle.updatedAtIso || new Date().toISOString()
    pendingRemoteWrites.set(userId, updatedAtIso)
    const entries: Record<string, StoredAchievementEntry> = {}
    Object.keys(bundle.entries).forEach((key) => {
      entries[key] = { ...bundle.entries[key] }
    })
    await docRef.set({
      entries,
      badgeId: bundle.badgeId ?? null,
      updatedAtIso,
      version: 1,
      updatedAt: FieldValue.serverTimestamp(),
    })
    lastRemoteSnapshots.set(userId, updatedAtIso)
  } catch (error) {
    pendingRemoteWrites.delete(userId)
    if (isPermissionDenied(error)) {
      const detail = formatFirestoreError(error)
      console.warn('[achievements] Firestore denied write access; disabling sync', {
        userId,
        detail,
        code: (error as { code?: string | number })?.code ?? null,
      })
      remoteSyncDisabled.add(userId)
      return
    }
    const detail = formatFirestoreError(error)
    console.error('[achievements] Unable to persist achievements to Firestore', {
      userId,
      detail,
      error,
    })
  }
}

function cleanupRemoteSubscription(userId: string) {
  const unsubscribe = remoteSubscriptions.get(userId)
  if (!unsubscribe) {
    return
  }
  try {
    unsubscribe()
  } catch (error) {
    console.warn('[achievements] Failed to detach Firestore listener', {
      userId,
      error,
    })
  }
  remoteSubscriptions.delete(userId)
}

async function ensureRemoteSubscription(userId: string) {
  if (!userId) {
    return
  }
  if (remoteSubscriptions.has(userId)) {
    return
  }
  if (remoteSyncDisabled.has(userId)) {
    return
  }
  const docRef = await getAchievementDocument(userId)
  if (!docRef) {
    return
  }
  const unsubscribe = docRef.onSnapshot(
    (snapshot) => {
      if (!snapshot.exists) {
        lastRemoteSnapshots.delete(userId)
        return
      }
      const payload = sanitizeRemoteState(snapshot.data())
      if (!payload) {
        return
      }
      const { updatedAtIso } = payload
      const pendingIso = pendingRemoteWrites.get(userId)
      if (pendingIso && pendingIso === updatedAtIso) {
        pendingRemoteWrites.delete(userId)
        lastRemoteSnapshots.set(userId, updatedAtIso)
        const currentBundle = getUserBundle(userId)
        if (
          currentBundle.badgeId !== payload.badgeId ||
          !statesEqual(currentBundle.entries, payload.entries)
        ) {
          setUserBundle(userId, payload)
          notify(userId, toSnapshot(payload))
        }
        return
      }
      const previousIso = lastRemoteSnapshots.get(userId)
      const parsedPrev = previousIso ? Date.parse(previousIso) : 0
      const parsedCurrent = updatedAtIso ? Date.parse(updatedAtIso) : 0
      if (previousIso && parsedPrev && parsedCurrent && parsedCurrent <= parsedPrev) {
        return
      }
      const currentBundle = getUserBundle(userId)
      if (
        currentBundle.badgeId === payload.badgeId &&
        statesEqual(currentBundle.entries, payload.entries)
      ) {
        lastRemoteSnapshots.set(userId, updatedAtIso)
        return
      }
      setUserBundle(userId, payload)
      lastRemoteSnapshots.set(userId, updatedAtIso)
      notify(userId, toSnapshot(payload))
    },
    (error) => {
      if (isPermissionDenied(error)) {
        const detail = formatFirestoreError(error)
        console.warn('[achievements] Firestore denied subscription access; disabling sync', {
          userId,
          detail,
          code: (error as { code?: string | number })?.code ?? null,
        })
        remoteSyncDisabled.add(userId)
        cleanupRemoteSubscription(userId)
        return
      }
      const detail = formatFirestoreError(error)
      console.error('[achievements] Firestore subscription error', {
        userId,
        detail,
        error,
      })
    },
  )
  remoteSubscriptions.set(userId, unsubscribe)
}

function notify(userId: string, snapshot: AchievementSnapshot) {
  const set = listeners.get(userId)
  if (!set || set.size === 0) {
    return
  }
  set.forEach((listener) => {
    try {
      listener(snapshot)
    } catch (error) {
      console.error('[achievements] Listener failed', error)
    }
  })
}

function getUserSymbol(match: StoredMatch): Player | null {
  const winner = match.game.winner
  if (match.outcome === 'win') {
    return winner && winner !== 'Draw' ? winner : null
  }
  if (match.outcome === 'loss') {
    if (winner === 'X') {
      return 'O'
    }
    if (winner === 'O') {
      return 'X'
    }
  }
  const firstMove = match.game.moves[0]
  if (firstMove?.player === 'X' || firstMove?.player === 'O') {
    return firstMove.player
  }
  return 'X'
}

function collectPlacements(move: StoredMatch['game']['moves'][number]): Array<{ r: number; c: number }> {
  const placements: Array<{ r: number; c: number }> = []
  if (move.power === 'doubleMove') {
    if (move.extra && typeof move.extra.r === 'number' && typeof move.extra.c === 'number') {
      placements.push({ r: move.extra.r, c: move.extra.c })
    }
  }
  if (typeof move.r === 'number' && typeof move.c === 'number') {
    placements.push({ r: move.r, c: move.c })
  }
  return placements
}

function collectPowersUsedByPlayer(match: StoredMatch, player: Player): Set<typeof POWER_KEYS[number]> {
  const used = new Set<typeof POWER_KEYS[number]>()
  const powers = match.game.powers
  if (powers) {
    POWER_KEYS.forEach((power) => {
      if (powers[power]?.[player]) {
        used.add(power)
      }
    })
  }
  match.game.moves.forEach((move) => {
    if (move.player === player && move.power) {
      const power = move.power as typeof POWER_KEYS[number]
      if (POWER_KEYS.includes(power)) {
        used.add(power)
      }
    }
  })
  return used
}

function isCenterSkepticWin(match: StoredMatch, player: Player): boolean {
  const size = match.setup.boardSize
  if (size % 2 === 0) {
    return false
  }
  const center = (size - 1) / 2
  for (const move of match.game.moves) {
    if (move.player !== player) {
      continue
    }
    const placements = collectPlacements(move)
    for (const placement of placements) {
      if (placement.r === center && placement.c === center) {
        return false
      }
    }
  }
  return true
}

function deriveStats(matches: StoredMatch[]): DerivedStats {
  const sorted = matches
    .slice()
    .sort((a, b) => Date.parse(a.createdAtIso) - Date.parse(b.createdAtIso))
  const stats: DerivedStats = {
    matchesCount: 0,
    latestIso: '',
    firstWinAt: null,
    winCount: 0,
    flawlessWins: 0,
    flawlessFirstAt: null,
    doubleMoveWins: 0,
    doubleMoveFirstAt: null,
    centerSkepticWins: 0,
    centerSkepticFirstAt: null,
    longestWinStreak: 0,
    streakMilestones: new Map<number, string>(),
    variantPlays: new Set<string>(),
    variantMilestones: new Map<number, string>(),
    gravityWins: 0,
    gravityEarnedAt: null,
    misereWins: 0,
    misereEarnedAt: null,
    chaosWins: 0,
    chaosEarnedAt: null,
    boardSizesWon: new Set<number>(),
    boardMasterEarnedAt: null,
    powerWins: new Set<typeof POWER_KEYS[number]>(),
    powerTrifectaEarnedAt: null,
    marathonerEarnedAt: null,
  }

  let currentStreak = 0

  for (const match of sorted) {
    const iso = match.createdAtIso
    stats.matchesCount += 1
    stats.latestIso = iso

    if (!stats.marathonerEarnedAt && stats.matchesCount >= MARATHONER_TARGET) {
      stats.marathonerEarnedAt = iso
    }

    for (const variant of VARIANT_KEYS) {
      if (variant.predicate(match)) {
        if (!stats.variantPlays.has(variant.id)) {
          stats.variantPlays.add(variant.id)
          const count = stats.variantPlays.size
          if (!stats.variantMilestones.has(count)) {
            stats.variantMilestones.set(count, iso)
          }
        }
      }
    }

    if (match.outcome === 'win') {
      const player = getUserSymbol(match)
      if (player !== 'X' && player !== 'O') {
        currentStreak = 0
        continue
      }
      stats.winCount += 1
      if (!stats.firstWinAt) {
        stats.firstWinAt = iso
      }
      currentStreak += 1
      if (currentStreak > stats.longestWinStreak) {
        stats.longestWinStreak = currentStreak
        stats.streakMilestones.set(currentStreak, iso)
      }

      stats.boardSizesWon.add(match.setup.boardSize)
      if (stats.boardSizesWon.size >= BOARD_MASTER_TARGET && !stats.boardMasterEarnedAt) {
        stats.boardMasterEarnedAt = iso
      }

      if (match.setup.gravity) {
        stats.gravityWins += 1
        if (stats.gravityWins >= GRAVITY_WIN_TARGET && !stats.gravityEarnedAt) {
          stats.gravityEarnedAt = iso
        }
      }
      if (match.setup.misere) {
        stats.misereWins += 1
        if (stats.misereWins >= MISERE_WIN_TARGET && !stats.misereEarnedAt) {
          stats.misereEarnedAt = iso
        }
      }
      if (match.setup.chaosMode) {
        stats.chaosWins += 1
        if (stats.chaosWins >= CHAOS_WIN_TARGET && !stats.chaosEarnedAt) {
          stats.chaosEarnedAt = iso
        }
      }

      const powersUsed = collectPowersUsedByPlayer(match, player)
      if (powersUsed.size === 0) {
        stats.flawlessWins += 1
        if (!stats.flawlessFirstAt) {
          stats.flawlessFirstAt = iso
        }
      }
      if (powersUsed.has('doubleMove')) {
        stats.doubleMoveWins += 1
        if (!stats.doubleMoveFirstAt) {
          stats.doubleMoveFirstAt = iso
        }
      }
      powersUsed.forEach((power) => {
        if (!stats.powerWins.has(power)) {
          stats.powerWins.add(power)
          if (stats.powerWins.size >= POWER_TRIFECTA_TARGET && !stats.powerTrifectaEarnedAt) {
            stats.powerTrifectaEarnedAt = iso
          }
        }
      })

      if (isCenterSkepticWin(match, player)) {
        stats.centerSkepticWins += 1
        if (!stats.centerSkepticFirstAt) {
          stats.centerSkepticFirstAt = iso
        }
      }
    } else {
      currentStreak = 0
    }
  }

  return stats
}

function buildEntry(progress: number, target: number, earnedAtIso: string | null, updatedAtIso: string): StoredAchievementEntry {
  const sanitizedProgress = Number.isFinite(progress) ? Math.max(0, progress) : 0
  const normalizedTarget = target > 0 ? target : 1
  const earned = sanitizedProgress >= normalizedTarget
  const normalizedProgress = earned ? Math.min(sanitizedProgress, normalizedTarget) : sanitizedProgress
  return {
    progress: normalizedProgress,
    target: normalizedTarget,
    earned,
    earnedAtIso: earned ? (earnedAtIso ?? updatedAtIso) : null,
    updatedAtIso,
  }
}

function evaluate(matches: StoredMatch[]): UserAchievementState {
  const stats = deriveStats(matches)
  const latestIso = stats.latestIso || new Date().toISOString()
  const state: UserAchievementState = Object.create(null)

  state.first_win = buildEntry(stats.winCount, 1, stats.firstWinAt, latestIso)
  state.flawless_victory = buildEntry(stats.flawlessWins, 1, stats.flawlessFirstAt, latestIso)
  state.fork_master = buildEntry(stats.doubleMoveWins, 1, stats.doubleMoveFirstAt, latestIso)
  state.center_skeptic = buildEntry(stats.centerSkepticWins, 1, stats.centerSkepticFirstAt, latestIso)

  const winStreak = stats.longestWinStreak
  const streak3EarnedAt = stats.streakMilestones.get(3) ?? null
  const streak5EarnedAt = stats.streakMilestones.get(5) ?? null
  const streak10EarnedAt = stats.streakMilestones.get(10) ?? null
  state.win_streak_3 = buildEntry(winStreak, 3, streak3EarnedAt, latestIso)
  state.win_streak_5 = buildEntry(winStreak, 5, streak5EarnedAt, latestIso)
  state.win_streak_10 = buildEntry(winStreak, 10, streak10EarnedAt, latestIso)

  const variantProgress = stats.variantPlays.size
  const variantEarnedAt = stats.variantMilestones.get(VARIANT_EXPLORER_TARGET) ?? null
  state.variant_explorer = buildEntry(variantProgress, VARIANT_EXPLORER_TARGET, variantEarnedAt, latestIso)

  state.gravity_guru = buildEntry(stats.gravityWins, GRAVITY_WIN_TARGET, stats.gravityEarnedAt, latestIso)
  state.misere_mindset = buildEntry(stats.misereWins, MISERE_WIN_TARGET, stats.misereEarnedAt, latestIso)
  state.chaos_wrangler = buildEntry(stats.chaosWins, CHAOS_WIN_TARGET, stats.chaosEarnedAt, latestIso)

  const boardProgress = stats.boardSizesWon.size
  state.board_master = buildEntry(boardProgress, BOARD_MASTER_TARGET, stats.boardMasterEarnedAt, latestIso)

  const powerProgress = stats.powerWins.size
  state.power_trifecta = buildEntry(powerProgress, POWER_TRIFECTA_TARGET, stats.powerTrifectaEarnedAt, latestIso)

  state.marathoner = buildEntry(stats.matchesCount, MARATHONER_TARGET, stats.marathonerEarnedAt, latestIso)

  return state
}

function diffStates(
  previous: UserAchievementState,
  next: UserAchievementState,
): {
  progressIncreases: Array<{ definition: AchievementDefinition; previous: StoredAchievementEntry | undefined; current: StoredAchievementEntry }>
  newlyEarned: Array<{ definition: AchievementDefinition; current: StoredAchievementEntry; previous: StoredAchievementEntry | undefined }>
} {
  const progressIncreases: Array<{ definition: AchievementDefinition; previous: StoredAchievementEntry | undefined; current: StoredAchievementEntry }> = []
  const newlyEarned: Array<{ definition: AchievementDefinition; current: StoredAchievementEntry; previous: StoredAchievementEntry | undefined }> = []
  for (const definition of definitions) {
    const prev = previous[definition.id]
    const current = next[definition.id]
    if (!current) {
      continue
    }
    if (prev) {
      if (current.progress > prev.progress) {
        progressIncreases.push({ definition, previous: prev, current })
      }
      if (!prev.earned && current.earned) {
        newlyEarned.push({ definition, current, previous: prev })
      }
    } else {
      if (current.progress > 0) {
        progressIncreases.push({ definition, previous: undefined, current })
      }
      if (current.earned) {
        newlyEarned.push({ definition, current, previous: undefined })
      }
    }
  }
  return { progressIncreases, newlyEarned }
}

function shouldEmitNotifications(source: AchievementUpdateOptions['source']): boolean {
  return source !== 'initial' && source !== 'sync'
}

function formatProgressMessage(definition: AchievementDefinition, entry: StoredAchievementEntry): string {
  const capped = entry.progress > entry.target ? `${entry.progress}/${entry.target}` : `${entry.progress}/${entry.target}`
  return `${definition.title}: ${capped}`
}

function formatEarnedMessage(definition: AchievementDefinition): string {
  return `You earned “${definition.title}”!`
}

function emitProgressNotifications(events: Array<{ definition: AchievementDefinition; current: StoredAchievementEntry }>) {
  events.forEach((event) => {
    const message = formatProgressMessage(event.definition, event.current)
    showToast(`Achievement progress • ${message}`)
  })
}

function emitEarnedNotifications(events: Array<{ definition: AchievementDefinition; current: StoredAchievementEntry }>) {
  events.forEach((event) => {
    const title = 'Achievement Unlocked'
    const message = `${formatEarnedMessage(event.definition)}\n${event.definition.description}`
    showAlert(title, message)
  })
}

function formatFirestoreError(error: unknown): string {
  if (!error) {
    return 'Unknown Firestore error.'
  }
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
    const message = error.message.trim()
    const code = (error as { code?: string | number }).code
    if (code !== undefined && code !== null) {
      const codeText = typeof code === 'string' ? code : String(code)
      if (codeText && !message.toLowerCase().includes(codeText.toLowerCase())) {
        return `${message} (code ${codeText})`
      }
    }
    return message
  }
  const { message, code } = error as { message?: unknown; code?: unknown }
  if (typeof message === 'string' && message.trim()) {
    if (code !== undefined && code !== null) {
      const codeText = typeof code === 'string' ? code : String(code)
      if (codeText) {
        return `${message.trim()} (code ${codeText})`
      }
    }
    return message.trim()
  }
  if (code !== undefined && code !== null) {
    return `Error code ${String(code)}`
  }
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown Firestore error.'
  }
}

function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const { code, message } = error as { code?: unknown; message?: unknown }
  const codeText = typeof code === 'string' ? code : typeof code === 'number' ? String(code) : ''
  if (codeText.toLowerCase().includes('permission-denied')) {
    return true
  }
  const messageText = typeof message === 'string' ? message : ''
  return messageText.toUpperCase().includes('PERMISSION_DENIED')
}

export function subscribeToAchievements(userId: string, listener: AchievementListener): () => void {
  if (!userId) {
    try {
      listener({ achievements: [], badgeId: null })
    } catch (error) {
      console.error('[achievements] Immediate listener call failed', error)
    }
    return () => undefined
  }
  const set = listeners.get(userId) ?? new Set<AchievementListener>()
  set.add(listener)
  listeners.set(userId, set)
  try {
    const bundle = getUserBundle(userId)
    listener(toSnapshot(bundle))
  } catch (error) {
    console.error('[achievements] Immediate listener call failed', error)
  }
  void ensureRemoteSubscription(userId)
  return () => {
    const existing = listeners.get(userId)
    if (!existing) {
      return
    }
    existing.delete(listener)
    if (existing.size === 0) {
      listeners.delete(userId)
      cleanupRemoteSubscription(userId)
      lastRemoteSnapshots.delete(userId)
    }
  }
}

export function updateAchievementsFromMatches(
  userId: string,
  matches: StoredMatch[],
  options: AchievementUpdateOptions = {},
) {
  if (!userId) {
    return
  }
  try {
    const previousBundle = getUserBundle(userId)
    const nextEntries = evaluate(matches)
    const badgeStillEarned =
      previousBundle.badgeId && nextEntries[previousBundle.badgeId]?.earned ? previousBundle.badgeId : null
    const updatedAtIso = new Date().toISOString()
    const nextBundle: UserAchievementBundle = {
      entries: nextEntries,
      badgeId: badgeStillEarned,
      updatedAtIso,
    }
    const entriesChanged = !statesEqual(previousBundle.entries, nextEntries)
    const badgeChanged = previousBundle.badgeId !== nextBundle.badgeId
    setUserBundle(userId, nextBundle)
    notify(userId, toSnapshot(nextBundle))
    if (entriesChanged || badgeChanged || !lastRemoteSnapshots.has(userId)) {
      void pushAchievementsToFirestore(userId, nextBundle)
    }

    if (shouldEmitNotifications(options.source)) {
      const { progressIncreases, newlyEarned } = diffStates(previousBundle.entries, nextEntries)
      if (progressIncreases.length) {
        emitProgressNotifications(progressIncreases)
      }
      if (newlyEarned.length) {
        emitEarnedNotifications(newlyEarned)
      }
    }
  } catch (error) {
    console.error('[achievements] Failed to update achievements', error)
  }
}

export function getAchievements(userId: string): AchievementSnapshot {
  if (!userId) {
    return { achievements: [], badgeId: null }
  }
  const bundle = getUserBundle(userId)
  return toSnapshot(bundle)
}

export function getSelectedBadgeId(userId: string): string | null {
  if (!userId) {
    return null
  }
  return getUserBundle(userId).badgeId
}

export function setSelectedBadge(userId: string, achievementId: string | null) {
  if (!userId) {
    return
  }
  try {
    const current = getUserBundle(userId)
    const normalizedId =
      achievementId && current.entries[achievementId]?.earned ? achievementId : null
    if (current.badgeId === normalizedId) {
      return
    }
    const nextBundle: UserAchievementBundle = {
      entries: cloneState(current.entries),
      badgeId: normalizedId,
      updatedAtIso: new Date().toISOString(),
    }
    setUserBundle(userId, nextBundle)
    notify(userId, toSnapshot(nextBundle))
    void pushAchievementsToFirestore(userId, nextBundle)
  } catch (error) {
    console.error('[achievements] Failed to set badge', error)
  }
}
