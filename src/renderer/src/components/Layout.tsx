import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import CommandPalette from './CommandPalette'
import NotificationBell from './NotificationBell'
import ActiveUsers from './ActiveUsers'
import ProjectModal from './ProjectModal'
import Icon from './Icon'
import { useAppStore } from '@/stores/appStore'
import { useAINarrative } from '../contexts/AINarrativeContext'
import { useAuth } from '../contexts/AuthContext'
import { getApiBase } from '@/lib/config'

// ── Nav structure (mirrors handoff shell.jsx) ─────────────────────────────────

const NAV_TOP = [
  { to: '/', label: 'Dashboard', icon: 'grid', end: true },
]

const NAV_GROUPS = [
  {
    id: 'recon', label: 'Recon',
    items: [
      { to: '/osint',   label: 'OSINT',      icon: 'search' },
      { to: '/network', label: 'Network Map', icon: 'network' },
    ],
  },
  {
    id: 'offense', label: 'Offense',
    items: [
      { to: '/pentest',         label: 'Pentest Workbench', icon: 'swords' },
      { to: '/c2',              label: 'C2 Console',        icon: 'terminal' },
      { to: '/playbooks',       label: 'Playbooks',         icon: 'book' },
      { to: '/attack-paths',    label: 'Attack Paths',      icon: 'activity' },
      { to: '/operator',        label: 'AI Operator',       icon: 'cube' },
      { to: '/command-library', label: 'Command Library',   icon: 'fingerprint' },
    ],
  },
  {
    id: 'credentials', label: 'Credentials',
    items: [
      { to: '/vault',    label: 'Credential Vault',  icon: 'key' },
      { to: '/cracking', label: 'Password Auditing', icon: 'lock' },
    ],
  },
  {
    id: 'defense', label: 'Defense',
    items: [
      { to: '/audit',     label: 'Audit Builder', icon: 'shield' },
      { to: '/agents',    label: 'Agents',        icon: 'cpu' },
      { to: '/listeners', label: 'Listeners',     icon: 'radio' },
      { to: '/findings',  label: 'Vuln Tracker',  icon: 'flag' },
      { to: '/cve-watch', label: 'CVE Watch',     icon: 'eye' },
      { to: '/timeline',  label: 'Timeline',      icon: 'clock' },
      { to: '/logs',      label: 'Log Analysis',  icon: 'history' },
    ],
  },
]

const NAV_BOTTOM = [
  { to: '/reports',  label: 'Reports',  icon: 'file' },
  { to: '/settings', label: 'Settings', icon: 'cog' },
  { to: '/guide',    label: 'Guide',    icon: 'help' },
]

// ── Logo ──────────────────────────────────────────────────────────────────────

function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block', flexShrink: 0 }}>
      <polygon points="16,2 4,28 28,28" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <polygon points="16,8 9,24 23,24" fill="var(--accent)" opacity={0.18} stroke="var(--accent)" strokeWidth="1" />
      <line x1="16" y1="8" x2="16" y2="24" stroke="var(--accent)" strokeWidth="1.2" />
    </svg>
  )
}

// ── NavRow ────────────────────────────────────────────────────────────────────

function NavRow({ to, label, icon, end = false }: { to: string; label: string; icon: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className="nav-row"
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        padding: '6px 10px',
        marginBottom: 1,
        background: isActive ? 'var(--accent-2)' : 'transparent',
        border: 'none',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        color: isActive ? 'var(--fg)' : 'var(--fg-2)',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 12.5,
        textDecoration: 'none',
        transition: 'color .12s, background .12s',
      })}
    >
      {({ isActive }) => (
        <>
          <Icon name={icon} size={13} color={isActive ? 'var(--accent)' : 'currentColor'} />
          <span style={{ flex: 1 }}>{label}</span>
          {isActive && <Icon name="chev_r" size={10} color="var(--accent)" />}
        </>
      )}
    </NavLink>
  )
}

// ── Ticker ────────────────────────────────────────────────────────────────────

