export const BleErrorCode = {
  NoBluetooth: 'NO_BLUETOOTH',
  InsecureContext: 'INSECURE_CONTEXT',
  NoWatchAdvertisements: 'NO_WATCH_ADVERTISEMENTS',
  NoManufacturerData: 'NO_MANUFACTURER_DATA',
  AdvertisementTimeout: 'ADVERTISEMENT_TIMEOUT',
  UserCancelled: 'USER_CANCELLED',
  AuthFailed: 'AUTH_FAILED',
  ConnectFailed: 'CONNECT_FAILED',
  GattFailed: 'GATT_FAILED',
  NotConnected: 'NOT_CONNECTED',
  DfuBlocked: 'DFU_BLOCKED',
  Unsupported: 'UNSUPPORTED',
} as const

export type BleErrorCode = (typeof BleErrorCode)[keyof typeof BleErrorCode]

export class BleError extends Error {
  readonly code: BleErrorCode

  constructor(code: BleErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'BleError'
    this.code = code
  }
}

export const DANISH_BROWSER_HELP =
  'Safari understøtter ikke Web Bluetooth. Brug Bluefy (gratis) på iPhone. Hvis Bluefy ikke kan levere manufacturer data eller tap-events, prøv Beacio eller C. Browser. Chrome eller Edge virker på computer til udvikling. Appen skal serveres over HTTPS.'

export function missingAdvertisementHelp(): string {
  return (
    'Denne browser kan ikke levere friske Bluetooth-reklamedata (watchAdvertisements / manufacturer data), som Blazepod-login kræver. ' +
    'Auth må ikke springes over. ' +
    DANISH_BROWSER_HELP
  )
}
