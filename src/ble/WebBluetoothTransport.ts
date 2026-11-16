import {
  assertWritableUuid,
  COMPANY_ID,
  COLOR_CHAR_UUID,
  COLOR_SERVICE_UUID,
  copyBytes,
  NAME_PREFIX,
  OPTIONAL_SERVICES,
  TAP_CHAR_UUID,
  TAP_SERVICE_UUID,
  UART_RX_CHAR_UUID,
  UART_SERVICE_UUID,
} from './protocol'
import { BleError, BleErrorCode, missingAdvertisementHelp } from './errors'
import { inspectWebBluetoothCapabilities } from './capabilities'
import { SerialQueue } from './gattQueue'
import type { BleConnection, BleTransport, TransportCapabilities } from './transport'

const ADVERTISEMENT_WAIT_MS = 10_000

export class WebBluetoothTransport implements BleTransport {
  readonly kind = 'web' as const

  capabilities(): TransportCapabilities {
    return inspectWebBluetoothCapabilities()
  }

  async requestAndConnect(): Promise<BleConnection> {
    const caps = this.capabilities()
    if (!caps.secureContext) {
      throw new BleError(
        BleErrorCode.InsecureContext,
        'Web Bluetooth kræver HTTPS (eller localhost). Åbn appen via en HTTPS-adresse.',
      )
    }
    if (!caps.bluetooth || !caps.requestDevice) {
      throw new BleError(
        BleErrorCode.NoBluetooth,
        'Web Bluetooth findes ikke i denne browser. Safari kan ikke bruges. ' +
          'På iPhone: Bluefy, Beacio eller C. Browser. På computer: Chrome eller Edge.',
      )
    }
    if (!caps.watchAdvertisements) {
      throw new BleError(BleErrorCode.NoWatchAdvertisements, missingAdvertisementHelp())
    }

    const device = await requestBlazepodDevice()
    const manufacturerData = await waitForManufacturerData(device)
    const server = await connectGatt(device)
    const chars = await resolveCharacteristics(server)
    return new WebBluetoothConnection(device, server, chars, manufacturerData)
  }
}

interface GattChars {
  rx: BluetoothRemoteGATTCharacteristic
  color: BluetoothRemoteGATTCharacteristic
  tap: BluetoothRemoteGATTCharacteristic
}

class WebBluetoothConnection implements BleConnection {
  readonly id: string
  readonly name?: string
  readonly manufacturerData: Uint8Array
  private readonly device: BluetoothDevice
  private readonly chars: GattChars
  private readonly queue = new SerialQueue()
  private disconnectHandlers = new Set<() => void>()
  private tapListener: ((event: Event) => void) | null = null
  connected: boolean

  constructor(
    device: BluetoothDevice,
    _server: BluetoothRemoteGATTServer,
    chars: GattChars,
    manufacturerData: Uint8Array,
  ) {
    this.device = device
    this.chars = chars
    this.manufacturerData = manufacturerData
    this.id = device.id
    this.name = device.name ?? undefined
    this.connected = true
    this.device.addEventListener('gattdisconnected', this.handleDisconnected)
  }

  async writeAuth(token: Uint8Array): Promise<void> {
    assertWritableUuid(UART_RX_CHAR_UUID)
    await this.queue.enqueue(async () => {
      this.assertConnected()
      await this.chars.rx.writeValueWithResponse(token.slice())
    }, 0)
  }

  async writeColor(payload: Uint8Array): Promise<void> {
    assertWritableUuid(COLOR_CHAR_UUID)
    await this.queue.enqueue(async () => {
      this.assertConnected()
      const characteristic = this.chars.color
      if (characteristic.properties.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(payload.slice())
        return
      }
      await characteristic.writeValueWithResponse(payload.slice())
    })
  }

  async startTapNotifications(onTap: (raw: Uint8Array) => void): Promise<void> {
    await this.queue.enqueue(async () => {
      this.assertConnected()
      this.tapListener = (event: Event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic
        if (!target.value) return
        onTap(copyBytes(target.value))
      }
      this.chars.tap.addEventListener('characteristicvaluechanged', this.tapListener)
      await this.chars.tap.startNotifications()
    })
  }

  async disconnect(): Promise<void> {
    if (this.tapListener) {
      this.chars.tap.removeEventListener('characteristicvaluechanged', this.tapListener)
      this.tapListener = null
    }
    try {
      this.device.gatt?.disconnect()
    } catch {
      /* already gone */
    }
    this.handleDisconnected()
  }

  onDisconnected(handler: () => void): () => void {
    this.disconnectHandlers.add(handler)
    return () => {
      this.disconnectHandlers.delete(handler)
    }
  }

