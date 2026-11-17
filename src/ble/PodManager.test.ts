import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BleError, BleErrorCode } from './errors'
import { encodeMockTap, MockBluetoothTransport } from './MockBluetoothTransport'
import { PodManager } from './PodManager'
import { fromHex, TapState, toHex } from './protocol'

describe('PodManager with mock BLE', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('authenticates with the known manufacturer-data vector', async () => {
    const transport = new MockBluetoothTransport()
    const manager = new PodManager(transport, { authHoldMs: 20 })
    const pending = manager.connect()
    await vi.advanceTimersByTimeAsync(20)
    const pod = await pending
    expect(pod.status).toBe('connected')
    expect(toHex(pod.authToken ?? new Uint8Array())).toBe('73 65 61 03 48 60 B6')
    expect(pod.batteryPercent).toBe(90)
  })

  it('reads battery from GATT when advertisements only have auth bytes', async () => {
    const transport = new MockBluetoothTransport({}, [
      {
        id: 'mock-auth-only',
        name: 'BlazePod Mock',
        manufacturerData: fromHex('01 DE AD BE EF'),
        batteryPercent: 73,
      },
    ])
    const manager = new PodManager(transport, { authHoldMs: 20 })
    const pending = manager.connect()
    await vi.advanceTimersByTimeAsync(20)
    const pod = await pending
    expect(pod.batteryPercent).toBe(73)
  })

  it('surfaces a Danish diagnostic when watchAdvertisements is missing', async () => {
    const transport = new MockBluetoothTransport({
      capabilities: { watchAdvertisements: false },
    })
    const manager = new PodManager(transport, { authHoldMs: 0 })
    await expect(manager.connect()).rejects.toMatchObject({
      code: BleErrorCode.NoWatchAdvertisements,
    })
    await expect(manager.connect()).rejects.toThrow(/Bluefy|Beacio|manufacturer data/i)
  })

  it('does not skip auth when manufacturer data is missing', async () => {
    const transport = new MockBluetoothTransport({ missingManufacturerData: true })
    const manager = new PodManager(transport, { authHoldMs: 0 })
    await expect(manager.connect()).rejects.toBeInstanceOf(BleError)
    await expect(manager.connect()).rejects.toThrow(/Auth må ikke springes over|Bluefy/i)
  })

  it('fails auth if the pod disconnects during the hold', async () => {
    const transport = new MockBluetoothTransport({ disconnectAfterAuthWrite: true })
    const manager = new PodManager(transport, { authHoldMs: 40 })
    const pending = manager.connect()
    pending.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(40)
    await expect(pending).rejects.toMatchObject({ code: BleErrorCode.AuthFailed })
  })

  it('forwards tap notifications and can kill all lights', async () => {
    const transport = new MockBluetoothTransport()
    const manager = new PodManager(transport, { authHoldMs: 10 })
    const pending = manager.connect()
    await vi.advanceTimersByTimeAsync(10)
    const pod = await pending
    const taps: number[] = []
    manager.onTap((_id, tap) => taps.push(tap.reactionMs))
    transport.get(pod.id)?.emitTap(encodeMockTap(TapState.LitAutoOff, 211))
    expect(taps).toEqual([211])
    await manager.setColor(pod.id, { r: 10, g: 20, b: 30 })
    expect(toHex(transport.get(pod.id)?.lastColor ?? new Uint8Array())).toBe('14 1E 0A')
    await manager.lightsOffAll()
    expect(toHex(transport.get(pod.id)?.lastColor ?? new Uint8Array())).toBe('00 00 00')
  })
})
