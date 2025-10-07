import { ApplicationSettings } from '@nativescript/core'
import type { GameState, Move, Player } from '@ttt/engine'

import type { GameSetup } from './game-store'
import type { Difficulty, PowerUsage } from '@ttt/engine'
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
let cache: MatchesState | null = null

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
  return JSON.parse(JSON.stringify(powers)) as PowerUsage
}

function sanitizeGame(game: GameState): StoredGameState {
  const moves = sanitizedMoves(game.moves)
  return {
    board: game.board.map((row) => row.slice()),
    current: game.current,
    config: { ...game.config },
    moves,
    winner: game.winner ?? null,
    lastMove: moves.length ? moves[moves.length - 1] : undefined,
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

export function deleteMatch(userId: string, matchId: string): boolean {
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
  return () => {
    const existing = listeners.get(userId)
    if (!existing) {
      return
    }
    existing.delete(listener)
    if (existing.size === 0) {
      listeners.delete(userId)
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
