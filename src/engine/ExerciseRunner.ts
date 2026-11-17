import { COLOR_ORDER, colorRgb, type ColorName } from '../domain/colors'
import { isDuelExercise, timeoutOf, type Exercise } from '../domain/exercises'
import {
  deriveResult,
  scoresByColor,
  winningColor,
  type ColorScore,
  type SessionEvent,
  type SessionResult,
} from '../domain/results'
import type { LightsController } from '../ble/transport'
import type { TapNotification } from '../ble/protocol'
import { createSeed, mulberry32, pickIndex, randomInt } from './random'

export const DUEL_CELEBRATE_ON_MS = 300
export const DUEL_CELEBRATE_OFF_MS = 180
export const DUEL_CELEBRATE_CYCLES = 4

export function duelCelebrateDurationMs(tie: boolean): number {
  if (tie) return DUEL_CELEBRATE_CYCLES * 2 * DUEL_CELEBRATE_ON_MS
  return DUEL_CELEBRATE_CYCLES * (DUEL_CELEBRATE_ON_MS + DUEL_CELEBRATE_OFF_MS)
}

export type RunnerStatus =
  | 'idle'
  | 'delay'
  | 'cueing'
  | 'resting'
  | 'paused'
  | 'celebrating'
  | 'stopped'
  | 'completed'

export interface GroupAssignment {
  groupId: string
  podIds: string[]
}

export interface RunnerOptions {
  lights: LightsController
  now?: () => number
  seed?: number
  staleGraceMs?: number
}

interface ActiveCue {
  cueId: string
  podId: string
  color: ColorName
  at: number
  round: number
}

const STALE_GRACE_MS = 400

export class ExerciseRunner {
  readonly exercise: Exercise
  readonly seed: number
  private readonly lights: LightsController
  private readonly nowFn: () => number
  private readonly rng: () => number
  private readonly staleGraceMs: number
  private readonly assignments: GroupAssignment[]
  private readonly availablePods: Set<string>
  private readonly listeners = new Set<() => void>()
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
  private readonly cueTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private roundTimer: ReturnType<typeof setTimeout> | null = null

  private events: SessionEvent[] = []
  private status: RunnerStatus = 'idle'
  private round = 0
  private hitsThisRound = 0
  private roundStartedAt = 0
  private sessionStartedAt = 0
  private activeCues = new Map<string, ActiveCue>()
  private cueSeq = 0
  private groupCursor = 0
  private colorCursor = 0
  private podCursors = new Map<string, number>()
  private shuffleBags = new Map<string, string[]>()
  private colorBag: ColorName[] = []
  private pauseReason: string | null = null
  private pendingAfterPause: 'delay' | 'rest' | null = null
  private duelChain: Promise<void> = Promise.resolve()
  private delayResolvers = new Set<() => void>()
  private stopping = false
  private celebrateColor: ColorName | null = null