  private handleDisconnected = (): void => {
    if (!this.connected) return
    this.connected = false
    this.device.removeEventListener('gattdisconnected', this.handleDisconnected)
    for (const handler of this.disconnectHandlers) handler()
  }

  private assertConnected(): void {
    if (!this.connected || !this.device.gatt?.connected) {
      this.connected = false
      throw new BleError(BleErrorCode.NotConnected, 'Podden er ikke forbundet.')
    }
  }
}

async function requestBlazepodDevice(): Promise<BluetoothDevice> {
  const optionalServices = [...OPTIONAL_SERVICES]
  const manufacturerFilter: RequestDeviceOptions = {
    filters: [{ manufacturerData: [{ companyIdentifier: COMPANY_ID }] }],
    optionalServices,
    optionalManufacturerData: [COMPANY_ID],
  }
  try {
    return await navigator.bluetooth.requestDevice(manufacturerFilter)
  } catch (error) {
    if (isUserCancel(error)) {
      throw new BleError(BleErrorCode.UserCancelled, 'Tilslutning blev annulleret.', {
        cause: error,
      })
    }
  }

  try {
    return await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: NAME_PREFIX }, { namePrefix: 'Blazepod' }],
      optionalServices,
      optionalManufacturerData: [COMPANY_ID],
    })
  } catch (error) {
    if (isUserCancel(error)) {
      throw new BleError(BleErrorCode.UserCancelled, 'Tilslutning blev annulleret.', {
        cause: error,
      })
    }
    throw new BleError(
      BleErrorCode.ConnectFailed,
      'Kunne ikke finde en Blazepod. Luk den officielle app, og sørg for at poden er tændt og i nærheden.',
      { cause: error },
    )
  }
}

async function waitForManufacturerData(device: BluetoothDevice): Promise<Uint8Array> {
  if (typeof device.watchAdvertisements !== 'function') {
    throw new BleError(BleErrorCode.NoWatchAdvertisements, missingAdvertisementHelp())
  }

  const abort = new AbortController()
  return new Promise<Uint8Array>((resolve, reject) => {
    let settled = false

    const finish = (action: () => void): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      device.removeEventListener('advertisementreceived', onAd)
      abort.abort()
      action()
    }

    const onAd = (event: Event): void => {
      const ad = event as BluetoothAdvertisingEvent
      const view = ad.manufacturerData.get(COMPANY_ID)
      if (!view || view.byteLength < 5) return
      finish(() => resolve(copyBytes(view)))
    }

    const timer = window.setTimeout(() => {
      finish(() =>
        reject(
          new BleError(
            BleErrorCode.AdvertisementTimeout,
            'Fik ikke manufacturer data fra poden inden timeout. Brug friske reklamedata — flyt poden tættere på, og prøv igen. ' +
              missingAdvertisementHelp(),
          ),
        ),
      )
    }, ADVERTISEMENT_WAIT_MS)

    device.addEventListener('advertisementreceived', onAd)
    device.watchAdvertisements({ signal: abort.signal }).catch((error: unknown) => {
      finish(() =>
        reject(
          new BleError(BleErrorCode.NoWatchAdvertisements, missingAdvertisementHelp(), {
            cause: error,
          }),
        ),
      )
    })
  })
}

async function connectGatt(device: BluetoothDevice): Promise<BluetoothRemoteGATTServer> {
  if (!device.gatt) {
    throw new BleError(BleErrorCode.ConnectFailed, 'Enheden har ingen GATT-server.')
  }
  try {
    return await device.gatt.connect()
  } catch (error) {
    throw new BleError(
      BleErrorCode.ConnectFailed,
      'GATT-forbindelse fejlede. Luk den officielle Blazepod-app, og prøv igen.',
      { cause: error },
    )
  }
}

async function resolveCharacteristics(
  server: BluetoothRemoteGATTServer,
): Promise<GattChars> {
  try {
    const uart = await server.getPrimaryService(UART_SERVICE_UUID)
    const rx = await uart.getCharacteristic(UART_RX_CHAR_UUID)
    const colorService = await server.getPrimaryService(COLOR_SERVICE_UUID)
    const color = await colorService.getCharacteristic(COLOR_CHAR_UUID)
    const tapService = await server.getPrimaryService(TAP_SERVICE_UUID)
    const tap = await tapService.getCharacteristic(TAP_CHAR_UUID)
    return { rx, color, tap }
  } catch (error) {
    try {
      server.disconnect()
    } catch {
      /* ignore */
    }
    throw new BleError(
      BleErrorCode.GattFailed,
      'Kunne ikke åbne UART-, farve- eller tap-service. Er det en Blazepod?',
      { cause: error },
    )
  }
}

function isUserCancel(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? String(error.name) : ''
  return name === 'NotFoundError' || name === 'AbortError'
}
