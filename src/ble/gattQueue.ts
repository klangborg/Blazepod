import { GATT_SERIAL_GAP_MS } from './protocol'

export class SerialQueue {
  private tail: Promise<void> = Promise.resolve()

  enqueue<T>(work: () => Promise<T>, gapMs = GATT_SERIAL_GAP_MS): Promise<T> {
    const run = this.tail.then(async () => {
      if (gapMs > 0) {
        await sleep(gapMs)
      }
      return work()
    })
    this.tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