function Ticker({ backendOnline }: { backendOnline: boolean | null }) {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-GB'))

  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString('en-GB')), 1000)
    return () => clearInterval(id)
  }, [])

  const items = [
    'Recon phase active',
    'Backend ' + (backendOnline === null ? 'connecting' : backendOnline ? 'online' : 'offline'),
    'Press ? for command palette',
    'v2.0 — Paper Dark',
  ]
  const doubled = [...items, ...items]

  return (
    <div style={{
      height: 26,
      borderBottom: '1px solid var(--rule)',
      background: 'var(--bg-2)',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0,
    }}>
      <div style={{
        flexShrink: 0,
        padding: '0 12px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        borderRight: '1px solid var(--rule)',
        background: 'var(--accent)',
        color: '#1a1408',
      }}>
        <span className="mono" style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase' }}>● LIVE</span>
      </div>
      <div style={{ overflow: 'hidden', flex: 1 }}>
        <div className="ticker-track mono" style={{ fontSize: 10.5, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {doubled.map((t, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 16 }}>
              <span style={{ color: 'var(--fg-4)' }}>◆</span>
              <span>{t}</span>
            </span>
          ))}
        </div>
      </div>
      <div style={{ flexShrink: 0, padding: '0 14px', borderLeft: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{time}</span>
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ backendOnline }: { backendOnline: boolean | null }) {
  const { user, logout, token } = useAuth()
  const navigate = useNavigate()
  const { projects, selectedProject, setProjects, setSelectedProject, addProject } = useAppStore()
  const [showPicker, setShowPicker] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Load projects once
  useEffect(() => {
    if (!token) return
    fetch(`${getApiBase()}/projects`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setProjects(data)
        // Auto-select first project if none selected
        if (!selectedProject && data.length > 0) setSelectedProject(data[0])
      })
      .catch(() => {})
  }, [token])

  // Close picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : '??'

  function handleLogout() {
    logout()
    navigate('/login')
  }

  async function handleCreateProject(
    proj: { name: string; description: string },
    targets: any[],
    scope: any,
  ) {
    const res = await fetch(`${getApiBase()}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...proj, scope }),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Failed') }
    const newProject = await res.json()

    // Create targets if any
    for (const t of targets) {
      if (!t.hostname_or_ip.trim()) continue
      await fetch(`${getApiBase()}/projects/${newProject.id}/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(t),
      })
    }

    addProject(newProject)
    setSelectedProject(newProject)
    setShowNewProject(false)
  }

  return (
    <>
    <aside style={{
      width: 230,
      flexShrink: 0,
      borderRight: '1px solid var(--rule)',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      {/* Brand */}
      <div style={{ padding: '18px 18px 16px', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={22} />
          <div>
            <div className="mono" style={{ fontSize: 13, letterSpacing: '0.22em', fontWeight: 600 }}>SERAPH</div>
            <div className="mono" style={{ fontSize: 8.5, letterSpacing: '0.18em', color: 'var(--fg-3)', textTransform: 'uppercase' }}>Ops Console · v2.0</div>
          </div>
        </div>
      </div>

      {/* Engagement switcher */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--rule)', position: 'relative' }} ref={pickerRef}>
        <div className="smcap smcap-2" style={{ marginBottom: 6 }}>Engagement</div>
        <button
          onClick={() => setShowPicker(v => !v)}
          style={{
            width: '100%', textAlign: 'left', background: 'transparent',
            border: `1px solid ${showPicker ? 'var(--accent)' : 'var(--rule)'}`,
            padding: '8px 10px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', color: 'var(--fg)', cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg)' }}>
              {selectedProject ? selectedProject.name : 'No project'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
              {selectedProject ? `${selectedProject.targets?.length ?? 0} targets` : 'Select a project'}
            </span>
          </div>
          <Icon name={showPicker ? 'chev_u' : 'chev_d'} size={11} color="var(--fg-3)" />
        </button>

        {/* Dropdown */}
        {showPicker && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40,
            background: 'var(--bg-2)', border: '1px solid var(--rule-strong)',
            borderTop: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            maxHeight: 260, overflowY: 'auto',
          }}>
            {projects.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>No projects yet</div>
            ) : (
              projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProject(p); setShowPicker(false) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '9px 14px',
                    background: selectedProject?.id === p.id ? 'var(--accent-2)' : 'transparent',
                    borderLeft: `2px solid ${selectedProject?.id === p.id ? 'var(--accent)' : 'transparent'}`,
                    border: 'none', borderBottom: '1px solid var(--rule-2)', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                  onMouseEnter={e => { if (selectedProject?.id !== p.id) e.currentTarget.style.background = 'var(--bg-3)' }}
                  onMouseLeave={e => { if (selectedProject?.id !== p.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 11, color: selectedProject?.id === p.id ? 'var(--accent)' : 'var(--fg)', fontFamily: 'var(--font-sans)' }}>{p.name}</span>
                  {p.description && <span style={{ fontSize: 10, color: 'var(--fg-4)', fontFamily: 'var(--font-sans)' }}>{p.description.slice(0, 40)}</span>}
                </button>
              ))
            )}
            <button
              onClick={() => { setShowPicker(false); setShowNewProject(true) }}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 14px',
                background: 'transparent', border: 'none', borderTop: '1px solid var(--rule)',
                display: 'flex', alignItems: 'center', gap: 6,
                color: 'var(--accent)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)',
              }}
            >
              <Icon name="plus" size={11} color="var(--accent)" />
              New Project
            </button>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {NAV_TOP.map(item => (
          <NavRow key={item.to} to={item.to} label={item.label} icon={item.icon} end={item.end} />
        ))}

        {NAV_GROUPS.map(group => (
          <div key={group.id} style={{ marginTop: 14 }}>
            <div className="smcap smcap-2" style={{ padding: '0 10px 4px' }}>{group.label}</div>
            {group.items.map(item => (
              <NavRow key={item.to} to={item.to} label={item.label} icon={item.icon} />
            ))}
          </div>
        ))}

        <div style={{ borderTop: '1px solid var(--rule)', margin: '14px 8px 8px' }} />
        <div className="smcap smcap-2" style={{ padding: '0 10px 4px' }}>Workspace</div>
        {NAV_BOTTOM.map(item => (
          <NavRow key={item.to} to={item.to} label={item.label} icon={item.icon} />
        ))}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--rule)', padding: 10 }}>
        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`dot ${backendOnline ? 'dot-live' : backendOnline === false ? 'dot-crit' : 'dot-idle'}`} />
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>
              {backendOnline === null ? 'connecting' : backendOnline ? 'backend online' : 'backend offline'}
            </span>
          </div>
          <NotificationBell />
        </div>

        {/* User row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderTop: '1px dashed var(--rule-strong)' }}>
          <div style={{
            width: 22,
            height: 22,
            border: '1px solid var(--rule-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--fg-2)',
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.username ?? '—'}
            </div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {user?.role ?? '—'}
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              height: 22,
              width: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--fg-3)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--crit)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-3)')}
          >
            <Icon name="logout" size={11} />
          </button>
        </div>
      </div>
    </aside>

    {showNewProject && (
      <ProjectModal
        onClose={() => setShowNewProject(false)}
        onSave={handleCreateProject}
      />
    )}
    </>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const { generating, progress, done, dismissDone } = useAINarrative()
  const location = useLocation()
  const isOnReports = location.pathname === '/reports'
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { selectedProject } = useAppStore()
  const currentPage = location.pathname.replace(/^\//, '') || 'dashboard'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '?') { e.preventDefault(); setPaletteOpen(o => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    fetch('/api/v1/projects')
      .then(r => setBackendOnline(r.ok))
      .catch(() => setBackendOnline(false))
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', color: 'var(--fg)' }}>
      <Sidebar backendOnline={backendOnline} />

      {/* Right column: ticker + page content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Ticker backendOnline={backendOnline} />

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
          {selectedProject && (
            <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 10 }}>
              <ActiveUsers projectId={selectedProject.id} page={currentPage} />
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Outlet />
          </div>
        </main>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}

      {/* AI narrative orb */}
      {(generating || done) && !isOnReports && (
        <NavLink
          to="/reports"
          onClick={done ? dismissDone : undefined}
          title={done ? 'Narrative ready — click to view' : 'AI Narrative generating…'}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            width: 44,
            height: 44,
            background: 'rgba(10,5,20,0.92)',
            border: `1px solid ${done ? 'rgba(168,85,247,0.6)' : 'rgba(168,85,247,0.35)'}`,
            boxShadow: done
              ? '0 0 18px rgba(168,85,247,0.7), 0 0 36px rgba(168,85,247,0.3)'
              : '0 0 18px rgba(168,85,247,0.5)',
            animation: done ? 'seraph-orb-pulse 1.8s ease-in-out infinite' : undefined,
            textDecoration: 'none',
          }}
        >
          <svg width="44" height="44" viewBox="0 0 44 44" style={{ position: 'absolute', inset: 0 }}>
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(168,85,247,0.15)" strokeWidth="3" />
            {done ? (
              <circle cx="22" cy="22" r="18" fill="none" stroke="#a855f7" strokeWidth="3" strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 5px rgba(168,85,247,0.9))' }} />
            ) : progress !== null && progress >= 0 ? (
              <circle cx="22" cy="22" r="18" fill="none" stroke="#a855f7" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - progress / 100)}`}
                transform="rotate(-90 22 22)"
                style={{ filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.8))' }} />
            ) : (
              <circle cx="22" cy="22" r="18" fill="none" stroke="#a855f7" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 18 * 0.3} ${2 * Math.PI * 18 * 0.7}`}
                style={{ filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.8))', transformOrigin: '22px 22px', animation: 'spin 1s linear infinite' }} />
            )}
          </svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={done ? '#e9d5ff' : '#c084fc'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'relative', zIndex: 1 }}>
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-3.14Z"/>
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-3.14Z"/>
          </svg>
        </NavLink>
      )}
    </div>
  )
}
