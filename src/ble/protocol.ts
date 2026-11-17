/**
 * Blazepod BLE application protocol.
 * Implemented from public reverse-engineering notes (company ID 0x09D7 / Coyotta).
 * Auth is application-level, not BLE pairing. Never write Nordic DFU.
 * Advertisement payload after company ID: optional battery byte (0–100), then 5 auth bytes.
 */

export const COMPANY_ID = 0x09d7

export const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
export const UART_RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'

export const COLOR_SERVICE_UUID = '50c97bfa-4cb8-4c84-b745-0e58a0280cd6'
export const COLOR_CHAR_UUID = '50c912a2-4cb8-4c84-b745-0e58a0280cd6'

export const TAP_SERVICE_UUID = '50c928bd-4cb8-4c84-b745-0e58a0280cd6'
export const TAP_CHAR_UUID = '50c9727e-4cb8-4c84-b745-0e58a0280cd6'

/** Nordic DFU — must never be written. */
export const NORDIC_DFU_SERVICE_UUID = '8e400001-f315-4f60-9fb8-838830daea50'

export const OPTIONAL_SERVICES = [
  UART_SERVICE_UUID,
  COLOR_SERVICE_UUID,
  TAP_SERVICE_UUID,
] as const

export const AUTH_HOLD_MS = 12_000
export const GATT_SERIAL_GAP_MS = 125
export const NAME_PREFIX = 'BlazePod'

export const AUTH_PREFIX = new Uint8Array([0x73, 0x65, 0x61]) // "sea"
export const CRC32_BASE_POLY = 0xedb88321

export const TapState = {
  Unlit: 0x00,
  LitStayOn: 0x21,
  LitAutoOff: 0x25,
} as const

export type TapStateCode = (typeof TapState)[keyof typeof TapState]

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface AuthInput {
  offset: number
  crcInput: Uint8Array
  manufacturerData: Uint8Array
}

export interface TapNotification {
  state: number
  stateName: 'unlit' | 'lit-stay-on' | 'lit-auto-off' | 'unknown'
  reactionMs: number
  unknown: Uint8Array
  lit: boolean
  autoOff: boolean
  raw: Uint8Array
}

export function toHex(bytes: Uint8Array, separator = ' '): string {
  return [...bytes]
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(separator)
}

export function fromHex(hex: string): Uint8Array {
  const cleaned = hex.replace(/[^0-9a-fA-F]/g, '')
  if (cleaned.length % 2 !== 0) {
    throw new Error('Ugyldig hex-streng')
  }
  const out = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function copyBytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice()
}

export function crc32LsbFirst(data: Uint8Array, poly: number): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ poly : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function wrap32(crc: number): number {
  let value = crc >>> 0
  value = (value + ((value << 3) >>> 0)) >>> 0
  value = (value ^ (value >>> 11)) >>> 0
  value = (value + ((value << 15) >>> 0)) >>> 0
  return value
}

export function extractAuthInput(manufacturerData: Uint8Array): AuthInput {
  if (manufacturerData.byteLength < 5) {
    throw new Error(
      'Manufacturer data er for kort. Der skal være mindst 5 bytes (offset + 4 CRC-bytes).',
    )
  }
  const slice = manufacturerData.slice(-5)
  const offset = slice[0] ?? 0
  return {
    offset,
    crcInput: slice.slice(1),
    manufacturerData: manufacturerData.slice(),
  }
}

/**
 * Battery percent inferred from advertisement manufacturer payload.
 * Public packets look like `[battery, offset, crc0, crc1, crc2, crc3]` after the
 * company ID is stripped (e.g. `5A 01 DE AD BE EF` → 90 %). Auth still uses the
 * last 5 bytes. Values outside 0–100 are ignored.
 */
export function decodeAdvertisedBattery(manufacturerData: Uint8Array): number | null {
  if (manufacturerData.byteLength < 6) return null
  const extra = manufacturerData.subarray(0, manufacturerData.byteLength - 5)
  const candidate = extra[0]
  if (candidate === undefined || candidate > 100) return null
  return candidate
}

export function authPoly(offset: number): number {
  return (CRC32_BASE_POLY + (offset % 50)) >>> 0
}

export function buildAuthToken(manufacturerData: Uint8Array): Uint8Array {
  const { offset, crcInput } = extractAuthInput(manufacturerData)
  const crc = wrap32(crc32LsbFirst(crcInput, authPoly(offset)))
  const token = new Uint8Array(7)
  token.set(AUTH_PREFIX, 0)
  token[3] = crc & 0xff
  token[4] = (crc >>> 8) & 0xff
  token[5] = (crc >>> 16) & 0xff
  token[6] = (crc >>> 24) & 0xff
  return token
}

export function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(255, Math.round(value)))
}

export function encodeColor(
  rgb: Rgb,
  options?: { autoOffOnTap?: boolean; dim?: number },
): Uint8Array {
  const dim = options?.dim ?? 1
  const g = clampByte(rgb.g * dim)
  const b = clampByte(rgb.b * dim)
  const r = clampByte(rgb.r * dim)
  if (options?.autoOffOnTap) {
    return Uint8Array.from([g, b, r, 0x01])
  }
  return Uint8Array.from([g, b, r])
}

export const COLOR_OFF = new Uint8Array([0x00, 0x00, 0x00])

export function encodeOff(): Uint8Array {
  return COLOR_OFF.slice()
}

export function decodeTap(bytes: Uint8Array): TapNotification {
  if (bytes.byteLength < 8) {
    throw new Error('Tap-notifikation skal være 8 bytes')
  }
  const raw = bytes.slice(0, 8)
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const state = view.getUint8(0)
  const reactionMs = view.getUint32(1, true)
  const unknown = raw.slice(5, 8)
  const lit = state === TapState.LitStayOn || state === TapState.LitAutoOff
  const autoOff = state === TapState.LitAutoOff
  const stateName =
    state === TapState.Unlit
      ? 'unlit'
      : state === TapState.LitStayOn
        ? 'lit-stay-on'
        : state === TapState.LitAutoOff
          ? 'lit-auto-off'
          : 'unknown'
  return { state, stateName, reactionMs, unknown, lit, autoOff, raw }
}

export function isDfuUuid(uuid: string): boolean {
  return uuid.toLowerCase() === NORDIC_DFU_SERVICE_UUID
}

export function assertWritableUuid(uuid: string): void {
  if (isDfuUuid(uuid)) {
    throw new Error('Skrivning til Nordic DFU er blokeret.')
  }
}

export const KNOWN_EXAMPLE = {
  manufacturerData: fromHex('01 DE AD BE EF'),
  token: fromHex('73 65 61 03 48 60 B6'),
} as const