  constructor(
    exercise: Exercise,
    assignments: GroupAssignment[],
    options: RunnerOptions,
  ) {
    this.exercise = exercise
    this.assignments = assignments
    this.availablePods = new Set(assignments.flatMap((group) => group.podIds))
    this.lights = options.lights
    this.nowFn = options.now ?? (() => Date.now())
    this.seed = options.seed ?? createSeed()
    this.rng = mulberry32(this.seed)
    this.staleGraceMs = options.staleGraceMs ?? STALE_GRACE_MS
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getStatus(): RunnerStatus {
    return this.status
  }

  getRound(): number {
    return this.round
  }

  getEvents(): SessionEvent[] {
    return [...this.events]
  }

  getActiveCues(): ActiveCue[] {
    return [...this.activeCues.values()]
  }

  getPauseReason(): string | null {
    return this.pauseReason
  }

  getResult(): SessionResult {
    return deriveResult(this.events)
  }

  getLiveHits(): number {
    return this.events.filter((event) => event.type === 'hit').length
  }

  getLiveMisses(): number {
    return this.events.filter((event) => event.type === 'miss').length
  }

  getLiveColorScores(): ColorScore[] {
    return scoresByColor(this.events)
  }

  elapsedMs(): number {
    if (!this.sessionStartedAt) return 0
    return Math.max(0, this.nowFn() - this.sessionStartedAt)
  }

  remainingRoundMs(): number {
    if (!this.roundStartedAt) return 0
    const stop = this.exercise.stop
    if (stop.mode !== 'time') return 0
    return Math.max(0, stop.durationMs - (this.nowFn() - this.roundStartedAt))
  }

  getCelebrateColor(): ColorName | null {
    return this.status === 'celebrating' ? this.celebrateColor : null
  }

  async start(): Promise<void> {
    if (this.status !== 'idle') return
    this.sessionStartedAt = this.nowFn()
    this.push({ type: 'session-start', at: this.sessionStartedAt, seed: this.seed })
    await this.startRound(1)
  }

  async stop(reason: 'stop' | 'complete' = 'stop'): Promise<void> {
    if (this.status === 'stopped' || this.status === 'completed' || this.status === 'idle') {
      if (reason === 'complete' && this.status !== 'completed') {
        this.status = 'completed'
        this.push({ type: 'session-complete', at: this.nowFn() })
      }
      return
    }
    this.stopping = true
    this.celebrateColor = null
    this.clearTimers()
    await this.abortActiveCues(reason === 'complete' ? 'round-end' : 'stop')
    await this.safeLightsOffAll()
    this.status = reason === 'complete' ? 'completed' : 'stopped'
    this.push({
      type: reason === 'complete' ? 'session-complete' : 'session-stop',
      at: this.nowFn(),
    })
  }

  async handleTap(podId: string, tap: TapNotification): Promise<void> {
    if (this.status !== 'cueing') {
      this.push({ type: 'stale-tap', at: this.nowFn(), podId, reason: 'ikke-aktiv-cue' })
      return
    }
    const cue = this.activeCues.get(podId)
    if (!cue) {
      this.push({ type: 'unlit-tap', at: this.nowFn(), podId })
      return
    }
    if (!tap.lit) {
      this.push({ type: 'unlit-tap', at: this.nowFn(), podId })
      return
    }

    const clientElapsed = Math.max(0, this.nowFn() - cue.at)
    let reactionMs = clientElapsed
    let source: 'pod' | 'client' = 'client'
    if (Number.isFinite(tap.reactionMs) && tap.reactionMs >= 0) {
      if (tap.reactionMs > clientElapsed + this.staleGraceMs) {
        this.push({
          type: 'stale-tap',
          at: this.nowFn(),
          podId,
          reason: 'pod-ms-ældre-end-cue',
        })
        return
      }
      reactionMs = tap.reactionMs
      source = 'pod'
    }

    this.activeCues.delete(podId)
    this.clearCueTimer(cue.cueId)
    this.hitsThisRound += 1
    this.push({
      type: 'hit',
      at: this.nowFn(),
      round: cue.round,
      podId,
      cueId: cue.cueId,
      reactionMs,
      source,
    })
    await this.safeLightsOff(podId)

    if (this.stopReached()) {
      await this.abortActiveCues('round-end')
      await this.finishRound()
      return
    }

    if (this.isDuel()) {
      await this.enqueueDuel(() => this.relocateDuelCue(cue.color, podId))
      return
    }

    if (this.activeCues.size === 0) {
      this.clearTimers()
      await this.scheduleDelay()
    }
  }

  async handleDisconnect(podId: string): Promise<void> {
    this.availablePods.delete(podId)
    this.push({ type: 'disconnect', at: this.nowFn(), podId })
    if (this.status === 'idle' || this.status === 'stopped' || this.status === 'completed') {
      return
    }
    const hadCue = this.activeCues.has(podId)
    if (hadCue || this.status === 'cueing') {
      await this.abortActiveCues('disconnect')
    }
    this.clearTimers()
    this.status = 'paused'
    this.pauseReason = `${podId} mistede forbindelsen`
    this.pendingAfterPause = 'delay'
    this.push({ type: 'pause', at: this.nowFn(), reason: this.pauseReason })
  }

  restorePod(podId: string): void {
    this.availablePods.add(podId)
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return
    this.pauseReason = null
    this.push({ type: 'resume', at: this.nowFn() })
    const next = this.pendingAfterPause ?? 'delay'
    this.pendingAfterPause = null
    if (next === 'rest') {
      await this.startRest()
    } else {
      await this.scheduleDelay()
    }
  }

  private async startRound(round: number): Promise<void> {
    this.round = round
    this.hitsThisRound = 0
    this.roundStartedAt = this.nowFn()
    this.push({ type: 'round-start', at: this.roundStartedAt, round })
    await this.scheduleDelay()
  }

  private async scheduleDelay(): Promise<void> {
    if (this.stopReached()) {
      await this.finishRound()
      return
    }
    const durationMs = this.nextDelay()
    this.status = 'delay'
    this.push({ type: 'delay-start', at: this.nowFn(), durationMs })
    if (durationMs <= 0) {
      await this.issueCues()
      return
    }
    this.wait(durationMs, () => {
      void this.issueCues()
    })
  }

  private async issueCues(): Promise<void> {
    if (this.status === 'stopped' || this.status === 'completed' || this.status === 'paused') {
      return
    }
    if (this.stopReached()) {
      await this.finishRound()
      return
    }

    if (this.isDuel()) {
      await this.issueDuelCues()
      return
    }

    const picks = this.pickCueSet()
    if (picks.length === 0) {
      this.status = 'paused'
      this.pauseReason = 'Ingen tilgængelige pods til cue'
      this.pendingAfterPause = 'delay'
      this.push({ type: 'pause', at: this.nowFn(), reason: this.pauseReason })
      return
    }

    this.status = 'cueing'
    const at = this.nowFn()
    for (const pick of picks) {
      const cueId = `${this.round}-${this.cueSeq++}-${pick.podId}`
      this.activeCues.set(pick.podId, {
        cueId,
        podId: pick.podId,
        color: pick.color,
        at,
        round: this.round,
      })
      this.push({
        type: 'cue',
        at,
        round: this.round,
        podId: pick.podId,
        color: pick.color,
        cueId,
      })
      await this.safeSetColor(pick.podId, pick.color)
    }

    const timeoutMs = timeoutOf(this.exercise.cueEnd)
    if (timeoutMs !== null) {
      this.wait(timeoutMs, () => {
        void this.handleTimeout()
      })
    }
  }

  private async handleTimeout(): Promise<void> {
    if (this.status !== 'cueing') return
    const remaining = [...this.activeCues.values()]
    this.activeCues.clear()
    for (const cue of remaining) {
      this.push({
        type: 'miss',
        at: this.nowFn(),
        round: cue.round,
        podId: cue.podId,
        cueId: cue.cueId,
      })
      await this.safeLightsOff(cue.podId)
    }
    await this.scheduleDelay()
  }

  private async finishRound(): Promise<void> {
    this.clearTimers()
    await this.abortActiveCues('round-end')
    if (this.round >= this.exercise.rounds) {
      if (this.isDuel()) {
        await this.celebrateDuel()
      }
      if (this.stopping || this.status === 'stopped' || this.status === 'completed') {
        return
      }
      await this.stop('complete')
      return
    }
    await this.startRest()
  }

  private async startRest(): Promise<void> {
    const durationMs = this.exercise.restMs
    this.status = 'resting'
    this.push({
      type: 'round-rest',
      at: this.nowFn(),
      round: this.round,
      durationMs,
    })
    if (durationMs <= 0) {
      await this.startRound(this.round + 1)
      return
    }
    this.wait(durationMs, () => {
      void this.startRound(this.round + 1)
    })
  }

  private stopReached(): boolean {
    const stop = this.exercise.stop
    if (stop.mode === 'hits') {
      return this.hitsThisRound >= stop.count
    }
    return this.nowFn() - this.roundStartedAt >= stop.durationMs
  }

  private nextDelay(): number {
    const delay = this.exercise.delay
    if (delay.mode === 'fixed') return delay.ms
    return randomInt(this.rng, delay.minMs, delay.maxMs)
  }

  private isDuel(): boolean {
    return isDuelExercise(this.exercise)
  }

  private enqueueDuel(task: () => Promise<void>): Promise<void> {
    const run = this.duelChain.then(task, task)
    this.duelChain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private async issueDuelCues(): Promise<void> {
    const colors = this.exercise.colors.slice(0, 2)
    const used = new Set(this.activeCues.keys())
    const activeColors = new Set([...this.activeCues.values()].map((cue) => cue.color))
    for (const color of colors) {
      if (activeColors.has(color)) continue
      const podId = this.pickDuelPod(used)
      if (!podId) {
        this.status = 'paused'
        this.pauseReason = 'Ingen tilgængelige pods til cue'
        this.pendingAfterPause = 'delay'
        this.push({ type: 'pause', at: this.nowFn(), reason: this.pauseReason })
        return
      }
      used.add(podId)
      await this.lightDuelCue(podId, color)
    }
    this.scheduleDuelRoundTimer()
  }

  private async lightDuelCue(podId: string, color: ColorName): Promise<void> {
    if (this.status === 'stopped' || this.status === 'completed' || this.status === 'paused') {
      return
    }
    this.status = 'cueing'
    const at = this.nowFn()
    const cueId = `${this.round}-${this.cueSeq++}-${podId}`
    this.activeCues.set(podId, {
      cueId,
      podId,
      color,
      at,
      round: this.round,
    })
    this.push({
      type: 'cue',
      at,
      round: this.round,
      podId,
      color,
      cueId,
    })
    await this.safeSetColor(podId, color)
    const timeoutMs = timeoutOf(this.exercise.cueEnd)
    if (timeoutMs !== null) {
      const timer = setTimeout(() => {
        this.cueTimers.delete(cueId)
        void this.handleDuelTimeout(cueId)
      }, timeoutMs)
      this.cueTimers.set(cueId, timer)
    }
  }

  private async handleDuelTimeout(cueId: string): Promise<void> {
    await this.enqueueDuel(async () => {
      if (this.status !== 'cueing') return
      if (this.stopReached()) {
        await this.finishRound()
        return
      }
      const cue = [...this.activeCues.values()].find((item) => item.cueId === cueId)
      if (!cue) return
      this.activeCues.delete(cue.podId)
      this.push({
        type: 'miss',
        at: this.nowFn(),
        round: cue.round,
        podId: cue.podId,
        cueId: cue.cueId,
      })
      await this.safeLightsOff(cue.podId)
      if (this.stopReached()) {
        await this.finishRound()
        return
      }
      await this.relocateDuelCue(cue.color, cue.podId)
    })
  }

  private async relocateDuelCue(color: ColorName, fromPodId: string): Promise<void> {
    if (this.status === 'stopped' || this.status === 'completed' || this.status === 'paused') {
      return
    }
    if (this.stopReached()) {
      await this.finishRound()
      return
    }
    const podId = this.pickDuelPod(new Set(), fromPodId)
    if (!podId) {
      this.status = 'paused'
      this.pauseReason = 'Ingen tilgængelige pods til cue'
      this.pendingAfterPause = 'delay'
      this.push({ type: 'pause', at: this.nowFn(), reason: this.pauseReason })
      return
    }
    await this.lightDuelCue(podId, color)
  }

  private pickDuelPod(exclude: Set<string>, justLeft?: string): string | undefined {
    const lit = new Set(this.activeCues.keys())
    const live = this.liveDuelPods().filter(
      (podId) => !lit.has(podId) && !exclude.has(podId),
    )
    if (live.length === 0) return undefined
    const preferred = justLeft ? live.filter((podId) => podId !== justLeft) : live
    const pool = preferred.length > 0 ? preferred : live
    return pool[pickIndex(this.rng, pool.length)]
  }

  private liveDuelPods(): string[] {
    return [...this.availablePods].filter((podId) =>
      this.assignments.some((group) => group.podIds.includes(podId)),
    )
  }

  private async celebrateDuel(): Promise<void> {
    if (this.stopping) return
    this.status = 'celebrating'
    this.emit()
    const winner = this.duelWinnerColor()
    const colors = this.exercise.colors.slice(0, 2)
    for (let cycle = 0; cycle < DUEL_CELEBRATE_CYCLES; cycle++) {
      if (!this.stillCelebrating()) return
      if (winner) {
        await this.showCelebrateColor(winner)
        await this.delay(DUEL_CELEBRATE_ON_MS)
        if (!this.stillCelebrating()) return
        await this.hideCelebrateColor()
        await this.delay(DUEL_CELEBRATE_OFF_MS)
      } else {
        const first = colors[0]
        const second = colors[1]
        if (first) {
          await this.showCelebrateColor(first)
          await this.delay(DUEL_CELEBRATE_ON_MS)
        }
        if (!this.stillCelebrating()) return
        if (second) {
          await this.showCelebrateColor(second)
          await this.delay(DUEL_CELEBRATE_ON_MS)
        }
      }
    }
    if (winner && this.stillCelebrating()) {
      await this.showCelebrateColor(winner)
    }
  }

  private duelWinnerColor(): ColorName | null {
    const winner = winningColor(this.getLiveColorScores())
    if (!winner || !COLOR_ORDER.includes(winner as ColorName)) return null
    return winner as ColorName
  }

  private stillCelebrating(): boolean {
    return this.status === 'celebrating' && !this.stopping
  }

  private async showCelebrateColor(color: ColorName): Promise<void> {
    this.celebrateColor = color
    this.emit()
    await Promise.all(this.liveDuelPods().map((podId) => this.safeSetColor(podId, color)))
  }

  private async hideCelebrateColor(): Promise<void> {
    this.celebrateColor = null
    this.emit()
    await Promise.all(this.liveDuelPods().map((podId) => this.safeLightsOff(podId)))
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        this.delayResolvers.delete(done)
        resolve()
      }
      this.delayResolvers.add(done)
      this.wait(ms, done)
    })
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  private scheduleDuelRoundTimer(): void {
    const stop = this.exercise.stop
    if (stop.mode !== 'time') return
    const remaining = stop.durationMs - (this.nowFn() - this.roundStartedAt)
    if (remaining <= 0) {
      void this.finishRound()
      return
    }
    if (this.roundTimer !== null) {
      clearTimeout(this.roundTimer)
    }
    this.roundTimer = setTimeout(() => {
      this.roundTimer = null
      void this.enqueueDuel(() => this.finishRound())
    }, remaining)
  }

