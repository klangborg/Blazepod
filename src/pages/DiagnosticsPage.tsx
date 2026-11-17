import { useEffect, useMemo, useState } from 'react'
import { usePods } from '../app/PodContext'
import { formatHex } from '../app/format'
import { inspectWebBluetoothCapabilities, describeCapabilities } from '../ble/capabilities'
import { DANISH_BROWSER_HELP } from '../ble/errors'
import {
  AUTH_HOLD_MS,
  buildAuthToken,
  encodeColor,
  TapState,
  toHex,
} from '../ble/protocol'
import { encodeMockTap, MockBluetoothTransport } from '../ble/MockBluetoothTransport'
import { colorRgb } from '../domain/colors'
import { BatteryMeter } from '../components/BatteryMeter'

export function DiagnosticsPage() {
  const {
    manager,
    pods,
    connected,
    connect,
    identify,
    lightsOffAll,
    busy,
    error,
    transportKind,
    useMock,
    useWeb,
  } = usePods()
  const caps = useMemo(() => inspectWebBluetoothCapabilities(), [])
  const capLines = describeCapabilities(caps)
  const pod = connected[0] ?? pods[0]
  const [holdLeft, setHoldLeft] = useState<number | null>(null)
  const [tapLog, setTapLog] = useState<string[]>([])

  useEffect(() => {
    return manager.onTap((id, tap) => {
      setTapLog((current) =>
        [
          `${new Date().toLocaleTimeString('da-DK')} ${id.slice(0, 8)} ${tap.stateName} ${tap.reactionMs} ms [${toHex(tap.raw)}]`,
          ...current,
        ].slice(0, 12),
      )
    })
  }, [manager])

  useEffect(() => {
    if (!pod || pod.status !== 'authenticating' || !pod.connectedAt) {
      const authenticating = pods.some((item) => item.status === 'authenticating')
      if (!authenticating) {
        setHoldLeft(null)
        return
      }
    }
    const started = Date.now()
    const total = transportKind === 'mock' ? 300 : AUTH_HOLD_MS
    setHoldLeft(total)
    const timer = window.setInterval(() => {
      const left = Math.max(0, total - (Date.now() - started))
      setHoldLeft(left)
      if (left <= 0) window.clearInterval(timer)
    }, 100)
    return () => window.clearInterval(timer)
  }, [pods, pod, transportKind])

  const token = pod ? buildAuthToken(pod.manufacturerData) : null

  async function dimOn(): Promise<void> {
    if (!pod) return
    await manager.setColor(pod.id, colorRgb('orange'), { dim: 0.18, autoOffOnTap: true })
  }

  async function simulateTap(): Promise<void> {
    const transport = manager.getTransport()
    if (!(transport instanceof MockBluetoothTransport) || !pod) return
    transport.get(pod.id)?.emitTap(encodeMockTap(TapState.LitAutoOff, 187))
  }

  return (
    <main className="page app-shell">
      <div>
        <h1 className="page-title">Diagnostik</h1>
        <p className="lede">
          Verificér én fysisk pod: manufacturer data, auth-token, 12 s hold, dæmpet farve og
          tap-event. Auth springes aldrig over.
        </p>
      </div>

      <section className="card stack">
        <h2>Browser</h2>
        {capLines.map((line) => (
          <div key={line} className="muted">
            {line}
          </div>
        ))}
        {(!caps.bluetooth || !caps.watchAdvertisements) && (
          <div className="banner">{DANISH_BROWSER_HELP}</div>
        )}
        <div className="row">
          <span className="badge">{transportKind === 'mock' ? 'Simuleret BLE' : 'Web Bluetooth'}</span>
          {transportKind === 'web' ? (
            <button className="btn btn-ghost" type="button" onClick={() => void useMock()}>
              Brug simuleret pod (kun udvikling)
            </button>
          ) : (
            <button className="btn btn-ghost" type="button" onClick={() => void useWeb()}>
              Brug rigtige pods (Web Bluetooth)
            </button>
          )}
        </div>
        {transportKind === 'mock' ? (
          <div className="banner">
            Simulerede pods hedder &quot;BlazePod Mock&quot; og er ikke fysisk hardware. Slå Web
            Bluetooth til for at scanne rigtige pods.
          </div>
        ) : null}
      </section>

      {error ? <div className="banner error">{error}</div> : null}

      <button className="btn btn-primary btn-block" type="button" disabled={busy} onClick={() => void connect()}>
        {busy ? 'Arbejder…' : 'Scan og tilslut én pod'}
      </button>

      {holdLeft !== null && (
        <div className="banner">
          Auth-hold: {Math.ceil(holdLeft / 1000)} s tilbage. Forkert token kan acceptere ATT-write
          og derefter afbryde.
        </div>
      )}

      {pod ? (
        <section className="card stack">
          <h2>{pod.givenName}</h2>
          <div className="muted">Status: {pod.status}</div>
          <BatteryMeter percent={pod.batteryPercent} />
          <div>
            <div className="muted">Manufacturer data</div>
            <div className="mono">{formatHex(pod.manufacturerData)}</div>
          </div>
          <div>
            <div className="muted">Auth-token (sea + CRC)</div>
            <div className="mono">{token ? formatHex(token) : '—'}</div>
          </div>
          <div className="row">
            <button className="btn" type="button" disabled={pod.status !== 'connected'} onClick={() => void dimOn()}>
              Dæmpet farve
            </button>
            <button
              className="btn"
              type="button"
              disabled={pod.status !== 'connected'}
              onClick={() => void manager.lightsOff(pod.id)}
            >
              Sluk
            </button>
            <button
              className="btn"
              type="button"
              disabled={pod.status !== 'connected'}
              onClick={() => void identify(pod.id)}
            >
              Blink
            </button>
          </div>
          {transportKind === 'mock' && (
            <button className="btn btn-ghost" type="button" onClick={() => void simulateTap()}>
              Simulér tap
            </button>
          )}
        </section>
      ) : (
        <div className="card empty">Ingen pod tilsluttet.</div>
      )}

      <section className="card stack">
        <h2>Tap-events</h2>
        <p className="muted">
          8 bytes: tilstand, millisekunder siden tænding (LE), plus 3 ukendte bytes. Farve skrives
          som GBR.
        </p>
        {tapLog.length === 0 ? (
          <div className="empty">Vent på et tryk på poden.</div>
        ) : (
          tapLog.map((line) => (
            <div className="mono" key={line}>
              {line}
            </div>
          ))
        )}
      </section>

      <button className="btn btn-danger btn-block" type="button" onClick={() => void lightsOffAll()}>
        Nødstop / sluk alle
      </button>

      <p className="muted">
        Testfarve kodes som {toHex(encodeColor({ r: 40, g: 18, b: 0 }))} (GBR, dæmpet orange).
      </p>
    </main>
  )
}
