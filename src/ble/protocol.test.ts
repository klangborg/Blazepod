import { describe, expect, it } from 'vitest'
import {
  AUTH_PREFIX,
  buildAuthToken,
  crc32LsbFirst,
  decodeTap,
  encodeColor,
  encodeOff,
  extractAuthInput,
  fromHex,
  isDfuUuid,
  KNOWN_EXAMPLE,
  NORDIC_DFU_SERVICE_UUID,
  TapState,
  toHex,
  wrap32,
} from './protocol'

describe('auth protocol', () => {
  it('matches the public vector 01 DE AD BE EF → 73 65 61 03 48 60 B6', () => {
    const token = buildAuthToken(KNOWN_EXAMPLE.manufacturerData)
    expect(toHex(token)).toBe('73 65 61 03 48 60 B6')
    expect(toHex(token)).toBe(toHex(KNOWN_EXAMPLE.token))
    expect(token.slice(0, 3)).toEqual(AUTH_PREFIX)
  })

  it('uses last 5 manufacturer bytes as offset + CRC input', () => {
    const padded = fromHex('AA BB 01 DE AD BE EF')
    expect(toHex(buildAuthToken(padded))).toBe('73 65 61 03 48 60 B6')
    const input = extractAuthInput(padded)
    expect(input.offset).toBe(0x01)
    expect(toHex(input.crcInput)).toBe('DE AD BE EF')
  })

  it('wraps CRC as unsigned 32-bit', () => {
    const crc = crc32LsbFirst(fromHex('DE AD BE EF'), (0xedb88321 + 1) >>> 0)
    expect(toHex(fromLe32(wrap32(crc)))).toBe('03 48 60 B6')
  })
})

describe('GBR color encoding', () => {
  it('encodes RGB as G, B, R', () => {
    expect(toHex(encodeColor({ r: 1, g: 2, b: 3 }))).toBe('02 03 01')
  })

  it('adds 0x01 as fourth byte for auto-off on tap', () => {
    expect(toHex(encodeColor({ r: 255, g: 0, b: 0 }, { autoOffOnTap: true }))).toBe(
      '00 00 FF 01',
    )
  })

  it('applies dim before encoding', () => {
    expect(toHex(encodeColor({ r: 200, g: 100, b: 0 }, { dim: 0.5 }))).toBe('32 00 64')
  })

  it('encodes off as 00 00 00', () => {
    expect(toHex(encodeOff())).toBe('00 00 00')
  })
})

describe('tap decode', () => {
  it('reads state and little-endian reaction ms', () => {
    const raw = new Uint8Array([TapState.LitStayOn, 0xb4, 0x00, 0x00, 0x00, 1, 2, 3])
    const tap = decodeTap(raw)
    expect(tap.stateName).toBe('lit-stay-on')
    expect(tap.lit).toBe(true)
    expect(tap.reactionMs).toBe(180)
    expect(toHex(tap.unknown)).toBe('01 02 03')
  })

  it('maps 00 / 21 / 25 states', () => {
    expect(decodeTap(new Uint8Array([0x00, 0, 0, 0, 0, 0, 0, 0])).stateName).toBe('unlit')
    expect(decodeTap(new Uint8Array([0x21, 0, 0, 0, 0, 0, 0, 0])).stateName).toBe('lit-stay-on')
    expect(decodeTap(new Uint8Array([0x25, 0, 0, 0, 0, 0, 0, 0])).autoOff).toBe(true)
  })
})

describe('DFU guard', () => {
  it('recognises the Nordic DFU UUID', () => {
    expect(isDfuUuid(NORDIC_DFU_SERVICE_UUID)).toBe(true)
    expect(isDfuUuid('6e400001-b5a3-f393-e0a9-e50e24dcca9e')).toBe(false)
  })
})

function fromLe32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  out[0] = value & 0xff
  out[1] = (value >>> 8) & 0xff
  out[2] = (value >>> 16) & 0xff
  out[3] = (value >>> 24) & 0xff
  return out
}
