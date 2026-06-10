import { Component, type ReactNode } from 'react'
import { HashRouter as BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AINarrativeProvider } from '@/contexts/AINarrativeContext'
import { AIOperatorProvider } from '@/contexts/AIOperatorContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { ConfirmProvider } from '@/contexts/ConfirmContext'
import { ConnectScreen } from '@/components/ConnectScreen'
import { getServerUrl } from '@/lib/config'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import AuditBuilder from '@/pages/AuditBuilder'
import PentestWorkbench from '@/pages/PentestWorkbench'
import Reports from '@/pages/Reports'
import Settings from '@/pages/Settings'
import C2Console from '@/pages/C2Console'
import CredentialVault from '@/pages/CredentialVault'
import OSINTModule from '@/pages/OSINTModule'
import NetworkMap from '@/pages/NetworkMap'
import PasswordAuditing from '@/pages/PasswordAuditing'
import Playbooks from '@/pages/Playbooks'
import Guide from '@/pages/Guide'
import LogAnalysis from '@/pages/LogAnalysis'
import AllScans from '@/pages/AllScans'
import AllFindings from '@/pages/AllFindings'
import Listeners from '@/pages/Listeners'
import Agents from '@/pages/Agents'
import AttackPaths from '@/pages/AttackPaths'
import AIOperator from '@/pages/AIOperator'
import CveWatch from '@/pages/CveWatch'
import Timeline from '@/pages/Timeline'
import CommandLibrary from '@/pages/CommandLibrary'
import ScanDiff from '@/pages/ScanDiff'
import Scratchpad from '@/pages/Scratchpad'

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', background: 'var(--bg)', color: 'var(--crit)', height: '100vh', overflow: 'auto' }}>
          <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>RENDER ERROR</div>
          <pre style={{ fontSize: 13, color: 'var(--crit)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{String(this.state.error)}</pre>
          <pre style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 16, whiteSpace: 'pre-wrap' }}>{(this.state.error as any)?.stack}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 20, padding: '8px 16px', background: 'var(--accent)', color: '#1a1408', border: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12 }}>Retry</button>
        </div>
      )
    }
    return this.props.children
  }
}

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg)' }}>
        <div style={{ width: 20, height: 20, border: '2px solid var(--rule)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <AIOperatorProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="audit" element={<AuditBuilder />} />
          <Route path="pentest" element={<PentestWorkbench />} />
          <Route path="osint" element={<OSINTModule />} />
          <Route path="network" element={<NetworkMap />} />
          <Route path="cracking" element={<PasswordAuditing />} />
          <Route path="playbooks" element={<Playbooks />} />
          <Route path="guide" element={<Guide />} />
          <Route path="vulns" element={<Navigate to="/findings" replace />} />
          <Route path="logs" element={<LogAnalysis />} />
          <Route path="scans" element={<AllScans />} />
          <Route path="findings" element={<AllFindings />} />
          <Route path="listeners" element={<Listeners />} />
          <Route path="agents" element={<Agents />} />
          <Route path="attack-paths" element={<AttackPaths />} />
          <Route path="operator" element={<AIOperator />} />
          <Route path="cve-watch" element={<CveWatch />} />
          <Route path="timeline" element={<Timeline />} />
          <Route path="command-library" element={<CommandLibrary />} />
          <Route path="scan-diff"      element={<ScanDiff />} />
          <Route path="scratchpad"     element={<Scratchpad />} />
          <Route path="c2" element={<C2Console />} />
          <Route path="vault" element={<CredentialVault />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </AIOperatorProvider>
  )
}

function AuthGate() {
  const { user, loading, unreachable } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg)' }}>
        <div style={{ width: 20, height: 20, border: '2px solid var(--rule)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (unreachable) return <ConnectScreen />

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/*" element={<AppErrorBoundary><ProtectedRoutes /></AppErrorBoundary>} />
    </Routes>
  )
}

export default function App() {
  if (!getServerUrl()) return <ThemeProvider><ConnectScreen /></ThemeProvider>
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <AINarrativeProvider>
                <AuthGate />
              </AINarrativeProvider>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
