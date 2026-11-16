import type { SessionRecord } from '../domain/results'
import { getDb } from './db'

export async function saveSession(record: SessionRecord): Promise<void> {
  try {
    const db = await getDb()
    await db.put('sessions', record)
  } catch {
    /* historik er bedst-effort */
  }
}

export async function listSessions(): Promise<SessionRecord[]> {
  try {
    const db = await getDb()
    const items = await db.getAllFromIndex('sessions', 'by-started')
    return items.reverse()
  } catch {
    return []
  }
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  try {
    const db = await getDb()
    return db.get('sessions', id)
  } catch {
    return undefined
  }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    const db = await getDb()
    await db.delete('sessions', id)
  } catch {
    /* ignore */
  }
}
