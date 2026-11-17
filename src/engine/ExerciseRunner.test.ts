import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExercise } from '../domain/exercises'
import { colorRgb } from '../domain/colors'
import type { LightsController } from '../ble/transport'
import type { TapNotification } from '../ble/protocol'
import { TapState } from '../ble/protocol'
import { duelCelebrateDurationMs, ExerciseRunner } from './ExerciseRunner'

class FakeLights implements LightsController {
  on = new Set<string>()
  writes: { podId: string; rgb: { r: number; g: number; b: number } }[] = []
  async setColor(
    podId: string,
    rgb: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 },
  ): Promise<void> {
    this.on.add(podId)
    this.writes.push({ podId, rgb })
  }
  async lightsOff(podId: string): Promise<void> {
    this.on.delete(podId)
  }
  async lightsOffAll(): Promise<void> {
    this.on.clear()
  }
}

function litTap(reactionMs: number): TapNotification {
  return {
    state: TapState.LitStayOn,
    stateName: 'lit-stay-on',
    reactionMs,
    unknown: new Uint8Array(3),
    lit: true,
    autoOff: false,
    raw: new Uint8Array(8),
  }
}

function unlitTap(): TapNotification {
  return {
    state: TapState.Unlit,
    stateName: 'unlit',
    reactionMs: 0,
    unknown: new Uint8Array(3),
    lit: false,
    autoOff: false,
    raw: new Uint8Array(8),
  }
}

