import type { GameState, Move, Player } from '@ttt/engine'

export function formatReplayEntry(move: Move, player: Player, step: number, total: number): string {
  const prefix = `Move ${step}/${total}: ${player}`
  if (move.power === 'doubleMove' && move.extra && typeof move.r === 'number' && typeof move.c === 'number') {
    const first = move.extra
    const second = { r: move.r, c: move.c }
    return `${prefix} Double Move -> (${first.r + 1}, ${first.c + 1}) then (${second.r + 1}, ${second.c + 1})`
  }
  if (move.power === 'laneShift' && move.shift) {
    const { axis, index, direction } = move.shift
    const axisLabel = axis === 'row' ? 'Row' : 'Column'
    const dirLabel =
      axis === 'row'
        ? direction === 1
          ? 'right'
          : 'left'
        : direction === 1
        ? 'down'
        : 'up'
    return `${prefix} Lane Shift -> ${axisLabel} ${index + 1} ${dirLabel}`
  }
  if (move.power === 'bomb' && typeof move.r === 'number' && typeof move.c === 'number') {
    return `${prefix} Bomb -> scorched (${move.r + 1}, ${move.c + 1})`
  }
  if (typeof move.r === 'number' && typeof move.c === 'number') {
    return `${prefix} -> (${move.r + 1}, ${move.c + 1})`
  }
  return `${prefix} -> (n/a)`
}

export function findWinningLine(game: GameState): { r: number; c: number }[] | null {
  if (!game.winner || game.winner === 'Draw') {
    return null
  }
  const n = game.board.length
  const need = game.config.winLength
  const wrap = !!game.config.wrap

  const normalize = (value: number) => ((value % n) + n) % n

  const cell = (r: number, c: number) => {
    if (wrap) {
      return game.board[normalize(r)][normalize(c)]
    }
    if (r < 0 || c < 0 || r >= n || c >= n) {
      return 'B'
    }
    return game.board[r][c]
  }

  const dirs: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]

  for (let sr = 0; sr < n; sr++) {
    for (let sc = 0; sc < n; sc++) {
      for (const [dr, dc] of dirs) {
        const coords: { r: number; c: number }[] = []
        let occupant: Player | null = null
        let valid = true
        for (let k = 0; k < need; k++) {
          const rr = sr + dr * k
          const cc = sc + dc * k
          const value = cell(rr, cc)
          if (value !== 'X' && value !== 'O') {
            valid = false
            break
          }
          if (!occupant) {
            occupant = value
          } else if (value !== occupant) {
            valid = false
            break
          }
          const nr = wrap ? normalize(rr) : rr
          const nc = wrap ? normalize(cc) : cc
          coords.push({ r: nr, c: nc })
        }
        if (valid && coords.length === need && occupant) {
          const expectedWinner = game.config.misere ? (occupant === 'X' ? 'O' : 'X') : occupant
          if (expectedWinner === game.winner) {
            const seen = new Set<string>()
            const unique: { r: number; c: number }[] = []
            for (const coord of coords) {
              const key = `${coord.r}:${coord.c}`
              if (!seen.has(key)) {
                seen.add(key)
                unique.push(coord)
              }
            }
            return unique
          }
        }
      }
    }
  }
  return null
}
