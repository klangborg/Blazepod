import { describe, expect, it } from 'vitest'
import { createExercise, validateExercise } from './exercises'

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
})
