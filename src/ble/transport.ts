import type { TapNotification } from './protocol'

export interface TransportCapabilities {
  bluetooth: boolean
  secureContext: boolean
  requestDevice: boolean
  watchAdvertisements: boolean
  manufacturerDataFilter: boolean
}

export interface ColorWriteOptions {
  autoOffOnTap?: boolean
  dim?: number
}

export interface BleConnection {
  id: string
  name?: string
  manufacturerData: Uint8Array
  advertisedBattery: number | null
  connected: boolean
  writeAuth(token: Uint8Array): Promise<void>
  writeColor(payload: Uint8Array): Promise<void>
  startTapNotifications(onTap: (raw: Uint8Array) => void): Promise<void>
  readBattery(): Promise<number | null>
  startBatteryNotifications(onLevel: (percent: number) => void): Promise<void>
  disconnect(): Promise<void>
  onDisconnected(handler: () => void): () => void
}

export interface BleTransport {
  readonly kind: 'web' | 'mock'
  capabilities(): TransportCapabilities
  requestAndConnect(): Promise<BleConnection>
}

export interface LightsController {
  setColor(
    podId: string,
    rgb: { r: number; g: number; b: number },
    options?: ColorWriteOptions,
  ): Promise<void>
  lightsOff(podId: string): Promise<void>
  lightsOffAll(): Promise<void>
}

export interface TapListener {
  (podId: string, tap: TapNotification): void
}
