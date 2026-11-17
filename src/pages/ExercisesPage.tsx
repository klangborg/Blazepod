import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
        <h1 className="page-title">Øvelser</h1>
        <p className="lede">Gemt lokalt på denne enhed. Ingen konto og intet abonnement.</p>
      </div>
      <Link className="btn btn-primary btn-block" to="/exercises/new" style={{ textAlign: 'center' }}>
        Ny øvelse
      </Link>
      <div className="list">
        {exercises.map((exercise) => (
          <article className="list-item" key={exercise.id}>
            <strong>{exercise.name}</strong>
            <span className="muted">
              {isDuelExercise(exercise)
                ? `${minPodsNeeded(exercise)} pods · ${
                    exercise.stop.mode === 'time'
                      ? `${Math.round(exercise.stop.durationMs / 1000)} s`
                      : `${exercise.stop.count} hits`
                  }`
                : `${minPodsNeeded(exercise)}+ pods · ${exercise.rounds} runde${
                    exercise.rounds === 1 ? '' : 'r'
                  } · ${
                    exercise.stop.mode === 'hits'
                      ? `${exercise.stop.count} hits`
                      : `${Math.round(exercise.stop.durationMs / 1000)} s`
                  }`}
            </span>
            <div className="row">
              <Link className="btn" to={`/session/${exercise.id}`}>
                Start
              </Link>
              <Link className="btn btn-ghost" to={`/exercises/${exercise.id}/edit`}>
                Rediger
              </Link>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={async () => {
                  await saveExercise(cloneExercise(exercise))
                  await reload()
                }}
              >
                Kopiér
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={async () => {
                  if (!confirm(`Slet ${exercise.name}?`)) return
                  await deleteExercise(exercise.id)
                  await reload()
                }}
              >
                Slet
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
