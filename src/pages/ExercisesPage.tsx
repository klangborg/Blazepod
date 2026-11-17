import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PALETTE, type ColorName } from '../domain/colors'
import { cloneExercise, isDuelExercise, minPodsNeeded, type Exercise } from '../domain/exercises'
import { deleteExercise, listExercises, saveExercise } from '../storage/exercises'

export function ExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])

  async function reload(): Promise<void> {
    setExercises(await listExercises())
  }

  useEffect(() => {
    void reload()
  }, [])

  return (
    <main className="page app-shell">
      <div>
        <div className="page-head">
          <h1 className="page-title">Øvelser</h1>
          <Link className="btn btn-primary" to="/exercises/new">
            Ny øvelse
          </Link>
        </div>
        <p className="lede">Gemt lokalt på denne enhed. Ingen konto og intet abonnement.</p>
      </div>

      {exercises.length === 0 ? (
        <div className="card empty exercise-empty">
          <strong>Ingen øvelser endnu</strong>
          <p className="muted">Opret din første, så den ligger klar på telefonen.</p>
          <Link className="btn btn-primary" to="/exercises/new">
            Ny øvelse
          </Link>
        </div>
      ) : (
        <div className="exercise-grid">
          {exercises.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} onChanged={reload} />
          ))}
        </div>
      )}
    </main>
  )
}

function ExerciseCard({
  exercise,
  onChanged,
}: {
  exercise: Exercise
  onChanged: () => Promise<void>
}) {
  const duel = isDuelExercise(exercise)
  const pods = minPodsNeeded(exercise)

  return (
    <article className="exercise-card">
      <span className="exercise-accent" style={{ background: colorBar(exercise.colors) }} />
      <div className="exercise-card-head">
        <div>
          <div className="exercise-kicker">
            {duel ? <span className="badge badge-duel">To spillere</span> : <span className="muted exercise-kind">Standard</span>}
            <ColorDots colors={exercise.colors} />
          </div>
          <h2 className="exercise-name">{exercise.name}</h2>
          {exercise.notes ? <p className="exercise-notes">{exercise.notes}</p> : null}
        </div>
      </div>
      <ul className="exercise-meta">
        <li className="chip">{duel ? `${pods} pods` : `${pods}+ pods`}</li>
        <li className="chip">{stopLabel(exercise)}</li>
        {duel || exercise.rounds <= 1 ? null : (
          <li className="chip">{`${exercise.rounds} runder`}</li>
        )}
        {duel || exercise.simultaneousCount <= 1 ? null : (
          <li className="chip">{`${exercise.simultaneousCount} samtidige`}</li>
        )}
      </ul>
      <div className="exercise-actions">
        <Link className="btn btn-primary" to={`/session/${exercise.id}`}>
          Start
        </Link>
        <div className="exercise-tools">
          <Link className="btn btn-ghost btn-sm" to={`/exercises/${exercise.id}/edit`}>
            Rediger
          </Link>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={async () => {
              await saveExercise(cloneExercise(exercise))
              await onChanged()
            }}
          >
            Kopiér
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={async () => {
              if (!confirm(`Slet ${exercise.name}?`)) return
              await deleteExercise(exercise.id)
              await onChanged()
            }}
          >
            Slet
          </button>
        </div>
      </div>
    </article>
  )
}

function ColorDots({ colors }: { colors: ColorName[] }) {
  return (
    <span className="color-dots" aria-hidden="true">
      {colors.map((name) => (
        <span key={name} className="color-dot" style={{ background: rgb(name) }} />
      ))}
    </span>
  )
}

function stopLabel(exercise: Exercise): string {
  if (exercise.stop.mode === 'hits') return `${exercise.stop.count} hits`
  const seconds = Math.round(exercise.stop.durationMs / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes} min` : `${minutes}:${rest.toString().padStart(2, '0')}`
}

function colorBar(colors: ColorName[]): string {
  const first = colors[0]
  if (!first) return 'var(--accent)'
  if (colors.length === 1) return rgb(first)
  return `linear-gradient(180deg, ${colors.map(rgb).join(', ')})`
}

function rgb(name: ColorName): string {
  const color = PALETTE[name]
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}
