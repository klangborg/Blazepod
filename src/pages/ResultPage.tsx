import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDate, formatDuration, formatMs } from '../app/format'
import { PlayerScores } from '../components/PlayerScores'
import { scoresByColor, type SessionRecord } from '../domain/results'
import { getSession } from '../storage/history'

export function ResultPage() {
  const { id } = useParams()
  const [session, setSession] = useState<SessionRecord | null>(null)

  useEffect(() => {
    if (!id) return
    void getSession(id).then((found) => setSession(found ?? null))
  }, [id])

  if (!session) {
    return (
      <main className="page app-shell">
        <p>Indlæser resultat…</p>
      </main>
    )
  }

  const { result } = session
  const colorScores = scoresByColor(session.events)

  return (
    <main className="page app-shell">
      <div>
        <h1 className="page-title">{session.exerciseName}</h1>
        <p className="lede">
          {formatDate(session.startedAt)} · {session.completed ? 'Gennemført' : 'Stoppet'} · seed{' '}
          {session.seed}
        </p>
      </div>
      <div className="stats">
        <div className="stat">
          <span className="muted">Hits</span>
          <b>{result.hits}</b>
        </div>
        <div className="stat">
          <span className="muted">Miss</span>
          <b>{result.misses}</b>
        </div>
        <div className="stat">
          <span className="muted">Bedst</span>
          <b>{formatMs(result.bestReactionMs)}</b>
        </div>
        <div className="stat">
          <span className="muted">Gns.</span>
          <b>{formatMs(result.avgReactionMs)}</b>
        </div>
      </div>
      <p className="muted">Varighed {formatDuration(result.durationMs)}. Afbrudte cues: {result.abortedCues}.</p>
      {colorScores.length === 2 && (
        <section className="card stack">
          <h2>Spillere</h2>
          <PlayerScores scores={colorScores} />
        </section>
      )}
      <section className="card">
        <h2>Runder</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Runde</th>
              <th>Hits</th>
              <th>Miss</th>
              <th>Bedst</th>
              <th>Gns.</th>
            </tr>
          </thead>
          <tbody>
            {result.rounds.map((round) => (
              <tr key={round.round}>
                <td>{round.round}</td>
                <td>{round.hits}</td>
                <td>{round.misses}</td>
                <td>{formatMs(round.bestReactionMs)}</td>
                <td>{formatMs(round.avgReactionMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>Hændelser</h2>
        <div className="stack">
          {session.events.map((event, index) => (
            <div className="mono muted" key={`${event.type}-${event.at}-${index}`}>
              {event.type} @ {event.at}
              {'podId' in event ? ` · ${event.podId}` : ''}
              {'reactionMs' in event ? ` · ${event.reactionMs} ms` : ''}
            </div>
          ))}
        </div>
      </section>
      <Link className="btn btn-ghost btn-block" to="/history" style={{ textAlign: 'center' }}>
        Tilbage til historik
      </Link>
    </main>
  )
}
