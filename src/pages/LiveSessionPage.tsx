import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePods } from '../app/PodContext'
import { formatDuration, formatMs } from '../app/format'
import { minPodsNeeded, newId, type Exercise } from '../domain/exercises'
import { PALETTE } from '../domain/colors'
import { getExercise } from '../storage/exercises'
import { saveSession } from '../storage/history'
import { ExerciseRunner, type GroupAssignment } from '../engine/ExerciseRunner'
import type { SessionRecord } from '../domain/results'

export function LiveSessionPage() {
  const { exerciseId } = useParams()
  const navigate = useNavigate()
  const { manager, connected, connect, lightsOffAll, busy, error } = usePods()
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [runner, setRunner] = useState<ExerciseRunner | null>(null)
  const [, setTick] = useState(0)
  const saved = useRef(false)

  useEffect(() => {
    if (!exerciseId) return
    void getExercise(exerciseId).then((found) => setExercise(found ?? null))
  }, [exerciseId])

  useEffect(() => {
    if (!exercise) return
    setAssignments((current) => {
      const next = { ...current }
      for (const group of exercise.groups) {
        next[group.id] ??= []
      }
      return next
    })
  }, [exercise])

  useEffect(() => {
    if (!runner) return
    const unsub = runner.subscribe(() => setTick((value) => value + 1))
    const timer = window.setInterval(() => setTick((value) => value + 1), 250)
    return () => {
      unsub()
      window.clearInterval(timer)
    }
  }, [runner])

  useEffect(() => {
    if (!runner) return
    const unTap = manager.onTap((id, tap) => {
      void runner.handleTap(id, tap)
    })
    const unDisc = manager.onDisconnect((id) => {
      void runner.handleDisconnect(id)
    })
    return () => {
      unTap()
      unDisc()
    }
  }, [manager, runner])

  const runnerRef = useRef(runner)
  runnerRef.current = runner
  useEffect(() => {
    return () => {
      void runnerRef.current?.stop()
      void lightsOffAll()
    }
  }, [lightsOffAll])

  useEffect(() => {
    if (!runner) return
    const status = runner.getStatus()
    if (status !== 'completed' && status !== 'stopped') return
    if (saved.current) return
    saved.current = true
    const record = toRecord(exercise, runner)
    void saveSession(record).then(() => {
      if (status === 'completed') navigate(`/history/${record.id}`)
    })
  }, [exercise, navigate, runner, runner?.getStatus(), runner?.getEvents().length])

  const needed = exercise ? minPodsNeeded(exercise) : 1
  const enough = connected.length >= needed

  const grouped = useMemo(() => {
    if (!exercise) return []
    if (exercise.groups.length <= 1) {
      return [
        {
          groupId: exercise.groups[0]?.id ?? 'all',
          podIds: connected.map((pod) => pod.id),
        } satisfies GroupAssignment,
      ]
    }
    return exercise.groups.map((group) => ({
      groupId: group.id,
      podIds: assignments[group.id] ?? [],
    }))
  }, [assignments, connected, exercise])

  async function start(): Promise<void> {
    if (!exercise) return
    saved.current = false
    const instance = new ExerciseRunner(exercise, grouped, { lights: manager })
    setRunner(instance)
    await instance.start()
  }

  async function stop(): Promise<void> {
    await runner?.stop()
    await lightsOffAll()
  }

  if (!exercise) {
    return (
      <main className="live">
        <p>Indlæser øvelse…</p>
      </main>
    )
  }

  if (!runner) {
    return (
      <main className="live">
        <h1 className="page-title">{exercise.name}</h1>
        <p className="lede">{exercise.notes || 'Klar til start, når pods er tilsluttet.'}</p>
        {error ? <div className="banner error">{error}</div> : null}
        <div className="card">
          Forbundne pods: {connected.length} / mindst {needed}
        </div>
        {!enough && (
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void connect()}>
            Tilslut pod
          </button>
        )}
        {exercise.groups.length > 1 && (
          <section className="card stack">
            <h2>Tildel pods til grupper</h2>
            {exercise.groups.map((group) => (
              <label className="field" key={group.id}>
                <span>{group.name}</span>
                <select
                  multiple
                  value={assignments[group.id] ?? []}
                  onChange={(event) => {
                    const selected = [...event.target.selectedOptions].map((option) => option.value)
                    setAssignments((current) => ({ ...current, [group.id]: selected }))
                  }}
                >
                  {connected.map((pod) => (
                    <option key={pod.id} value={pod.id}>
                      {pod.givenName}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </section>
        )}
        <button className="btn btn-primary btn-block" type="button" disabled={!enough} onClick={() => void start()}>
          Start øvelse
        </button>
        <Link className="btn btn-ghost btn-block" to="/exercises" style={{ textAlign: 'center' }}>
          Tilbage
        </Link>
      </main>
    )
  }

  const result = runner.getResult()
  const status = runner.getStatus()
  const cues = runner.getActiveCues()

  return (
    <main className="live">
      <div className="row">
        <h1 className="page-title" style={{ margin: 0 }}>
          {exercise.name}
        </h1>
        <span className="badge">{statusLabel(status)}</span>
      </div>
      <div className="stats">
        <div className="stat">
          <span className="muted">Hits</span>
          <b>{runner.getLiveHits()}</b>
        </div>
        <div className="stat">
          <span className="muted">Miss</span>
          <b>{runner.getLiveMisses()}</b>
        </div>
        <div className="stat">
          <span className="muted">Bedst</span>
          <b>{formatMs(result.bestReactionMs)}</b>
        </div>
        <div className="stat">
          <span className="muted">Tid</span>
          <b>{formatDuration(runner.elapsedMs())}</b>
        </div>
      </div>
      <p className="muted">
        Runde {runner.getRound()} / {exercise.rounds}
        {exercise.stop.mode === 'hits'
          ? ` · mål ${exercise.stop.count} hits`
          : ` · ${Math.round(exercise.stop.durationMs / 1000)} s`}
      </p>
      {status === 'paused' && (
        <div className="banner error">
          Sat på pause: {runner.getPauseReason()}. Afbrudte cues tæller ikke som miss.
          <button
            className="btn btn-primary btn-block"
            type="button"
            style={{ marginTop: 10 }}
            onClick={() => void runner.resume()}
          >
            Fortsæt
          </button>
        </div>
      )}
      <div className="live-cues">
        {cues.length === 0 ? (
          <div className="card empty">{idleLabel(status)}</div>
        ) : (
          cues.map((cue) => {
            const color = PALETTE[cue.color]
            const pod = connected.find((item) => item.id === cue.podId)
            return (
              <div
                key={cue.cueId}
                className="cue-orb"
                style={{ background: `rgb(${color.r},${color.g},${color.b})` }}
              >
                {pod?.givenName ?? cue.podId.slice(0, 6)}
              </div>
            )
          })
        )}
      </div>
      <div className="stop-row">
        <button className="btn btn-danger" type="button" onClick={() => void stop()}>
          Stop og sluk
        </button>
        <button className="btn" type="button" onClick={() => void lightsOffAll()}>
          Sluk lys
        </button>
      </div>
      {(status === 'stopped' || status === 'completed') && (
        <Link className="btn btn-ghost btn-block" to="/history" style={{ textAlign: 'center' }}>
          Se historik
        </Link>
      )}
    </main>
  )
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    delay: 'Pause',
    cueing: 'Cue',
    resting: 'Hvile',
    paused: 'Pause (afbrudt)',
    stopped: 'Stoppet',
    completed: 'Færdig',
    idle: 'Klar',
  }
  return map[status] ?? status
}

function idleLabel(status: string): string {
  if (status === 'delay') return 'Venter på næste cue…'
  if (status === 'resting') return 'Hvile mellem runder…'
  if (status === 'paused') return 'Afventer pods'
  if (status === 'completed') return 'Øvelse færdig'
  if (status === 'stopped') return 'Stoppet'
  return 'Ingen aktive lys'
}

function toRecord(exercise: Exercise | null, runner: ExerciseRunner): SessionRecord {
  const events = runner.getEvents()
  const start = events.find((event) => event.type === 'session-start')
  return {
    id: newId(),
    exerciseId: exercise?.id ?? 'ukendt',
    exerciseName: exercise?.name ?? 'Øvelse',
    startedAt: new Date(start?.at ?? Date.now()).toISOString(),
    endedAt: new Date().toISOString(),
    seed: runner.seed,
    podIds: [
      ...new Set(
        events.flatMap((event) => ('podId' in event ? [event.podId] : [])),
      ),
    ],
    events,
    result: runner.getResult(),
    completed: runner.getStatus() === 'completed',
  }
}
