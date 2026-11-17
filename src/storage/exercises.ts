import { createExercise, PRESET_EXERCISES, type Exercise } from '../domain/exercises'
import { getDb } from './db'

const SEEDED_KEY = 'presets-seeded-v1'
const DUEL_SEEDED_KEY = 'presets-seeded-duel-v1'

export async function seedExercisesIfEmpty(): Promise<void> {
  try {
    const db = await getDb()
    const seeded = await db.get('meta', SEEDED_KEY)
    if (seeded) return
    const count = await db.count('exercises')
    if (count === 0) {
      for (const preset of PRESET_EXERCISES) {
        await db.put('exercises', createExercise(preset))
      }
      await db.put('meta', { key: DUEL_SEEDED_KEY, value: true })
    }
    await db.put('meta', { key: SEEDED_KEY, value: true })
  } catch {
    /* IndexedDB kan mangle */
  }
}

export async function seedDuelPresetIfMissing(): Promise<void> {
  try {
    const db = await getDb()
    const seeded = await db.get('meta', DUEL_SEEDED_KEY)
    if (seeded) return
    const items = await db.getAll('exercises')
    const hasDuel = items.some((exercise) => exercise.kind === 'duel')
    if (!hasDuel) {
      const preset = PRESET_EXERCISES.find((item) => item.kind === 'duel')
      if (preset) await db.put('exercises', createExercise(preset))
    }
    await db.put('meta', { key: DUEL_SEEDED_KEY, value: true })
  } catch {
    /* IndexedDB kan mangle */
  }
}

export async function listExercises(): Promise<Exercise[]> {
  await seedExercisesIfEmpty()
  await seedDuelPresetIfMissing()
  try {
    const db = await getDb()
    const items = await db.getAllFromIndex('exercises', 'by-updated')
    return items.reverse()
  } catch {
    return PRESET_EXERCISES.map((preset) => createExercise(preset))
  }
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  try {
    const db = await getDb()
    return db.get('exercises', id)
  } catch {
    return undefined
  }
}

export async function saveExercise(exercise: Exercise): Promise<void> {
  try {
    const db = await getDb()
    await db.put('exercises', {
      ...exercise,
      updatedAt: new Date().toISOString(),
    })
  } catch {
    /* persistens er bedst-effort */
  }
}

export async function deleteExercise(id: string): Promise<void> {
  try {
    const db = await getDb()
    await db.delete('exercises', id)
  } catch {
    /* ignore */
  }
}
