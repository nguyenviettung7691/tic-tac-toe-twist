import { ApplicationSettings } from '@nativescript/core'
import '@nativescript/firebase-firestore'
import { firebase } from '@nativescript/firebase-core'
import type {
  CollectionReference,
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
} from '@nativescript/firebase-firestore'
import type { GameState, Move, Player } from '@ttt/engine'
import type { GameSetup } from './game-store'
import type { Difficulty, PowerUsage } from '@ttt/engine'

import { initFirebase } from '~/services/firebase'
import { findWinningLine } from '~/utils/game-format'

const STORAGE_KEY = 'ttt.match.history.v1'
const MAX_MATCHES_PER_USER = 50

export type OpponentType = 'ai' | 'human'

export interface StoredMove extends Move {
  player: Player
}

export interface StoredGameState extends Omit<GameState, 'moves' | 'lastMove' | 'powers'> {
  moves: StoredMove[]
  lastMove?: StoredMove
  powers: PowerUsage
}

export interface StoredMatch {
  id: string
  createdAtIso: string
  opponentType: OpponentType
  outcome: 'win' | 'loss' | 'draw'
  movesCount: number
  setup: GameSetup
  difficulty: Difficulty
  vsAi: boolean
  resultWinner: Player | 'Draw' | null
  winningLine: { r: number; c: number }[] | null
  game: StoredGameState
}

interface MatchesState {
  [userId: string]: StoredMatch[]
}

type MatchListener = (matches: StoredMatch[]) => void

const listeners = new Map<string, Set<MatchListener>>()
const remoteSubscriptions = new Map<string, () => void>()
let cache: MatchesState | null = null
let firestoreInstance: Firestore | null = null

function ensureCache(): MatchesState {
  if (cache) {
    return cache
  }
  const raw = ApplicationSettings.getString(STORAGE_KEY)
  if (!raw) {
    cache = Object.create(null)
    return cache
  }
  try {
    const parsed = JSON.parse(raw) as MatchesState
    if (parsed && typeof parsed === 'object') {
      cache = parsed
    } else {
      cache = Object.create(null)
    }
  } catch (error) {
    console.warn('[matches] Failed to parse stored match history, resetting.', error)
    cache = Object.create(null)
  }
  return cache!
}

