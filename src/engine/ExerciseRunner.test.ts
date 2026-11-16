import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExercise } from '../domain/exercises'
import type { LightsController } from '../ble/transport'
import type { TapNotification } from '../ble/protocol'
import { TapState } from '../ble/protocol'
import { ExerciseRunner } from './ExerciseRunner'

class FakeLights implements LightsController {
  on = new Set<string>()
  async setColor(podId: string): Promise<void> {
    this.on.add(podId)
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
})
