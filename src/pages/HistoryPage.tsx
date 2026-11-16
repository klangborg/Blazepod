import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, formatMs } from '../app/format'
import type { SessionRecord } from '../domain/results'
import { deleteSession, listSessions } from '../storage/history'

export function HistoryPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])

  async function reload(): Promise<void> {
    setSessions(await listSessions())
  }

  useEffect(() => {
    void reload()
  }, [])

  return (
    <main className="page app-shell">
      <div>
        <h1 className="page-title">Historik</h1>
        <p className="lede">Resultater gemmes lokalt. Reaktionstider bruger poddens egne ms, når de findes.</p>
      </div>
      <div className="list">
        {sessions.length === 0 ? (
          <div className="card empty">Ingen sessioner endnu.</div>
        ) : (
          sessions.map((session) => (
            <article className="list-item" key={session.id}>
              <Link to={`/history/${session.id}`}>
                <strong>{session.exerciseName}</strong>
                <div className="muted">{formatDate(session.startedAt)}</div>
                <div className="muted">
                  {session.result.hits} hits · {session.result.misses} miss · bedst{' '}
                  {formatMs(session.result.bestReactionMs)}
                </div>
              </Link>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={async () => {
                  await deleteSession(session.id)
                  await reload()
                }}
              >
                Slet
              </button>
            </article>
          ))
        )}
      </div>
    </main>
  )
}
