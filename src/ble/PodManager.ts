import { colorRgb } from '../domain/colors'
import {
  AUTH_HOLD_MS,
  buildAuthToken,
  decodeTap,
  encodeColor,
  encodeOff,
  type Rgb,
  type TapNotification,
} from './protocol'
import { BleError, BleErrorCode } from './errors'
import { sleep } from './gattQueue'
import type { BleConnection, BleTransport, LightsController, ColorWriteOptions } from './transport'

export type PodStatus = 'connecting' | 'authenticating' | 'connected' | 'disconnected'

export interface ManagedPod {
  id: string
  bleName?: string
  givenName: string
  manufacturerData: Uint8Array
  authToken: Uint8Array | null
  status: PodStatus
  lastTap: TapNotification | null
  lastError: string | null
  connectedAt: number | null
}

export interface PodManagerOptions {
  authHoldMs?: number
  names?: Record<string, string>
}

type Listener = () => void
type TapListener = (podId: string, tap: TapNotification) => void
type DisconnectListener = (podId: string) => void

export class PodManager implements LightsController {
  private transport: BleTransport
  private readonly pods = new Map<string, ManagedPod>()
  private readonly connections = new Map<string, BleConnection>()
  private readonly unsubscribers = new Map<string, () => void>()
  private readonly listeners = new Set<Listener>()
  private readonly tapListeners = new Set<TapListener>()
  private readonly disconnectListeners = new Set<DisconnectListener>()
  private readonly names: Record<string, string>
  private readonly authHoldMs: number

  constructor(transport: BleTransport, options: PodManagerOptions = {}) {
    this.transport = transport
    this.names = { ...options.names }
    this.authHoldMs = options.authHoldMs ?? AUTH_HOLD_MS
  }

  setTransport(transport: BleTransport): void {
    this.transport = transport
  }

  getTransport(): BleTransport {
    return this.transport
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  onTap(listener: TapListener): () => void {
    this.tapListeners.add(listener)
    return () => {
      this.tapListeners.delete(listener)
    }
  }

  onDisconnect(listener: DisconnectListener): () => void {
    this.disconnectListeners.add(listener)
    return () => {
      this.disconnectListeners.delete(listener)
    }
  }

  list(): ManagedPod[] {
    return [...this.pods.values()]
  }

  get(id: string): ManagedPod | undefined {
    return this.pods.get(id)
  }

  connected(): ManagedPod[] {
    return this.list().filter((pod) => pod.status === 'connected')
  }

  async connect(): Promise<ManagedPod> {
    const connection = await this.transport.requestAndConnect()
    const givenName =
      this.names[connection.id] ??
      connection.name ??
      `Pod ${connection.id.slice(0, 6)}`

    const pod: ManagedPod = {
      id: connection.id,
      bleName: connection.name,
      givenName,
      manufacturerData: connection.manufacturerData,
      authToken: null,
      status: 'authenticating',
      lastTap: null,
      lastError: null,
      connectedAt: null,
    }
    this.pods.set(pod.id, pod)
    this.connections.set(pod.id, connection)
    this.emit()

    const unsub = connection.onDisconnected(() => {
      this.markDisconnected(pod.id)
    })
    this.unsubscribers.set(pod.id, unsub)

    try {
      const token = buildAuthToken(connection.manufacturerData)
      pod.authToken = token
      this.emit()
      await connection.writeAuth(token)
      const holdMs = this.transport.kind === 'mock' ? Math.min(this.authHoldMs, 300) : this.authHoldMs
      await waitForAuthHold(connection, holdMs)
      await connection.startTapNotifications((raw) => {
        try {
          const tap = decodeTap(raw)
          pod.lastTap = tap
          this.emit()
          for (const listener of this.tapListeners) listener(pod.id, tap)
        } catch {
          /* ignore malformed packets */
        }
      })
      pod.status = 'connected'
      pod.connectedAt = Date.now()
      pod.lastError = null
      this.emit()
      return pod
    } catch (error) {
      pod.status = 'disconnected'
      pod.lastError = error instanceof Error ? error.message : 'Tilslutning fejlede'
      this.emit()
      await this.disconnect(pod.id)
      if (error instanceof BleError) throw error
      throw new BleError(
        BleErrorCode.AuthFailed,
        'Autentificering fejlede. Podden afviste token eller afbrød under 12 s hold.',
        { cause: error },
      )
    }
  }

  async disconnect(id: string): Promise<void> {
    const connection = this.connections.get(id)
    this.unsubscribers.get(id)?.()
    this.unsubscribers.delete(id)
    this.connections.delete(id)
    if (connection?.connected) {
      try {
        await connection.writeColor(encodeOff())
      } catch {
        /* best effort */
      }
      try {
        await connection.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.markDisconnected(id)
  }

  async disconnectAll(): Promise<void> {
    await Promise.all(this.list().map((pod) => this.disconnect(pod.id)))
  }

  rename(id: string, name: string): void {
    const pod = this.pods.get(id)
    const trimmed = name.trim()
    if (!trimmed) return
    this.names[id] = trimmed
    if (pod) {
      pod.givenName = trimmed
      this.emit()
    }
  }

  async setColor(podId: string, rgb: Rgb, options?: ColorWriteOptions): Promise<void> {
    const connection = this.requireConnection(podId)
    await connection.writeColor(encodeColor(rgb, options))
  }

  async lightsOff(podId: string): Promise<void> {
    const connection = this.connections.get(podId)
    if (!connection?.connected) return
    await connection.writeColor(encodeOff())
  }

  async lightsOffAll(): Promise<void> {
    await Promise.all(
      [...this.connections.values()]
        .filter((connection) => connection.connected)
        .map((connection) => connection.writeColor(encodeOff())),
    )
  }

  async identify(id: string): Promise<void> {
    const orange = colorRgb('orange')
    for (let i = 0; i < 3; i++) {
      await this.setColor(id, orange, { dim: 0.45 })
      await sleep(220)
      await this.lightsOff(id)
      await sleep(160)
    }
  }

  private requireConnection(id: string): BleConnection {
    const connection = this.connections.get(id)
    if (!connection?.connected) {
      throw new BleError(BleErrorCode.NotConnected, 'Podden er ikke forbundet.')
    }
    return connection
  }

  private markDisconnected(id: string): void {
    const pod = this.pods.get(id)
    const wasConnected = pod?.status === 'connected' || pod?.status === 'authenticating'
    if (pod) {
      pod.status = 'disconnected'
      pod.connectedAt = null
      this.emit()
    }
    this.connections.delete(id)
    if (wasConnected) {
      for (const listener of this.disconnectListeners) listener(id)
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

async function waitForAuthHold(connection: BleConnection, holdMs: number): Promise<void> {
  if (holdMs <= 0) {
    if (!connection.connected) {
      throw new BleError(
        BleErrorCode.AuthFailed,
        'Podden afbrød med det samme. Auth-token blev sandsynligvis afvist.',
      )
    }
    return
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const unsub = connection.onDisconnected(() => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      unsub()
      reject(
        new BleError(
          BleErrorCode.AuthFailed,
          'Podden afbrød under auth-hold (ca. 12 s). Token blev sandsynligvis afvist, selv om ATT-write lykkedes.',
        ),
      )
    })
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      unsub()
      if (!connection.connected) {
        reject(
          new BleError(
            BleErrorCode.AuthFailed,
            'Podden var væk efter auth-hold. Token blev sandsynligvis afvist.',
          ),
        )
        return
      }
      resolve()
    }, holdMs)
  })
}
