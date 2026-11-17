import { useMemo, useState } from 'react'
import { usePods } from '../app/PodContext'
import { formatHex } from '../app/format'
import { inspectWebBluetoothCapabilities } from '../ble/capabilities'
import { DANISH_BROWSER_HELP } from '../ble/errors'
import type { ManagedPod } from '../ble/PodManager'
import { BatteryMeter } from '../components/BatteryMeter'

export function PodsPage() {
  const { pods, connected, connect, disconnect, identify, rename, busy, error, transportKind, useWeb } =
    usePods()
  const caps = useMemo(() => inspectWebBluetoothCapabilities(), [])
  const missingBluetooth = !caps.bluetooth || !caps.requestDevice || !caps.watchAdvertisements

  return (
    <main className="page app-shell">
      <div>
        <h1 className="page-title">Pods</h1>
        <p className="lede">
          Tilslut én pod ad gangen med et tryk. Luk den officielle Blazepod-app først, ellers
          kan autentificeringen fejle.
        </p>
      </div>
      {transportKind === 'mock' ? (
        <div className="banner">
          Appen bruger simulerede pods (ikke rigtig Bluetooth).{' '}
          <button className="btn btn-ghost" type="button" onClick={() => void useWeb()}>
            Brug Web Bluetooth
          </button>
        </div>
      ) : missingBluetooth ? (
        <div className="banner">{DANISH_BROWSER_HELP}</div>
      ) : null}
      {error ? <div className="banner error">{error}</div> : null}
      <button className="btn btn-primary btn-block" type="button" disabled={busy} onClick={() => void connect()}>
        {busy ? 'Tilslutter…' : 'Tilslut pod'}
      </button>
      <p className="muted">
        {connected.length} forbundet. Hver tilslutning kræver et brugertryk på grund af Web
        Bluetooth.
      </p>
      <div className="list">
        {pods.length === 0 ? (
          <div className="card empty">Ingen pods endnu. Tryk på Tilslut pod.</div>
        ) : (
          pods.map((pod) => (
            <PodCard
              key={pod.id}
              pod={pod}
              onRename={(name) => void rename(pod.id, name)}
              onIdentify={() => void identify(pod.id)}
              onDisconnect={() => void disconnect(pod.id)}
            />
          ))
        )}
      </div>
    </main>
  )
}

function PodCard({
  pod,
  onRename,
  onIdentify,
  onDisconnect,
}: {
  pod: ManagedPod
  onRename: (name: string) => void
  onIdentify: () => void
  onDisconnect: () => void
}) {
  const [editing, setEditing] = useState(pod.givenName)

  return (
    <article className="card pod-card">
      <div className="pod-head">
        <div>
          <strong>{pod.givenName}</strong>
          <div className="muted">{pod.bleName ?? pod.id}</div>
        </div>
        <span className="badge">
          <span
            className={`dot ${pod.status === 'connected' ? 'ok' : pod.status === 'authenticating' ? 'warn' : 'danger'}`}
          />
          {statusLabel(pod.status)}
        </span>
      </div>
      <BatteryMeter percent={pod.batteryPercent} compact />
      <div className="field">
        <span>Navn</span>
        <input
          value={editing}
          onChange={(event) => setEditing(event.target.value)}
          onBlur={() => onRename(editing)}
        />
      </div>
      <div className="mono muted">Mfr {formatHex(pod.manufacturerData)}</div>
      {pod.lastError ? <div className="banner error">{pod.lastError}</div> : null}
      <div className="row">
        <button className="btn" type="button" disabled={pod.status !== 'connected'} onClick={onIdentify}>
          Identificér
        </button>
        <button className="btn btn-ghost" type="button" onClick={onDisconnect}>
          Afbryd
        </button>
      </div>
    </article>
  )
}

function statusLabel(status: ManagedPod['status']): string {
  if (status === 'connected') return 'Forbundet'
  if (status === 'authenticating') return 'Auth 12 s'
  if (status === 'connecting') return 'Tilslutter'
  return 'Afbrudt'
}
