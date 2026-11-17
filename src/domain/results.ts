export type SessionEvent =
  | { type: 'session-start'; at: number; seed: number }
  | { type: 'round-start'; at: number; round: number }
  | {
      type: 'delay-start'
      at: number
      durationMs: number
    }
  | {
      type: 'cue'
      at: number
      round: number
      podId: string
      color: string
      cueId: string
    }
  | {
      type: 'hit'
      at: number
      round: number
      podId: string
      cueId: string
      reactionMs: number
      source: 'pod' | 'client'
    }
  | {
      type: 'miss'
      at: number
      round: number
      podId: string
      cueId: string
    }
  | {
      type: 'cue-aborted'
      at: number
      round: number
      podId: string
      cueId: string
      reason: 'disconnect' | 'stop' | 'pause' | 'round-end'
    }
  | { type: 'unlit-tap'; at: number; podId: string }
  | { type: 'stale-tap'; at: number; podId: string; reason: string }
  | { type: 'round-rest'; at: number; round: number; durationMs: number }
  | { type: 'pause'; at: number; reason: string }
  | { type: 'resume'; at: number }
  | { type: 'session-stop'; at: number }
  | { type: 'session-complete'; at: number }
  | { type: 'disconnect'; at: number; podId: string }

export interface RoundResult {
  round: number
  hits: number
  misses: number
  abortedCues: number
  bestReactionMs: number | null
  avgReactionMs: number | null
}

export interface SessionResult {
  hits: number
  misses: number
  abortedCues: number
  bestReactionMs: number | null
  avgReactionMs: number | null
  rounds: RoundResult[]
  durationMs: number
}

export interface ColorScore {
  color: string
  hits: number
  misses: number
  bestReactionMs: number | null
  avgReactionMs: number | null
}

export interface SessionRecord {
  id: string
  exerciseId: string
  exerciseName: string
  startedAt: string
  endedAt: string
  seed: number
  podIds: string[]
  events: SessionEvent[]
  result: SessionResult
  completed: boolean
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function best(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.min(...values)
}

export function deriveResult(events: SessionEvent[]): SessionResult {
  const start = events.find((event) => event.type === 'session-start')
  const end = [...events]
    .reverse()
    .find(
      (event) =>
        event.type === 'session-complete' ||
        event.type === 'session-stop' ||
        event.type === 'pause',
    )
  const durationMs = start && end ? Math.max(0, end.at - start.at) : 0

  const hits = events.filter((event) => event.type === 'hit')
  const misses = events.filter((event) => event.type === 'miss')
  const aborted = events.filter((event) => event.type === 'cue-aborted')
  const reactions = hits.map((event) => event.reactionMs)

  const roundNumbers = [
    ...new Set(
      events
        .map((event) => ('round' in event ? event.round : undefined))
        .filter((round): round is number => typeof round === 'number'),
    ),
  ].sort((a, b) => a - b)

  const rounds: RoundResult[] = roundNumbers.map((round) => {
    const roundHits = hits.filter((event) => event.round === round)
    const roundReactions = roundHits.map((event) => event.reactionMs)
    return {
      round,
      hits: roundHits.length,
      misses: misses.filter((event) => event.round === round).length,
      abortedCues: aborted.filter((event) => event.round === round).length,
      bestReactionMs: best(roundReactions),
      avgReactionMs: avg(roundReactions),
    }
  })

  return {
    hits: hits.length,
    misses: misses.length,
    abortedCues: aborted.length,
    bestReactionMs: best(reactions),
    avgReactionMs: avg(reactions),
    rounds,
    durationMs,
  }
}

export function scoresByColor(events: SessionEvent[]): ColorScore[] {
  const colorByCueId = new Map<string, string>()
  const order: string[] = []
  for (const event of events) {
    if (event.type !== 'cue') continue
    colorByCueId.set(event.cueId, event.color)
    if (!order.includes(event.color)) order.push(event.color)
  }

  const stats = new Map<string, { hits: number[]; misses: number }>()
  for (const color of order) {
    stats.set(color, { hits: [], misses: 0 })
  }

  for (const event of events) {
    if (event.type === 'hit') {
      const color = colorByCueId.get(event.cueId)
      const entry = color ? stats.get(color) : undefined
      entry?.hits.push(event.reactionMs)
    } else if (event.type === 'miss') {
      const color = colorByCueId.get(event.cueId)
      const entry = color ? stats.get(color) : undefined
      if (entry) entry.misses += 1
    }
  }

  return order.map((color) => {
    const entry = stats.get(color) ?? { hits: [], misses: 0 }
    return {
      color,
      hits: entry.hits.length,
      misses: entry.misses,
      bestReactionMs: best(entry.hits),
      avgReactionMs: avg(entry.hits),
    }
  })
}

export function winningColor(scores: ColorScore[]): string | null {
  if (scores.length === 0) return null
  const ranked = [...scores].sort((a, b) => b.hits - a.hits || a.color.localeCompare(b.color))
  const leader = ranked[0]
  const runnerUp = ranked[1]
  if (!leader) return null
  if (runnerUp && runnerUp.hits === leader.hits) return null
  return leader.color
}