  private pickCueSet(): { podId: string; color: ColorName }[] {
    const count = Math.min(
      this.exercise.simultaneousCount,
      this.livePodCount(),
    )
    const used = new Set<string>()
    const picks: { podId: string; color: ColorName }[] = []
    for (let i = 0; i < count; i++) {
      const group = this.pickGroup(used)
      if (!group) break
      const podId = this.pickPod(group, used)
      if (!podId) break
      used.add(podId)
      picks.push({ podId, color: this.pickColor() })
    }
    return picks
  }

  private livePodCount(): number {
    return [...this.availablePods].filter((podId) =>
      this.assignments.some((group) => group.podIds.includes(podId)),
    ).length
  }

  private pickGroup(usedPods: Set<string>): GroupAssignment | undefined {
    const candidates = this.assignments.filter((group) =>
      group.podIds.some((podId) => this.availablePods.has(podId) && !usedPods.has(podId)),
    )
    if (candidates.length === 0) return undefined
    if (this.exercise.groupOrder === 'sequence') {
      for (let i = 0; i < this.assignments.length; i++) {
        const index = (this.groupCursor + i) % this.assignments.length
        const group = this.assignments[index]
        if (group && candidates.includes(group)) {
          this.groupCursor = (index + 1) % this.assignments.length
          return group
        }
      }
    }
    return candidates[pickIndex(this.rng, candidates.length)]
  }

