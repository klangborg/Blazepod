import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { COLOR_ORDER, PALETTE, type ColorName } from '../domain/colors'
import {
  createExercise,
  newId,
  nowIso,
  validateExercise,
  type CueEnd,
  type DelaySpec,
  type Exercise,
  type OrderMode,
  type StopSpec,
} from '../domain/exercises'
import { getExercise, saveExercise } from '../storage/exercises'

export function ExerciseEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [exercise, setExercise] = useState<Exercise>(() => createExercise({ name: 'Ny øvelse' }))
  const [issues, setIssues] = useState<string[]>([])
  const isNew = !id || id === 'new'

  useEffect(() => {
    if (isNew) return
    void getExercise(id).then((found) => {
      if (found) setExercise(found)
    })
  }, [id, isNew])

  function patch(partial: Partial<Exercise>): void {
    setExercise((current) => ({ ...current, ...partial }))
  }

  async function onSave(): Promise<void> {
    const result = validateExercise(exercise)
    if (result.issues.length > 0) {
      setIssues(result.issues.map((issue) => issue.message))
      return
    }
    const toSave = {
      ...exercise,
      updatedAt: nowIso(),
      createdAt: isNew ? nowIso() : exercise.createdAt,
    }
    await saveExercise(toSave)
    navigate('/exercises')
  }

  const cueMode = exercise.cueEnd.mode
  const timeoutMs = exercise.cueEnd.mode === 'tap' ? 2500 : exercise.cueEnd.timeoutMs

  return (
    <main className="page app-shell">
      <div>
        <h1 className="page-title">{isNew ? 'Ny øvelse' : 'Rediger øvelse'}</h1>
        <p className="lede">Ændringer gemmes kun på denne telefon.</p>
      </div>
      {issues.length > 0 && (
        <div className="banner error">
          {issues.map((issue) => (
            <div key={issue}>{issue}</div>
          ))}
        </div>
      )}

      <section className="card stack">
        <label className="field">
          <span>Navn</span>
          <input value={exercise.name} onChange={(event) => patch({ name: event.target.value })} />
        </label>
        <label className="field">
          <span>Noter</span>
          <textarea
            value={exercise.notes}
            onChange={(event) => patch({ notes: event.target.value })}
          />
        </label>
      </section>

      <section className="card stack">
        <h2>Pods og rækkefølge</h2>
        {exercise.groups.map((group, index) => (
          <div className="row" key={group.id}>
            <label className="field" style={{ flex: 1 }}>
              <span>Gruppe {index + 1}</span>
              <input
                value={group.name}
                onChange={(event) => {
                  const groups = exercise.groups.map((item) =>
                    item.id === group.id ? { ...item, name: event.target.value } : item,
                  )
                  patch({ groups })
                }}
              />
            </label>
            {exercise.groups.length > 1 && (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() =>
                  patch({ groups: exercise.groups.filter((item) => item.id !== group.id) })
                }
              >
                Fjern
              </button>
            )}
          </div>
        ))}
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() =>
            patch({
              groups: [...exercise.groups, { id: newId(), name: `Gruppe ${exercise.groups.length + 1}` }],
            })
          }
        >
          Tilføj gruppe
        </button>
        <OrderField
          label="Gruppe-rækkefølge"
          value={exercise.groupOrder}
          onChange={(groupOrder) => patch({ groupOrder })}
        />
        <OrderField
          label="Pod-rækkefølge"
          value={exercise.podOrder}
          onChange={(podOrder) => patch({ podOrder })}
        />
        <label className="field">
          <span>Samtidige pods</span>
          <input
            type="number"
            min={1}
            max={12}
            inputMode="numeric"
            value={exercise.simultaneousCount}
            onChange={(event) => patch({ simultaneousCount: Number(event.target.value) })}
          />
        </label>
      </section>

      <section className="card stack">
        <h2>Farver</h2>
        <div className="swatches">
          {COLOR_ORDER.map((name) => {
            const on = exercise.colors.includes(name)
            return (
              <button
                key={name}
                type="button"
                className={`swatch ${on ? 'on' : ''}`}
                style={{ background: rgb(name) }}
                aria-pressed={on}
                onClick={() =>
                  patch({
                    colors: on
                      ? exercise.colors.filter((color) => color !== name)
                      : [...exercise.colors, name],
                  })
                }
              >
                {on ? '✓' : ''}
              </button>
            )
          })}
        </div>
        <OrderField
          label="Farverækkefølge"
          value={exercise.colorOrder}
          onChange={(colorOrder) => patch({ colorOrder })}
        />
        <label className="field">
          <span>Lysstyrke {Math.round(exercise.dim * 100)}%</span>
          <input
            type="range"
            min={0.15}
            max={1}
            step={0.05}
            value={exercise.dim}
            onChange={(event) => patch({ dim: Number(event.target.value) })}
          />
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={exercise.autoOffOnTap}
            onChange={(event) => patch({ autoOffOnTap: event.target.checked })}
          />
          Sluk automatisk ved tap
        </label>
      </section>

      <section className="card stack">
        <h2>Cue og pause</h2>
        <div className="segmented">
          {(['tap', 'timeout', 'tap-or-timeout'] as CueEnd['mode'][]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={cueMode === mode ? 'on' : ''}
              onClick={() =>
                patch({
                  cueEnd:
                    mode === 'tap'
                      ? { mode: 'tap' }
                      : { mode, timeoutMs },
                })
              }
            >
              {mode === 'tap' ? 'Tap' : mode === 'timeout' ? 'Timeout' : 'Tap eller timeout'}
            </button>
          ))}
        </div>
        {cueMode !== 'tap' && (
          <label className="field">
            <span>Timeout (ms)</span>
            <input
              type="number"
              inputMode="numeric"
              value={timeoutMs}
              onChange={(event) =>
                patch({ cueEnd: { mode: cueMode, timeoutMs: Number(event.target.value) } })
              }
            />
          </label>
        )}
        <div className="segmented">
          <button
            type="button"
            className={exercise.delay.mode === 'fixed' ? 'on' : ''}
            onClick={() => patch({ delay: { mode: 'fixed', ms: delayMs(exercise.delay) } })}
          >
            Fast pause
          </button>
          <button
            type="button"
            className={exercise.delay.mode === 'random' ? 'on' : ''}
            onClick={() =>
              patch({
                delay: {
                  mode: 'random',
                  minMs: Math.max(0, delayMs(exercise.delay) - 200),
                  maxMs: delayMs(exercise.delay) + 400,
                },
              })
            }
          >
            Tilfældig pause
          </button>
        </div>
        {exercise.delay.mode === 'fixed' ? (
          <label className="field">
            <span>Pause (ms)</span>
            <input
              type="number"
              inputMode="numeric"
              value={exercise.delay.ms}
              onChange={(event) => patch({ delay: { mode: 'fixed', ms: Number(event.target.value) } })}
            />
          </label>
        ) : (
          <div className="row">
            <label className="field">
              <span>Min (ms)</span>
              <input
                type="number"
                inputMode="numeric"
                value={exercise.delay.minMs}
                onChange={(event) => {
                  const delay = exercise.delay
                  if (delay.mode !== 'random') return
                  patch({ delay: { ...delay, minMs: Number(event.target.value) } })
                }}
              />
            </label>
            <label className="field">
              <span>Max (ms)</span>
              <input
                type="number"
                inputMode="numeric"
                value={exercise.delay.maxMs}
                onChange={(event) => {
                  const delay = exercise.delay
                  if (delay.mode !== 'random') return
                  patch({ delay: { ...delay, maxMs: Number(event.target.value) } })
                }}
              />
            </label>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>Stop og runder</h2>
        <div className="segmented">
          <button
            type="button"
            className={exercise.stop.mode === 'hits' ? 'on' : ''}
            onClick={() => patch({ stop: { mode: 'hits', count: stopCount(exercise.stop) } })}
          >
            Antal hits
          </button>
          <button
            type="button"
            className={exercise.stop.mode === 'time' ? 'on' : ''}
            onClick={() =>
              patch({ stop: { mode: 'time', durationMs: stopMs(exercise.stop) } })
            }
          >
            Tid
          </button>
        </div>
        {exercise.stop.mode === 'hits' ? (
          <label className="field">
            <span>Hits pr. runde</span>
            <input
              type="number"
              inputMode="numeric"
              value={exercise.stop.count}
              onChange={(event) => patch({ stop: { mode: 'hits', count: Number(event.target.value) } })}
            />
          </label>
        ) : (
          <label className="field">
            <span>Varighed (sekunder)</span>
            <input
              type="number"
              inputMode="numeric"
              value={Math.round(exercise.stop.durationMs / 1000)}
              onChange={(event) =>
                patch({ stop: { mode: 'time', durationMs: Number(event.target.value) * 1000 } })
              }
            />
          </label>
        )}
        <label className="field">
          <span>Runder</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={exercise.rounds}
            onChange={(event) => patch({ rounds: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          <span>Hvile mellem runder (ms)</span>
          <input
            type="number"
            inputMode="numeric"
            value={exercise.restMs}
            onChange={(event) => patch({ restMs: Number(event.target.value) })}
          />
        </label>
      </section>

      <button className="btn btn-primary btn-block" type="button" onClick={() => void onSave()}>
        Gem øvelse
      </button>
      <Link className="btn btn-ghost btn-block" to="/exercises" style={{ textAlign: 'center' }}>
        Annuller
      </Link>
    </main>
  )
}

function OrderField({
  label,
  value,
  onChange,
}: {
  label: string
  value: OrderMode
  onChange: (value: OrderMode) => void
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="segmented">
        <button type="button" className={value === 'random' ? 'on' : ''} onClick={() => onChange('random')}>
          Tilfældig
        </button>
        <button
          type="button"
          className={value === 'sequence' ? 'on' : ''}
          onClick={() => onChange('sequence')}
        >
          Fast rækkefølge
        </button>
      </div>
    </div>
  )
}

function rgb(name: ColorName): string {
  const color = PALETTE[name]
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}

function delayMs(delay: DelaySpec): number {
  return delay.mode === 'fixed' ? delay.ms : Math.round((delay.minMs + delay.maxMs) / 2)
}

function stopCount(stop: StopSpec): number {
  return stop.mode === 'hits' ? stop.count : 20
}

function stopMs(stop: StopSpec): number {
  return stop.mode === 'time' ? stop.durationMs : 45_000
}