function persist() {
  const state = ensureCache()
  try {
    ApplicationSettings.setString(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('[matches] Unable to persist match history', error)
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

async function getFirestore(): Promise<Firestore | null> {
  if (firestoreInstance) {
    return firestoreInstance
  }
  try {
    await initFirebase()
    const fb = firebase?.()
    if (!fb || typeof (fb as { firestore?: () => Firestore }).firestore !== 'function') {
      console.warn('[matches] Firestore is not available on this platform')
      return null
    }
    firestoreInstance = (fb as { firestore: () => Firestore }).firestore()
    return firestoreInstance
  } catch (error) {
    console.error('[matches] Failed to obtain Firestore instance', error)
    return null
  }
}

async function getMatchCollection(userId: string): Promise<CollectionReference<DocumentData> | null> {
  if (!userId) {
    return null
  }
  const db = await getFirestore()
  if (!db) {
    return null
  }
  try {
    return db.collection(`users/${userId}/matches`)
  } catch (error) {
    console.error('[matches] Unable to access Firestore collection', error)
    return null
  }
}

function sanitizedMoves(moves: Move[]): StoredMove[] {
  return moves.map((move, index) => {
    const player: Player = move.player ?? (index % 2 === 0 ? 'X' : 'O')
    const cleaned: StoredMove = { player }
    if (typeof move.r === 'number') {
      cleaned.r = move.r
    }
    if (typeof move.c === 'number') {
      cleaned.c = move.c
    }
    if (move.power) {
      cleaned.power = move.power
    }
    if (move.extra) {
      cleaned.extra = { ...move.extra }
    }
    if (move.shift) {
      cleaned.shift = { ...move.shift }
    }
    return cleaned
  })
}

function clonePowers(powers: PowerUsage): PowerUsage {
  return {
    doubleMove: { ...powers.doubleMove },
    laneShift: { ...powers.laneShift },
    bomb: { ...powers.bomb },
  }
}

function sanitizeGame(game: GameState): StoredGameState {
  const moves = sanitizedMoves(game.moves)
  return {
    board: game.board.map((row) => row.slice()),
    current: game.current,
    config: { ...game.config },
    moves,
    winner: game.winner ?? null,
    lastMove: moves.length ? { ...moves[moves.length - 1] } : undefined,
    powers: clonePowers(game.powers),
  }
}

function computeOutcome(winner: Player | 'Draw' | null): 'win' | 'loss' | 'draw' {
  if (!winner || winner === 'Draw') {
    return 'draw'
  }
  return winner === 'X' ? 'win' : 'loss'
}

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

type EncodedBoard = Record<string, Array<Player | null | 'B' | 'F'>>

function encodeBoard(board: StoredGameState['board']): EncodedBoard {
  const map: EncodedBoard = Object.create(null)
  board.forEach((row, index) => {
    map[String(index)] = row.slice()
  })
  return map
}

function serializeMatch(match: StoredMatch) {
  const payload = clone(match)
  return {
    ...payload,
    createdAtMs: Date.parse(match.createdAtIso) || Date.now(),
    game: {
      ...payload.game,
      board: encodeBoard(payload.game.board),
    },
  }
}

function sanitizeSetup(raw: any): GameSetup {
  const base: GameSetup = {
    boardSize: 3,
    winLength: 3,
    gravity: false,
    wrap: false,
    randomBlocks: false,
    misere: false,
    laneShiftPower: false,
    doubleMovePower: false,
    bombPower: false,
    chaosMode: false,
    difficulty: 'balanced',
    vsAi: true,
  }
  if (!raw || typeof raw !== 'object') {
    return base
  }
  return {
    ...base,
    ...raw,
    boardSize: raw.boardSize ?? base.boardSize,
    winLength: raw.winLength ?? base.winLength,
    gravity: !!raw.gravity,
    wrap: !!raw.wrap,
    randomBlocks: !!raw.randomBlocks,
    misere: !!raw.misere,
    laneShiftPower: !!raw.laneShiftPower,
    doubleMovePower: !!raw.doubleMovePower,
    bombPower: !!raw.bombPower,
    chaosMode: !!raw.chaosMode,
    difficulty: raw.difficulty ?? base.difficulty,
    vsAi: raw.vsAi !== false,
  }
}

function sanitizePowers(raw: any): PowerUsage {
  const base: PowerUsage = {
    doubleMove: { X: false, O: false },
    laneShift: { X: false, O: false },
    bomb: { X: false, O: false },
  }
  if (!raw || typeof raw !== 'object') {
    return base
  }
  return {
    doubleMove: { ...base.doubleMove, ...(raw.doubleMove ?? {}) },
    laneShift: { ...base.laneShift, ...(raw.laneShift ?? {}) },
    bomb: { ...base.bomb, ...(raw.bomb ?? {}) },
  }
}

function sanitizeStoredGame(raw: any): StoredGameState | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  let board: Array<Array<Player | null | 'B' | 'F'>> = []
  if (Array.isArray(raw.board)) {
    board = raw.board.map((row: any) => (Array.isArray(row) ? row.slice() : []))
  } else if (raw.board && typeof raw.board === 'object') {
    const entries = Object.entries(raw.board as Record<string, any>).sort(
      ([a], [b]) => Number(a) - Number(b),
    )
    board = entries.map(([, row]) => (Array.isArray(row) ? row.slice() : []))
  }
  const moves = Array.isArray(raw.moves)
    ? raw.moves.map((move: any, index: number) => {
        const player: Player =
          move?.player === 'O' ? 'O' : move?.player === 'X' ? 'X' : (index % 2 === 0 ? 'X' : 'O')
        const cleaned: StoredMove = { player }
        if (typeof move?.r === 'number') cleaned.r = move.r
        if (typeof move?.c === 'number') cleaned.c = move.c
        if (move?.power) cleaned.power = move.power
        if (move?.extra) cleaned.extra = { ...move.extra }
        if (move?.shift) cleaned.shift = { ...move.shift }
        return cleaned
      })
    : []
  const lastMove = raw.lastMove ? { ...raw.lastMove } : undefined
  return {
    board,
    current: raw.current === 'O' ? 'O' : 'X',
    config: { ...(raw.config ?? {}) },
    moves,
    winner: raw.winner ?? null,
    lastMove,
    powers: sanitizePowers(raw.powers),
  }
}

function deserializeMatch(doc: QueryDocumentSnapshot<DocumentData>): StoredMatch | null {
  try {
    const data = doc.data()
    if (!data) {
      return null
    }

    const createdAtIso =
      typeof data.createdAtIso === 'string'
        ? data.createdAtIso
        : (() => {
            const ms =
              typeof data.createdAtMs === 'number'
                ? data.createdAtMs
                : Date.now()
            return new Date(ms).toISOString()
          })()

    const game = sanitizeStoredGame(data.game)
    if (!game) {
      return null
    }

    return {
      id: doc.id,
      createdAtIso,
      opponentType: data.opponentType === 'human' ? 'human' : 'ai',
      outcome: data.outcome === 'win' ? 'win' : data.outcome === 'loss' ? 'loss' : 'draw',
      movesCount: typeof data.movesCount === 'number' ? data.movesCount : game.moves.length,
      setup: sanitizeSetup(data.setup),
      difficulty: data.difficulty ?? sanitizeSetup(data.setup).difficulty,
      vsAi: data.vsAi !== false,
      resultWinner: data.resultWinner ?? null,
      winningLine: Array.isArray(data.winningLine) ? data.winningLine : null,
      game,
    }
  } catch (error) {
    console.error('[matches] Failed to deserialize Firestore match', error)
    return null
  }
}

async function pushMatchToFirestore(userId: string, match: StoredMatch) {
  try {
    const collection = await getMatchCollection(userId)
    if (!collection) {
      return
    }
    await collection.doc(match.id).set(serializeMatch(match))
  } catch (error) {
    console.error('[matches] Unable to persist match to Firestore', error)
  }
}

async function removeMatchFromFirestore(userId: string, matchId: string) {
  try {
    const collection = await getMatchCollection(userId)
    if (!collection) {
      return
    }
    await collection.doc(matchId).delete()
  } catch (error) {
    console.error('[matches] Unable to delete match from Firestore', error)
  }
}

function applyRemoteMatches(userId: string, matches: StoredMatch[]) {
  const sorted = matches
    .slice()
    .sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso))
  const limited = sorted.slice(0, MAX_MATCHES_PER_USER)
  const state = ensureCache()
  state[userId] = limited
  persist()
  notify(userId)
}