  private pickPod(group: GroupAssignment, usedPods: Set<string>): string | undefined {
    const live = group.podIds.filter(
      (podId) => this.availablePods.has(podId) && !usedPods.has(podId),
    )
    if (live.length === 0) return undefined
    if (this.exercise.podOrder === 'sequence') {
      const cursor = this.podCursors.get(group.groupId) ?? 0
      for (let i = 0; i < group.podIds.length; i++) {
        const podId = group.podIds[(cursor + i) % group.podIds.length]
        if (podId && live.includes(podId)) {
          this.podCursors.set(group.groupId, (cursor + i + 1) % group.podIds.length)
          return podId
        }
      }
    }
    const bagKey = group.groupId
    let bag = this.shuffleBags.get(bagKey) ?? []
    bag = bag.filter((podId) => live.includes(podId))
    if (bag.length === 0) {
      bag = [...live]
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1))
        const current = bag[i]
        const swap = bag[j]
        if (current === undefined || swap === undefined) continue
        bag[i] = swap
        bag[j] = current
      }
    }
    const podId = bag.shift()
    this.shuffleBags.set(bagKey, bag)
    return podId
  }

  private pickColor(): ColorName {
    const colors = this.exercise.colors
    if (colors.length === 0) return 'red'
    if (this.exercise.colorOrder === 'sequence') {
      const color = colors[this.colorCursor % colors.length] ?? 'red'
      this.colorCursor += 1
      return color
    }
    if (this.colorBag.length === 0) {
      this.colorBag = [...colors]
      for (let i = this.colorBag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1))
        const current = this.colorBag[i]
        const swap = this.colorBag[j]
        if (current === undefined || swap === undefined) continue
        this.colorBag[i] = swap
        this.colorBag[j] = current
      }
    }
    return this.colorBag.shift() ?? colors[0] ?? 'red'
  }

  private async abortActiveCues(
    reason: 'disconnect' | 'stop' | 'pause' | 'round-end',
  ): Promise<void> {
    const remaining = [...this.activeCues.values()]
    this.activeCues.clear()
    for (const cue of remaining) {
      this.push({
        type: 'cue-aborted',
        at: this.nowFn(),
        round: cue.round,
        podId: cue.podId,
        cueId: cue.cueId,
        reason,
      })
      await this.safeLightsOff(cue.podId)
    }
  }

  private async safeSetColor(podId: string, color: ColorName): Promise<void> {
    try {
      await this.lights.setColor(podId, colorRgb(color), {
        autoOffOnTap: this.exercise.autoOffOnTap,
        dim: this.exercise.dim,
      })
    } catch {
      // Keep the session alive; a failed write is surfaced via later disconnect/miss.
    }
  }

  private async safeLightsOff(podId: string): Promise<void> {
    try {
      await this.lights.lightsOff(podId)
    } catch {
      /* ignore */
    }
  }

  private async safeLightsOffAll(): Promise<void> {
    try {
      await this.lights.lightsOffAll()
    } catch {
      /* ignore */
    }
  }

  private wait(ms: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      fn()
    }, ms)
    this.timers.add(timer)
  }

  private clearCueTimer(cueId: string): void {
    const timer = this.cueTimers.get(cueId)
    if (!timer) return
    clearTimeout(timer)
    this.cueTimers.delete(cueId)
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    for (const timer of this.cueTimers.values()) clearTimeout(timer)
    this.cueTimers.clear()
    if (this.roundTimer !== null) {
      clearTimeout(this.roundTimer)
      this.roundTimer = null
    }
    for (const done of this.delayResolvers) done()
    this.delayResolvers.clear()
  }

  private push(event: SessionEvent): void {
    this.events.push(event)
    for (const listener of this.listeners) listener()
  }
}
