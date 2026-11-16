import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Exercise } from '../domain/exercises'
import type { SessionRecord } from '../domain/results'

export interface PodProfile {
  id: string
  name: string
  updatedAt: string
}

interface BlazepodDB extends DBSchema {
  exercises: {
    key: string
    value: Exercise
    indexes: { 'by-updated': string }
  }
  podProfiles: {
    key: string
    value: PodProfile
  }
  sessions: {
    key: string
    value: SessionRecord
    indexes: { 'by-started': string }
  }
  meta: {
    key: string
    value: { key: string; value: unknown }
  }
}

const DB_NAME = 'blazepod'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<BlazepodDB>> | null = null

export function getDb(): Promise<IDBPDatabase<BlazepodDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BlazepodDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('exercises')) {
          const exercises = db.createObjectStore('exercises', { keyPath: 'id' })
          exercises.createIndex('by-updated', 'updatedAt')
        }
        if (!db.objectStoreNames.contains('podProfiles')) {
          db.createObjectStore('podProfiles', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('sessions')) {
          const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
          sessions.createIndex('by-started', 'startedAt')
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' })
        }
      },
    }).catch((error) => {
      dbPromise = null
      throw error
    })
  }
  return dbPromise
}

export async function resetDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
  indexedDB.deleteDatabase(DB_NAME)
}