describe('ExerciseRunner', () => {
  let lights: FakeLights

  beforeEach(() => {
    lights = new FakeLights()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('scores a hit from a lit tap and uses pod milliseconds', async () => {
    const exercise = createExercise({
      name: 'Hit',
      delay: { mode: 'fixed', ms: 100 },
      cueEnd: { mode: 'tap-or-timeout', timeoutMs: 2000 },
      stop: { mode: 'hits', count: 1 },
      colors: ['red'],
      colorOrder: 'sequence',
      podOrder: 'sequence',
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['p1'] }],
      { lights, seed: 1 },
    )
    await runner.start()
    await vi.advanceTimersByTimeAsync(100)
    expect(runner.getStatus()).toBe('cueing')
    expect(lights.on.has('p1')).toBe(true)
    await runner.handleTap('p1', litTap(173))
    expect(runner.getLiveHits()).toBe(1)
    expect(runner.getResult().bestReactionMs).toBe(173)
    expect(runner.getEvents().some((event) => event.type === 'hit' && event.source === 'pod')).toBe(
      true,
    )
    await vi.advanceTimersByTimeAsync(1)
    expect(runner.getStatus()).toBe('completed')
  })

  it('scores a miss on timeout instead of tap', async () => {
    const exercise = createExercise({
      name: 'Miss',
      delay: { mode: 'fixed', ms: 50 },
      cueEnd: { mode: 'timeout', timeoutMs: 200 },
      stop: { mode: 'hits', count: 9 },
      rounds: 1,
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['p1'] }],
      { lights, seed: 2 },
    )
    await runner.start()
    await vi.advanceTimersByTimeAsync(50)
    await vi.advanceTimersByTimeAsync(200)
    expect(runner.getLiveMisses()).toBe(1)
    expect(runner.getEvents().some((event) => event.type === 'miss')).toBe(true)
  })

  it('ignores unlit and stale taps', async () => {
    const exercise = createExercise({
      name: 'Stale',
      delay: { mode: 'fixed', ms: 10 },
      cueEnd: { mode: 'tap' },
      stop: { mode: 'hits', count: 3 },
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['p1'] }],
      { lights, seed: 3, staleGraceMs: 50 },
    )
    await runner.start()
    await vi.advanceTimersByTimeAsync(10)
    await runner.handleTap('p1', unlitTap())
    await runner.handleTap('p2', litTap(10))
    await runner.handleTap('p1', litTap(10_000))
    expect(runner.getLiveHits()).toBe(0)
    expect(runner.getEvents().filter((event) => event.type === 'unlit-tap').length).toBeGreaterThan(0)
    expect(runner.getEvents().some((event) => event.type === 'stale-tap')).toBe(true)
  })

  it('is deterministic with a seed', async () => {
    const exercise = createExercise({
      name: 'Seed',
      delay: { mode: 'fixed', ms: 0 },
      cueEnd: { mode: 'tap' },
      stop: { mode: 'hits', count: 4 },
      colors: ['red', 'blue', 'green'],
      colorOrder: 'random',
      podOrder: 'random',
    })
    const a = new ExerciseRunner(exercise, [{ groupId: 'g', podIds: ['p1', 'p2', 'p3'] }], {
      lights: new FakeLights(),
      seed: 42,
    })
    const b = new ExerciseRunner(exercise, [{ groupId: 'g', podIds: ['p1', 'p2', 'p3'] }], {
      lights: new FakeLights(),
      seed: 42,
    })
    await a.start()
    await b.start()
    const colorsA = a.getActiveCues().map((cue) => `${cue.podId}:${cue.color}`)
    const colorsB = b.getActiveCues().map((cue) => `${cue.podId}:${cue.color}`)
    expect(colorsA).toEqual(colorsB)
  })

  it('lights several pods at once', async () => {
    const exercise = createExercise({
      name: 'Multi',
      simultaneousCount: 2,
      delay: { mode: 'fixed', ms: 0 },
      cueEnd: { mode: 'tap' },
      stop: { mode: 'hits', count: 2 },
      podOrder: 'sequence',
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['a', 'b', 'c'] }],
      { lights, seed: 9 },
    )
    await runner.start()
    expect(runner.getActiveCues()).toHaveLength(2)
  })

  it('aborts the current cue on disconnect instead of scoring a miss', async () => {
    const exercise = createExercise({
      name: 'Disconnect',
      delay: { mode: 'fixed', ms: 0 },
      cueEnd: { mode: 'tap-or-timeout', timeoutMs: 5000 },
      stop: { mode: 'hits', count: 10 },
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['p1'] }],
      { lights, seed: 4 },
    )
    await runner.start()
    expect(runner.getStatus()).toBe('cueing')
    await runner.handleDisconnect('p1')
    expect(runner.getStatus()).toBe('paused')
    expect(runner.getLiveMisses()).toBe(0)
    expect(runner.getEvents().some((event) => event.type === 'cue-aborted')).toBe(true)
  })

  it('turns all lights off on stop', async () => {
    const exercise = createExercise({
      name: 'Stop',
      delay: { mode: 'fixed', ms: 0 },
      cueEnd: { mode: 'tap' },
      stop: { mode: 'hits', count: 99 },
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['p1'] }],
      { lights, seed: 5 },
    )
    await runner.start()
    expect(lights.on.size).toBeGreaterThan(0)
    await runner.stop()
    expect(lights.on.size).toBe(0)
    expect(runner.getStatus()).toBe('stopped')
  })

  it('runs rest between rounds', async () => {
    const exercise = createExercise({
      name: 'Rounds',
      delay: { mode: 'fixed', ms: 0 },
      cueEnd: { mode: 'tap' },
      stop: { mode: 'hits', count: 1 },
      rounds: 2,
      restMs: 300,
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['p1'] }],
      { lights, seed: 6 },
    )
    await runner.start()
    const first = runner.getActiveCues()[0]
    expect(first).toBeTruthy()
    await runner.handleTap(first!.podId, litTap(90))
    expect(runner.getStatus()).toBe('resting')
    await vi.advanceTimersByTimeAsync(300)
    expect(runner.getRound()).toBe(2)
  })

  it('lights one pod per duel color at the same time', async () => {
    const exercise = createExercise({
      name: 'Duel',
      kind: 'duel',
      podCount: 4,
      colors: ['blue', 'red'],
      cueEnd: { mode: 'tap-or-timeout', timeoutMs: 2000 },
      stop: { mode: 'time', durationMs: 5000 },
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['p1', 'p2', 'p3', 'p4'] }],
      { lights, seed: 11 },
    )
    await runner.start()
    const cues = runner.getActiveCues()
    expect(cues).toHaveLength(2)
    expect(new Set(cues.map((cue) => cue.podId)).size).toBe(2)
    expect(new Set(cues.map((cue) => cue.color))).toEqual(new Set(['blue', 'red']))
  })

  it('moves only the tapped duel color to another pod', async () => {
    const exercise = createExercise({
      name: 'Duel',
      kind: 'duel',
      podCount: 4,
      colors: ['blue', 'red'],
      cueEnd: { mode: 'tap-or-timeout', timeoutMs: 2000 },
      stop: { mode: 'time', durationMs: 5000 },
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['p1', 'p2', 'p3', 'p4'] }],
      { lights, seed: 12 },
    )
    await runner.start()
    const blue = runner.getActiveCues().find((cue) => cue.color === 'blue')
    const red = runner.getActiveCues().find((cue) => cue.color === 'red')
    expect(blue).toBeTruthy()
    expect(red).toBeTruthy()
    await runner.handleTap(blue!.podId, litTap(120))
    const after = runner.getActiveCues()
    expect(after).toHaveLength(2)
    expect(after.find((cue) => cue.podId === red!.podId)?.color).toBe('red')
    expect(after.some((cue) => cue.color === 'blue' && cue.podId !== blue!.podId)).toBe(true)
    expect(after.some((cue) => cue.podId === blue!.podId)).toBe(false)
    expect(lights.on.has(red!.podId)).toBe(true)
    expect(lights.on.has(blue!.podId)).toBe(false)
    expect(runner.getLiveHits()).toBe(1)
    expect(runner.getLiveColorScores().find((score) => score.color === 'blue')?.hits).toBe(1)
  })

  it('times out only one duel color and relocates that light', async () => {
    const exercise = createExercise({
      name: 'Duel',
      kind: 'duel',
      podCount: 4,
      colors: ['blue', 'red'],
      cueEnd: { mode: 'tap-or-timeout', timeoutMs: 200 },
      stop: { mode: 'time', durationMs: 5000 },
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['p1', 'p2', 'p3', 'p4'] }],
      { lights, seed: 13 },
    )
    await runner.start()
    await vi.advanceTimersByTimeAsync(50)
    const blue = runner.getActiveCues().find((cue) => cue.color === 'blue')
    const red = runner.getActiveCues().find((cue) => cue.color === 'red')
    expect(blue).toBeTruthy()
    expect(red).toBeTruthy()
    await runner.handleTap(blue!.podId, litTap(50))
    const blueAfterHit = runner.getActiveCues().find((cue) => cue.color === 'blue')
    expect(blueAfterHit).toBeTruthy()
    await vi.advanceTimersByTimeAsync(150)
    expect(runner.getLiveMisses()).toBe(1)
    expect(runner.getLiveColorScores().find((score) => score.color === 'red')?.misses).toBe(1)
    const after = runner.getActiveCues()
    expect(after.find((cue) => cue.color === 'blue')?.podId).toBe(blueAfterHit!.podId)
    expect(after.find((cue) => cue.color === 'red')?.podId).not.toBe(red!.podId)
    expect(lights.on.has(blueAfterHit!.podId)).toBe(true)
  })

  it('aborts remaining duel cues at round end without scoring misses', async () => {
    const exercise = createExercise({
      name: 'Duel',
      kind: 'duel',
      podCount: 4,
      colors: ['blue', 'red'],
      cueEnd: { mode: 'tap-or-timeout', timeoutMs: 5000 },
      stop: { mode: 'time', durationMs: 300 },
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['p1', 'p2', 'p3', 'p4'] }],
      { lights, seed: 14 },
    )
    await runner.start()
    expect(runner.getActiveCues()).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(300)
    expect(runner.getStatus()).toBe('celebrating')
    expect(runner.getLiveMisses()).toBe(0)
    expect(
      runner.getEvents().filter((event) => event.type === 'cue-aborted' && event.reason === 'round-end')
        .length,
    ).toBe(2)
    await vi.advanceTimersByTimeAsync(duelCelebrateDurationMs(true) + 20)
    expect(runner.getStatus()).toBe('completed')
  })

  it('blinks every duel pod in the winning color', async () => {
    const exercise = createExercise({
      name: 'Duel',
      kind: 'duel',
      podCount: 4,
      colors: ['blue', 'red'],
      cueEnd: { mode: 'tap-or-timeout', timeoutMs: 5000 },
      stop: { mode: 'time', durationMs: 250 },
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['p1', 'p2', 'p3', 'p4'] }],
      { lights, seed: 15 },
    )
    await runner.start()
    const blue = runner.getActiveCues().find((cue) => cue.color === 'blue')
    expect(blue).toBeTruthy()
    await runner.handleTap(blue!.podId, litTap(40))
    const before = lights.writes.length
    await vi.advanceTimersByTimeAsync(250)
    expect(runner.getStatus()).toBe('celebrating')
    await vi.advanceTimersByTimeAsync(duelCelebrateDurationMs(false) + 20)
    expect(runner.getStatus()).toBe('completed')
    const celebration = lights.writes.slice(before)
    const blueRgb = colorRgb('blue')
    expect(celebration.length).toBeGreaterThan(0)
    expect(celebration.every((write) => sameRgb(write.rgb, blueRgb))).toBe(true)
    expect(new Set(celebration.map((write) => write.podId))).toEqual(new Set(['p1', 'p2', 'p3', 'p4']))
  })

  it('blinks alternating colors when the duel is tied', async () => {
    const exercise = createExercise({
      name: 'Duel',
      kind: 'duel',
      podCount: 4,
      colors: ['blue', 'red'],
      cueEnd: { mode: 'tap-or-timeout', timeoutMs: 5000 },
      stop: { mode: 'time', durationMs: 250 },
    })
    const runner = new ExerciseRunner(
      exercise,
      [{ groupId: 'g', podIds: ['p1', 'p2', 'p3', 'p4'] }],
      { lights, seed: 16 },
    )
    await runner.start()
    const before = lights.writes.length
    await vi.advanceTimersByTimeAsync(250)
    expect(runner.getStatus()).toBe('celebrating')
    await vi.advanceTimersByTimeAsync(duelCelebrateDurationMs(true) + 20)
    expect(runner.getStatus()).toBe('completed')
    const celebration = lights.writes.slice(before)
    expect(celebration.some((write) => sameRgb(write.rgb, colorRgb('blue')))).toBe(true)
    expect(celebration.some((write) => sameRgb(write.rgb, colorRgb('red')))).toBe(true)
  })
})

function sameRgb(
  actual: { r: number; g: number; b: number },
  expected: { r: number; g: number; b: number },
): boolean {
  return actual.r === expected.r && actual.g === expected.g && actual.b === expected.b
}
