import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { usePods } from '../app/PodContext'
import { BrandMark } from './BrandMark'

export function Layout() {
  const { connected, lightsOffAll, transportKind } = usePods()
  const location = useLocation()
  const hideNav = location.pathname.startsWith('/session')

  return (
    <div className={hideNav ? 'hidden-nav' : undefined}>
      <header className="topbar">
        <div className="brand">
          <BrandMark className="brand-mark" />
          Blazepod
        </div>
        <div className="topbar-spacer" />
        <div className="conn-pill">
          <span className={`dot ${connected.length ? 'ok' : 'warn'}`} />
          {connected.length} pod{connected.length === 1 ? '' : 's'}
          {transportKind === 'mock' ? ' · mock' : ''}
        </div>
      </header>
      <Outlet />
      {connected.length > 0 && !hideNav ? (
        <div className="page emergency">
          <button className="btn btn-danger btn-block" type="button" onClick={() => void lightsOffAll()}>
            Sluk alle lys
          </button>
        </div>
      ) : null}
      <nav className="bottom-nav">
        <NavLink to="/" end>
          Pods
        </NavLink>
        <NavLink to="/exercises">Øvelser</NavLink>
        <NavLink to="/history">Historik</NavLink>
        <NavLink to="/diagnostics">Diagnostik</NavLink>
      </nav>
    </div>
  )
}
