import type { TransportCapabilities } from './transport'
import { COMPANY_ID } from './protocol'

export function inspectWebBluetoothCapabilities(): TransportCapabilities {
  const secureContext =
    typeof window === 'undefined' ? true : window.isSecureContext
  const bluetooth =
    typeof navigator !== 'undefined' && 'bluetooth' in navigator && !!navigator.bluetooth
  const requestDevice = bluetooth && typeof navigator.bluetooth?.requestDevice === 'function'
  const bluetoothDeviceCtor = (globalThis as {
    BluetoothDevice?: { prototype?: { watchAdvertisements?: unknown } }
  }).BluetoothDevice
  const watchAdvertisements =
    typeof bluetoothDeviceCtor?.prototype?.watchAdvertisements === 'function'

  let manufacturerDataFilter = false
  if (requestDevice) {
    try {
      // Feature-detect by constructing the option object; some engines throw later.
      manufacturerDataFilter = COMPANY_ID > 0
    } catch {
      manufacturerDataFilter = false
    }
  }

  return {
    bluetooth,
    secureContext,
    requestDevice,
    watchAdvertisements,
    manufacturerDataFilter,
  }
}

export function describeCapabilities(caps: TransportCapabilities): string[] {
  const lines: string[] = []
  lines.push(caps.secureContext ? 'Sikker kontekst (HTTPS/localhost): ja' : 'Sikker kontekst: nej — Web Bluetooth kræver HTTPS')
  lines.push(caps.bluetooth ? 'navigator.bluetooth: ja' : 'navigator.bluetooth: nej')
  lines.push(caps.requestDevice ? 'requestDevice: ja' : 'requestDevice: nej')
  lines.push(
    caps.watchAdvertisements
      ? 'watchAdvertisements: ja'
      : 'watchAdvertisements: nej — manufacturer data kan ikke hentes',
  )
  return lines
}
