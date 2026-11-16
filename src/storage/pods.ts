import { getDb, type PodProfile } from './db'

export async function listPodNames(): Promise<Record<string, string>> {
  try {
    const db = await getDb()
    const profiles = await db.getAll('podProfiles')
    return Object.fromEntries(profiles.map((profile) => [profile.id, profile.name]))
  } catch {
    return {}
  }
}

export async function savePodName(id: string, name: string): Promise<void> {
  try {
    const db = await getDb()
    const profile: PodProfile = {
      id,
      name: name.trim(),
      updatedAt: new Date().toISOString(),
    }
    await db.put('podProfiles', profile)
  } catch {
    /* persistens er bedst-effort */
  }
}
