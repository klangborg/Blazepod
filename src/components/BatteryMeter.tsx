import { decodeAdvertisedBattery } from '../ble/protocol'

export function BatteryMeter({
  manufacturerData,
  compact = false,
}: {
  manufacturerData: Uint8Array
  compact?: boolean
}) {
  const percent = decodeAdvertisedBattery(manufacturerData)
  const tone = batteryTone(percent)

  return (
    <div className={`battery ${compact ? 'compact' : ''}`}>
      <div className="battery-label">
        <span>Batteri</span>
        <strong className={tone}>{percent === null ? 'ukendt' : `${percent} %`}</strong>
      </div>
      <div className="battery-track" aria-hidden={percent === null}>
        <div
          className={`battery-fill ${tone}`}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
      {compact ? null : (
        <div className="muted">Fra reklamedata ved tilslutning</div>
      )}
    </div>
  )
}

function batteryTone(percent: number | null): 'ok' | 'warn' | 'danger' | 'unknown' {
  if (percent === null) return 'unknown'
  if (percent >= 50) return 'ok'
  if (percent >= 20) return 'warn'
  return 'danger'
}
