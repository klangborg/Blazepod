import type { ColorName } from './colors'
import { COLOR_ORDER } from './colors'

export const EXERCISE_VERSION = 1 as const

export type OrderMode = 'random' | 'sequence'

export interface PodGroup {
  id: string
  name: string
}

export type CueEnd =
  | { mode: 'tap' }
  | { mode: 'timeout'; timeoutMs: number }
  | { mode: 'tap-or-timeout'; timeoutMs: number }

export type DelaySpec =
  | { mode: 'fixed'; ms: number }
  | { mode: 'random'; minMs: number; maxMs: number }

export type StopSpec =
  | { mode: 'time'; durationMs: number }
  | { mode: 'hits'; count: number }

export interface Exercise {
  id: string
  version: typeof EXERCISE_VERSION
  name: string
  notes: string
  createdAt: string
  updatedAt: string
  groups: PodGroup[]
  groupOrder: OrderMode
  podOrder: OrderMode
  simultaneousCount: number
  colors: ColorName[]
  colorOrder: OrderMode
  cueEnd: CueEnd
  delay: DelaySpec
  stop: StopSpec
  rounds: number
  restMs: number
  autoOffOnTap: boolean
  dim: number
}

export interface ExerciseInput {
  name: string
  notes?: string
  groups?: PodGroup[]
  groupOrder?: OrderMode
  podOrder?: OrderMode
  simultaneousCount?: number
  colors?: ColorName[]
  colorOrder?: OrderMode
  cueEnd?: CueEnd
  delay?: DelaySpec
  stop?: StopSpec
  rounds?: number
  restMs?: number
  autoOffOnTap?: boolean
  dim?: number
}

export function newId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function createExercise(input: ExerciseInput): Exercise {
  const timestamp = nowIso()
  const exercise: Exercise = {
    id: newId(),
    version: EXERCISE_VERSION,
    name: input.name.trim() || 'Ny øvelse',
    notes: input.notes?.trim() ?? '',
    createdAt: timestamp,
    updatedAt: timestamp,
    groups: input.groups?.length ? input.groups : [{ id: newId(), name: 'Alle' }],
    groupOrder: input.groupOrder ?? 'random',
    podOrder: input.podOrder ?? 'random',
    simultaneousCount: input.simultaneousCount ?? 1,
    colors: input.colors?.length ? input.colors : ['red', 'blue', 'green'],
    colorOrder: input.colorOrder ?? 'random',
    cueEnd: input.cueEnd ?? { mode: 'tap-or-timeout', timeoutMs: 2500 },
    delay: input.delay ?? { mode: 'fixed', ms: 800 },
    stop: input.stop ?? { mode: 'hits', count: 20 },
    rounds: input.rounds ?? 1,
    restMs: input.restMs ?? 10000,
    autoOffOnTap: input.autoOffOnTap ?? true,
    dim: input.dim ?? 1,
  }
  return exercise
}

