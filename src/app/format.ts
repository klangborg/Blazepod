const da = new Intl.DateTimeFormat('da-DK', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatDate(iso: string): string {
  return da.format(new Date(iso))
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2).replace('.', ',')} s`
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatHex(bytes: Uint8Array | null | undefined): string {
  if (!bytes || bytes.byteLength === 0) return '—'
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}
