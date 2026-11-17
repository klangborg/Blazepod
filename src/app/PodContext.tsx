import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { MockBluetoothTransport } from '../ble/MockBluetoothTransport'
import { PodManager, type ManagedPod } from '../ble/PodManager'
import { WebBluetoothTransport } from '../ble/WebBluetoothTransport'
import { listPodNames, savePodName } from '../storage/pods'

interface PodContextValue {
  manager: PodManager
  pods: ManagedPod[]
  connected: ManagedPod[]
  transportKind: 'web' | 'mock'
  busy: boolean
  error: string | null
  connect: () => Promise<ManagedPod | null>
  disconnect: (id: string) => Promise<void>
  identify: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  lightsOffAll: () => Promise<void>
  useMock: () => Promise<void>
  useWeb: () => Promise<void>
  clearError: () => void
}

const PodContext = createContext<PodContextValue | null>(null)

export function PodProvider({ children }: { children: ReactNode }) {
  const [manager] = useState(() => new PodManager(new WebBluetoothTransport()))
  const [pods, setPods] = useState<ManagedPod[]>([])
  const [transportKind, setTransportKind] = useState<'web' | 'mock'>(
    manager.getTransport().kind,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPods(manager.list())
    return manager.subscribe(() => setPods(manager.list()))
  }, [manager])

  useEffect(() => {
    void listPodNames()
      .then((names) => {
        for (const [id, name] of Object.entries(names)) {
          manager.rename(id, name)
        }
      })
      .catch(() => {
        /* IndexedDB kan mangle i test eller privat browsing */
      })
  }, [manager])

  const run = useCallback(async <T,>(work: () => Promise<T>): Promise<T | null> => {
    setBusy(true)
    setError(null)
    try {
      return await work()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Ukendt fejl'
      setError(message)
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  const connect = useCallback(
    () => run(() => manager.connect()),
    [manager, run],
  )

  const disconnect = useCallback(
    (id: string) => manager.disconnect(id),
    [manager],
  )

  const identify = useCallback(
    async (id: string) => {
      await run(async () => {
        await manager.identify(id)
      })
    },
    [manager, run],
  )

  const rename = useCallback(
    async (id: string, name: string) => {
      manager.rename(id, name)
      await savePodName(id, name)
    },
    [manager],
  )

  const lightsOffAll = useCallback(() => manager.lightsOffAll(), [manager])

  const useMock = useCallback(async () => {
    await manager.disconnectAll()
    manager.setTransport(new MockBluetoothTransport())
    setTransportKind('mock')
    setError(null)
  }, [manager])

  const useWeb = useCallback(async () => {
    await manager.disconnectAll()
    manager.setTransport(new WebBluetoothTransport())
    setTransportKind('web')
    setError(null)
  }, [manager])

  const value = useMemo<PodContextValue>(
    () => ({
      manager,
      pods,
      connected: pods.filter((pod) => pod.status === 'connected'),
      transportKind,
      busy,
      error,
      connect,
      disconnect,
      identify,
      rename,
      lightsOffAll,
      useMock,
      useWeb,
      clearError: () => setError(null),
    }),
    [
      manager,
      pods,
      transportKind,
      busy,
      error,
      connect,
      disconnect,
      identify,
      rename,
      lightsOffAll,
      useMock,
      useWeb,
    ],
  )

  return <PodContext.Provider value={value}>{children}</PodContext.Provider>
}

export function usePods(): PodContextValue {
  const value = useContext(PodContext)
  if (!value) throw new Error('usePods skal bruges inde i PodProvider')
  return value
}
