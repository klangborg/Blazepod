/** Mulberry32 — small seeded PRNG, values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomInt(rng: () => number, min: number, max: number): number {
  if (max <= min) return min
  return min + Math.floor(rng() * (max - min + 1))
}

export function pickIndex(rng: () => number, length: number): number {
  if (length <= 0) throw new Error('Kan ikke vælge fra en tom liste')
  return Math.min(length - 1, Math.floor(rng() * length))
}

export function shuffleInPlace<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const current = items[i]
    const swap = items[j]
    if (current === undefined || swap === undefined) continue
    items[i] = swap
    items[j] = current
  }
  return items
}

export function createSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return buf[0] ?? Date.now()
  }
  return (Date.now() ^ (Math.floor(Math.random() * 0xffffffff) >>> 0)) >>> 0
}