export function cloneExercise(source: Exercise, name = `${source.name} (kopi)`): Exercise {
  const timestamp = nowIso()
  return {
    ...structuredClone(source),
    id: newId(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    groups: source.groups.map((group) => ({ ...group, id: newId() })),
  }
}

export interface ValidationIssue {
  field: string
  message: string
}

export function validateExercise(exercise: Exercise): { issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  if (!exercise.name.trim()) {
    issues.push({ field: 'name', message: 'Øvelsen skal have et navn.' })
  }
  if (exercise.groups.length < 1) {
    issues.push({ field: 'groups', message: 'Mindst én pod-gruppe er påkrævet.' })
  }
  if (exercise.simultaneousCount < 1 || exercise.simultaneousCount > 12) {
    issues.push({
      field: 'simultaneousCount',
      message: 'Antal samtidige pods skal være mellem 1 og 12.',
    })
  }
  if (exercise.colors.length < 1) {
    issues.push({ field: 'colors', message: 'Vælg mindst én farve.' })
  }
  for (const color of exercise.colors) {
    if (!COLOR_ORDER.includes(color)) {
      issues.push({ field: 'colors', message: `Ukendt farve: ${color}` })
    }
  }
  if (exercise.cueEnd.mode !== 'tap') {
    if (exercise.cueEnd.timeoutMs < 200 || exercise.cueEnd.timeoutMs > 30_000) {
      issues.push({ field: 'cueEnd', message: 'Timeout skal være mellem 200 ms og 30 s.' })
    }
  }
  if (exercise.delay.mode === 'fixed') {
    if (exercise.delay.ms < 0 || exercise.delay.ms > 15_000) {
      issues.push({ field: 'delay', message: 'Pause skal være mellem 0 og 15 s.' })
    }
  } else if (
    exercise.delay.minMs < 0 ||
    exercise.delay.maxMs > 15_000 ||
    exercise.delay.maxMs < exercise.delay.minMs
  ) {
    issues.push({ field: 'delay', message: 'Tilfældig pause har ugyldigt interval.' })
  }
  if (exercise.stop.mode === 'time') {
    if (exercise.stop.durationMs < 1000 || exercise.stop.durationMs > 60 * 60 * 1000) {
      issues.push({ field: 'stop', message: 'Varighed skal være mellem 1 s og 60 min.' })
    }
  } else if (exercise.stop.count < 1 || exercise.stop.count > 500) {
    issues.push({ field: 'stop', message: 'Antal hits skal være mellem 1 og 500.' })
  }
  if (exercise.rounds < 1 || exercise.rounds > 50) {
    issues.push({ field: 'rounds', message: 'Antal runder skal være mellem 1 og 50.' })
  }
  if (exercise.restMs < 0 || exercise.restMs > 10 * 60 * 1000) {
    issues.push({ field: 'restMs', message: 'Hvile skal være mellem 0 og 10 min.' })
  }
  if (exercise.dim < 0.05 || exercise.dim > 1) {
    issues.push({ field: 'dim', message: 'Lysstyrke skal være mellem 5 % og 100 %.' })
  }
  return { issues }
}

export function timeoutOf(cueEnd: CueEnd): number | null {
  return cueEnd.mode === 'tap' ? null : cueEnd.timeoutMs
}

export function minPodsNeeded(exercise: Exercise): number {
  return Math.max(exercise.simultaneousCount, exercise.groups.length)
}

export const PRESET_EXERCISES: ExerciseInput[] = [
  {
    name: 'Hurtig reaktion',
    notes: 'Én pod ad gangen. Ram 20 hits så hurtigt som muligt.',
    podOrder: 'random',
    simultaneousCount: 1,
    colors: ['red', 'blue', 'green'],
    colorOrder: 'random',
    cueEnd: { mode: 'tap-or-timeout', timeoutMs: 2000 },
    delay: { mode: 'fixed', ms: 600 },
    stop: { mode: 'hits', count: 20 },
    rounds: 1,
    autoOffOnTap: true,
    dim: 1,
  },
  {
    name: 'All-round 45 s',
    notes: 'Alle tilsluttede pods. Tilfældige cues i 45 sekunder.',
    podOrder: 'random',
    simultaneousCount: 1,
    colors: ['red', 'green', 'blue', 'yellow'],
    colorOrder: 'random',
    cueEnd: { mode: 'tap-or-timeout', timeoutMs: 1800 },
    delay: { mode: 'random', minMs: 400, maxMs: 1200 },
    stop: { mode: 'time', durationMs: 45_000 },
    rounds: 1,
    autoOffOnTap: true,
    dim: 1,
  },
  {
    name: 'To pods, tre runder',
    notes: 'To samtidige lys. Tre runder à 12 hits med 15 s hvile.',
    podOrder: 'random',
    simultaneousCount: 2,
    colors: ['red', 'blue'],
    colorOrder: 'sequence',
    cueEnd: { mode: 'tap-or-timeout', timeoutMs: 2500 },
    delay: { mode: 'fixed', ms: 500 },
    stop: { mode: 'hits', count: 12 },
    rounds: 3,
    restMs: 15_000,
    autoOffOnTap: true,
    dim: 1,
  },
]
