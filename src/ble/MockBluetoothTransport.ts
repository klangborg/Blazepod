import {
  buildAuthToken,
  copyBytes,
  KNOWN_EXAMPLE,
  toHex,
} from './protocol'
import { BleError, BleErrorCode, missingAdvertisementHelp } from './errors'
import type { BleConnection, BleTransport, TransportCapabilities } from './transport'

export interface MockPodSpec {
  id: string
  name: string
  manufacturerData: Uint8Array
}

export interface MockTransportOptions {
  capabilities?: Partial<TransportCapabilities>
  authHoldMs?: number
  failAuth?: boolean
  missingManufacturerData?: boolean
  disconnectAfterAuthWrite?: boolean
}

class MockConnection implements BleConnection {
  id: string
  name: string
  manufacturerData: Uint8Array
  connected = true
  lastColor: Uint8Array | null = null
  lastAuth: Uint8Array | null = null
  private tapHandler: ((raw: Uint8Array) => void) | null = null
  private disconnectHandlers = new Set<() => void>()
  private readonly options: MockTransportOptions
  private readonly expectedToken: Uint8Array

  constructor(spec: MockPodSpec, options: MockTransportOptions) {
    this.id = spec.id
    this.name = spec.name
    this.manufacturerData = spec.manufacturerData
    this.options = options
    this.expectedToken = buildAuthToken(spec.manufacturerData)
  }

  async writeAuth(token: Uint8Array): Promise<void> {
    this.assertConnected()
    this.lastAuth = copyBytes(token)
    const ok =
      !this.options.failAuth &&
      !this.options.disconnectAfterAuthWrite &&
      tokensEqual(token, this.expectedToken)
    if (!ok) {
      queueMicrotask(() => this.forceDisconnect())
    }
  }

  async writeColor(payload: Uint8Array): Promise<void> {
    this.assertConnected()
    this.lastColor = copyBytes(payload)
  }

  async startTapNotifications(onTap: (raw: Uint8Array) => void): Promise<void> {
    this.assertConnected()
    this.tapHandler = onTap
  }

  emitTap(raw: Uint8Array): void {
    this.tapHandler?.(copyBytes(raw))
  }

  async disconnect(): Promise<void> {
    this.forceDisconnect()
  }

  onDisconnected(handler: () => void): () => void {
    this.disconnectHandlers.add(handler)
    return () => {
      this.disconnectHandlers.delete(handler)
    }
  }

  forceDisconnect(): void {
    if (!this.connected) return
    this.connected = false
    for (const handler of this.disconnectHandlers) handler()
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new BleError(BleErrorCode.NotConnected, 'Simuleret pod er ikke forbundet.')
    }
  }
}

let mockSeq = 0

export class MockBluetoothTransport implements BleTransport {
  readonly kind = 'mock' as const
  readonly connections = new Map<string, MockConnection>()
  private readonly options: MockTransportOptions
  private readonly queued: MockPodSpec[]

  constructor(options: MockTransportOptions = {}, queued: MockPodSpec[] = []) {
    this.options = options
    this.queued = [...queued]
  }

  capabilities(): TransportCapabilities {
    return {
      bluetooth: true,
      secureContext: true,
      requestDevice: true,
      watchAdvertisements: true,
      manufacturerDataFilter: true,
      ...this.options.capabilities,
    }
  }

  async requestAndConnect(): Promise<BleConnection> {
    const caps = this.capabilities()
    if (!caps.watchAdvertisements) {
      throw new BleError(BleErrorCode.NoWatchAdvertisements, missingAdvertisementHelp())
    }
    const spec = this.queued.shift() ?? nextMockSpec()
    if (this.options.missingManufacturerData || !caps.manufacturerDataFilter) {
      throw new BleError(BleErrorCode.NoManufacturerData, missingAdvertisementHelp())
    }
    const connection = new MockConnection(spec, this.options)
    this.connections.set(connection.id, connection)
    connection.onDisconnected(() => {
      this.connections.delete(connection.id)
    })
    return connection
  }

  get(id: string): MockConnection | undefined {
    return this.connections.get(id)
  }
}

export function encodeMockTap(state: number, reactionMs: number, extra = [0, 0, 0]): Uint8Array {
  const raw = new Uint8Array(8)
  raw[0] = state
  raw[1] = reactionMs & 0xff
  raw[2] = (reactionMs >>> 8) & 0xff
  raw[3] = (reactionMs >>> 16) & 0xff
  raw[4] = (reactionMs >>> 24) & 0xff
  raw[5] = extra[0] ?? 0
  raw[6] = extra[1] ?? 0
  raw[7] = extra[2] ?? 0
  return raw
}

function nextMockSpec(): MockPodSpec {
  mockSeq += 1
  return {
    id: `mock-${mockSeq}`,
    name: `BlazePod Mock ${mockSeq}`,
    manufacturerData: KNOWN_EXAMPLE.manufacturerData.slice(),
  }
}

function tokensEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  return toHex(a) === toHex(b)
}