async function ensureRemoteSubscription(userId: string) {
  if (remoteSubscriptions.has(userId)) {
    return
  }
  const collection = await getMatchCollection(userId)
  if (!collection) {
    return
  }
  const unsubscribe = collection
    .orderBy('createdAtIso', 'desc')
    .onSnapshot(async (snapshot) => {
      const remoteMatches: StoredMatch[] = []
      snapshot.docs.forEach((doc) => {
        const match = deserializeMatch(doc)
        if (match) {
          remoteMatches.push(match)
        }
      })
      applyRemoteMatches(userId, remoteMatches)
      const remoteIds = new Set(remoteMatches.map((item) => item.id))
      await syncUnsyncedMatches(userId, remoteIds)
    }, (error) => {
      console.error('[matches] Firestore subscription error', error)
    })
  remoteSubscriptions.set(userId, unsubscribe)
}

async function syncUnsyncedMatches(userId: string, remoteIds: Set<string>) {
  const state = ensureCache()
  const local = state[userId] ?? []
  const unsynced = local.filter((match) => !remoteIds.has(match.id))
  if (!unsynced.length) {
    return
  }
  for (const match of unsynced) {
    await pushMatchToFirestore(userId, match)
  }
}

function cleanupRemoteSubscription(userId: string) {
  const unsubscribe = remoteSubscriptions.get(userId)
  if (unsubscribe) {
    try {
      unsubscribe()
    } catch (error) {
      console.warn('[matches] Failed to detach Firestore listener', error)
    }
    remoteSubscriptions.delete(userId)
  }
}

export interface CompletedMatchPayload {
  userId: string
  game: GameState
  setup: GameSetup
  opponentType: OpponentType
}

export function saveCompletedMatch({ userId, game, setup, opponentType }: CompletedMatchPayload) {
  if (!userId) {
    return
  }
  if (!game.winner) {
    return
  }
  const state = ensureCache()
  const match: StoredMatch = {
    id: generateId(),
    createdAtIso: new Date().toISOString(),
    opponentType,
    outcome: computeOutcome(game.winner),
    movesCount: game.moves.length,
    setup: { ...setup },
    difficulty: setup.difficulty,
    vsAi: setup.vsAi,
    resultWinner: game.winner,
    winningLine: findWinningLine(game),
    game: sanitizeGame(game),
  }

  const existing = state[userId] ?? []
  const next = [match, ...existing]
  if (next.length > MAX_MATCHES_PER_USER) {
    next.length = MAX_MATCHES_PER_USER
  }
  state[userId] = next
  persist()
  notify(userId)

  void pushMatchToFirestore(userId, match)
}

export function getMatches(userId: string): StoredMatch[] {
  if (!userId) {
    return []
  }
  const state = ensureCache()
  const list = state[userId] ?? []
  return clone(list)
}

export function getMatch(userId: string, matchId: string): StoredMatch | null {
  if (!userId || !matchId) {
    return null
  }
  const state = ensureCache()
  const list = state[userId] ?? []
  const found = list.find((item) => item.id === matchId)
  return found ? clone(found) : null
}

export async function deleteMatch(userId: string, matchId: string): Promise<boolean> {
  if (!userId || !matchId) {
    return false
  }
  const state = ensureCache()
  const list = state[userId] ?? []
  const next = list.filter((item) => item.id !== matchId)
  if (next.length === list.length) {
    return false
  }
  state[userId] = next
  persist()
  notify(userId)
  await removeMatchFromFirestore(userId, matchId)
  return true
}

export function subscribeToMatches(userId: string, listener: MatchListener): () => void {
  if (!userId) {
    listener([])
    return () => undefined
  }
  const set = listeners.get(userId) ?? new Set<MatchListener>()
  set.add(listener)
  listeners.set(userId, set)
  listener(getMatches(userId))
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
    }
  }
}

function notify(userId: string) {
  const current = listeners.get(userId)
  if (!current || current.size === 0) {
    return
  }
  const snapshot = getMatches(userId)
  current.forEach((listener) => {
    try {
      listener(snapshot)
    } catch (error) {
      console.error('[matches] Listener failed', error)
    }
  })
}
