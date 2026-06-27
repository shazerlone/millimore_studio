import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { colors } from '@theme/colors'
import { Sidebar } from '@components/Sidebar'
import { Login } from '@screens/Login'
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
  return authed ? <Outlet /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route element={<Shell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/go-live" element={<GoLive />} />
              <Route path="/overlay" element={<OverlayDesigner />} />
              <Route path="/mt5" element={<MT5Connection />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  )
}
