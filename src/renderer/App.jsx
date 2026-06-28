import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { colors } from '@theme/colors'
import { Sidebar } from '@components/Sidebar'
import { ToastHost } from '@components/Toast'
import { Login } from '@screens/Login'
import { Onboarding } from '@screens/Onboarding'
import { Monitor } from '@screens/Monitor'
import { Dashboard } from '@screens/Dashboard'
import { GoLive } from '@screens/GoLive'
import { OverlayDesigner } from '@screens/OverlayDesigner'
import { MT5Connection } from '@screens/MT5Connection'
import { Analytics } from '@screens/Analytics'
import { Settings } from '@screens/Settings'
import { AppProvider, useApp } from './store'

function Shell() {
  const { isLive } = useApp()
  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.background }}>
      <Sidebar isLive={isLive} />
      <Outlet />
    </div>
  )
}

function RequireAuth() {
  const { authed } = useApp()
  if (authed === null) return null // still loading the persisted session
  return authed ? <Outlet /> : <Navigate to="/login" replace />
}

/** Gate the main app behind the first-run permission wizard. */
function RequireOnboarded() {
  const { onboarded } = useApp()
  if (onboarded === null) return null // still loading the flag
  return onboarded ? <Outlet /> : <Navigate to="/setup" replace />
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          {/* standalone floating monitor window — no auth/sidebar */}
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/setup" element={<Onboarding />} />
            <Route element={<RequireOnboarded />}>
              <Route element={<Shell />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/go-live" element={<GoLive />} />
                <Route path="/overlay" element={<OverlayDesigner />} />
                <Route path="/mt5" element={<MT5Connection />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      <ToastHost />
    </AppProvider>
  )
}
