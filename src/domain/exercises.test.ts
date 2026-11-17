import { describe, expect, it } from 'vitest'
import { createExercise, isDuelExercise, minPodsNeeded, validateExercise } from './exercises'

describe('exercise model', () => {
  it('creates a versioned exercise with defaults', () => {
    const exercise = createExercise({ name: 'Test' })
    expect(exercise.version).toBe(1)
    expect(exercise.groups.length).toBe(1)
    expect(exercise.colors.length).toBeGreaterThan(0)
    expect(validateExercise(exercise).issues).toEqual([])
  })

  it('rejects empty colors and invalid ranges', () => {
    const exercise = createExercise({ name: 'Bad' })
    exercise.colors = []
    exercise.simultaneousCount = 0
    exercise.rounds = 0
    const issues = validateExercise(exercise).issues.map((issue) => issue.field)
    expect(issues).toContain('colors')
    expect(issues).toContain('simultaneousCount')
    expect(issues).toContain('rounds')
  })

  it('creates a duel exercise with two colors, timeout and a timed round', () => {
    const exercise = createExercise({ name: 'Duel', kind: 'duel' })
    expect(isDuelExercise(exercise)).toBe(true)
    expect(exercise.colors).toEqual(['blue', 'red'])
    expect(exercise.simultaneousCount).toBe(2)
    expect(exercise.podCount).toBe(4)
    expect(exercise.delay).toEqual({ mode: 'fixed', ms: 0 })
    expect(exercise.stop).toEqual({ mode: 'time', durationMs: 45_000 })
    expect(exercise.rounds).toBe(1)
    expect(minPodsNeeded(exercise)).toBe(4)
    expect(validateExercise(exercise).issues).toEqual([])
  })

  it('rejects a duel with matching colors or too few pods', () => {
    const exercise = createExercise({
      name: 'Duel',
      kind: 'duel',
      colors: ['red', 'red'],
      podCount: 2,
    })
    const fields = validateExercise(exercise).issues.map((issue) => issue.field)
    expect(fields).toContain('colors')
    expect(fields).toContain('podCount')
  })
})
