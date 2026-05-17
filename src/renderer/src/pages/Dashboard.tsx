import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { getProjects, getStats, createProject, createTarget, deleteProject, type PlatformStats } from '@/api/client'
import ProjectModal from '@/components/ProjectModal'
import SparkLine from '@/components/SparkLine'
import Icon from '@/components/Icon'
import { getApiBase, getWsBase } from '@/lib/config'

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  right,
  children,
  style,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ border: '1px solid var(--rule)', background: 'var(--bg)', ...style }}>
      <div className="sec-h">
        <span className="title">{title}</span>
        {right && <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{right}</span>}
      </div>
      {children}
    </div>
  )
}

// ── KPI cell ──────────────────────────────────────────────────────────────────

function KPI({
  label,
  value,
  sub,
  accentVar,
  trend,
  divider,
}: {
  label: string
  value: number | string
  sub?: string
  accentVar?: string
  trend?: number[]
  divider?: boolean
}) {
  const color = accentVar ? `var(${accentVar})` : 'var(--fg)'
  return (
    <div style={{
      padding: '20px var(--pad) 18px',
      borderLeft: divider ? '1px solid var(--rule)' : 'none',
    }}>
      <div className="smcap">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
        <span className="mono tnum" style={{ fontSize: 44, fontWeight: 500, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {String(value).padStart(2, '0')}
        </span>
        {trend && trend.length > 1 && (
          <SparkLine values={trend} color={color} width={70} height={26} />
        )}
      </div>
      {sub && (
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Severity breakdown (stacked bar + microbars) ──────────────────────────────

function SeverityBreakdown({ counts }: { counts: Record<string, number> }) {
  const order = ['critical', 'high', 'medium', 'low', 'info'] as const
  const total = order.reduce((s, k) => s + (counts[k] || 0), 0)
  const bars = [
    { label: 'Critical', k: 'critical', color: 'var(--crit)' },
    { label: 'High',     k: 'high',     color: 'var(--high)' },
    { label: 'Medium',   k: 'medium',   color: 'var(--med)' },
    { label: 'Low',      k: 'low',      color: 'var(--low)' },
    { label: 'Info',     k: 'info',     color: 'var(--info)' },
  ]
  const max = Math.max(...bars.map(b => counts[b.k] || 0), 1)

  return (
    <Section title="SEVERITY · OPEN" right={<span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>n = {total}</span>}>
      <div style={{ padding: 'var(--pad)' }}>
        {/* Stacked bar */}
        <div style={{ display: 'flex', height: 8, marginBottom: 16 }}>
          {total === 0 ? (
            <div style={{ flex: 1, background: 'var(--rule-2)' }} />
          ) : bars.map(b => (
            <div key={b.k} style={{ flex: counts[b.k] || 0, background: b.color, opacity: counts[b.k] ? 1 : 0 }} />
          ))}
        </div>

        {/* Micro bars */}
        {bars.map(b => (
          <div key={b.k} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 32px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{b.label}</span>
            <div style={{ background: 'var(--rule-2)', height: 6 }}>
              <div style={{ height: '100%', width: `${((counts[b.k] || 0) / max) * 100}%`, background: b.color }} />
            </div>
            <span className="mono tnum" style={{ fontSize: 11, color: 'var(--fg-2)', textAlign: 'right' }}>{counts[b.k] || 0}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── Recent scans list ─────────────────────────────────────────────────────────

const SCAN_STATE: Record<string, { dot: string; label: string }> = {
  completed: { dot: 'dot-live', label: 'done' },
  running:   { dot: 'dot-warn', label: 'running' },
  pending:   { dot: 'dot-idle', label: 'pending' },
  failed:    { dot: 'dot-crit', label: 'failed' },
}

function RecentScans({ scans }: { scans: Array<{ id: string; scan_type: string; target: string; status: string; auto_probe?: boolean }> }) {
  const navigate = useNavigate()
  return (
    <Section
      title={`RECENT SCANS · ${scans.length}`}
      right={
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/scans')}>
          All scans <Icon name="arrow_r" size={9} />
        </button>
      }
    >
      {scans.length === 0 ? (
        <div style={{ padding: 'var(--pad)', color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          No scans yet.
        </div>
      ) : (
        <div>
          {scans.map((s, i) => {
            const st = SCAN_STATE[s.status] || SCAN_STATE.pending
            return (
              <div key={s.id} style={{
                display: 'grid',
                gridTemplateColumns: '8px 1fr auto',
                gap: 10,
                padding: '9px var(--pad)',
                borderBottom: i < scans.length - 1 ? '1px solid var(--rule)' : 'none',
                alignItems: 'center',
              }}>
                <span className={`dot ${st.dot}`} style={{ flexShrink: 0 }} />
                <div>
                  <div className="mono" style={{ fontSize: 11.5 }}>{s.scan_type}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 2 }}>{s.target}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {s.auto_probe && <Icon name="bolt" size={9} color="var(--accent)" />}
                  <span className="badge">{st.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

// ── Recent findings table ─────────────────────────────────────────────────────

const SEV_VAR: Record<string, string> = {
  critical: 'var(--crit)',
  high: 'var(--high)',
  medium: 'var(--med)',
  low: 'var(--low)',
  info: 'var(--info)',
}

function RecentFindings({ findings }: { findings: Array<{ id: string; title: string; severity: string; target: string; cve_id?: string }> }) {
  const navigate = useNavigate()
  return (
    <Section
      title="RECENT FINDINGS"
      right={
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/findings')}>
          View all <Icon name="arrow_r" size={9} />
        </button>
      }
    >
      {findings.length === 0 ? (
        <div style={{ padding: 'var(--pad)', color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          No findings yet.
        </div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 30 }}>SEV</th>
              <th>Title</th>
              <th style={{ width: 160 }}>Target</th>
              <th style={{ width: 100 }}>CVE</th>
            </tr>
          </thead>
          <tbody>
            {findings.map(f => (
              <tr key={f.id}>
                <td>
                  <span style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    background: SEV_VAR[f.severity] || 'var(--fg-4)',
                  }} />
                </td>
                <td style={{ fontWeight: 500 }}>{f.title}</td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>{f.target}</td>
                <td className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{f.cve_id || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

// ── Projects list ─────────────────────────────────────────────────────────────

function ProjectsList({
  onNew,
  onNavigate,
}: {
  onNew: () => void
  onNavigate: (id: string) => void
}) {
  const { projects, removeProject } = useAppStore()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    await deleteProject(id)
    removeProject(id)
    setConfirmDeleteId(null)
  }

  return (
    <Section
      title={`PROJECTS · ${projects.length}`}
      right={
        <button className="btn btn-sm btn-primary" onClick={onNew}>
          <Icon name="plus" size={9} color="#1a1408" /> New
        </button>
      }
    >
      {projects.length === 0 ? (
        <div style={{ padding: 'var(--pad)' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', marginBottom: 12 }}>
            No projects yet. Create one to begin.
          </p>
          <button className="btn btn-primary btn-sm" onClick={onNew}>
            <Icon name="plus" size={9} color="#1a1408" /> Create project
          </button>
        </div>
      ) : (
        <div>
          {projects.map((p, i) => (
            <div key={p.id} style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 12,
              padding: '10px var(--pad)',
              borderBottom: i < projects.length - 1 ? '1px solid var(--rule)' : 'none',
              alignItems: 'center',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </div>
                {p.description && p.description !== '__seraph_demo__' && (
                  <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.description}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>
                  {p.target_count} {p.target_count === 1 ? 'target' : 'targets'}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onNavigate(p.id)}
                  style={{ height: 20, padding: '0 8px', fontSize: 9 }}
                >
                  Pentest →
                </button>
                {confirmDeleteId === p.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--crit)' }}>Delete?</span>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)} style={{ height: 20, padding: '0 6px', fontSize: 9 }}>Yes</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)} style={{ height: 20, padding: '0 6px', fontSize: 9 }}>No</button>
                  </div>
                ) : (
                  <button
                    className="btn btn-ghost"
                    onClick={() => setConfirmDeleteId(p.id)}
                    title="Delete project"
                    style={{ padding: 4, height: 22, width: 22, justifyContent: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--crit)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-2)')}
                  >
                    <Icon name="trash" size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ── 14-day trend ──────────────────────────────────────────────────────────────

function TrendSection({ history }: { history: { days: string[]; pivot: Record<string, Record<string, number>> } }) {
  const sevs = ['critical', 'high', 'medium', 'low', 'info'] as const
  const colors: Record<string, string> = {
    critical: 'var(--crit)',
    high: 'var(--high)',
    medium: 'var(--med)',
    low: 'var(--low)',
    info: 'var(--info)',
  }

  return (
    <Section title="14-DAY FINDING TREND">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', padding: 'var(--pad)', gap: 16 }}>
        {sevs.map(sev => {
          const vals = history.days.map(d => history.pivot[d]?.[sev] ?? 0)
          const total = vals.reduce((a, b) => a + b, 0)
          return (
            <div key={sev}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: colors[sev] }}>
                  {sev}
                </span>
                <span className="mono tnum" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{total}</span>
              </div>
              <SparkLine values={vals} color={colors[sev]} width={120} height={32} />
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── Quick actions ─────────────────────────────────────────────────────────────

function QuickActions({ onNew }: { onNew: () => void }) {
  const navigate = useNavigate()
  const actions = [
    { label: 'New Project',    sub: 'Start a security assessment', icon: 'plus',   fn: onNew },
    { label: 'Pentest Workbench', sub: 'Launch pentest workflow', icon: 'swords',  fn: () => navigate('/pentest') },
    { label: 'Run Audit',      sub: 'CIS / NIST compliance',     icon: 'shield',  fn: () => navigate('/audit') },
    { label: 'AI Operator',    sub: 'Autonomous recon & exploit', icon: 'cube',    fn: () => navigate('/operator') },
  ]
  return (
    <Section title="QUICK ACTIONS">
      <div style={{ padding: 'var(--pad)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.fn}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: 'var(--bg-2)',
              border: '1px solid var(--rule)',
              color: 'var(--fg)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color .12s, background .12s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--accent-3)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--rule)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)' }}
          >
            <Icon name={a.icon} size={14} color="var(--accent)" />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 500 }}>{a.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-3)', marginTop: 2 }}>{a.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </Section>
  )
}

// ── Auto-probe toast ──────────────────────────────────────────────────────────

function ProbeToast({ visible, fading }: { visible: boolean; fading: boolean }) {
  if (!visible) return null
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 16px',
      background: 'var(--bg-2)',
      border: '1px solid var(--accent)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      transition: 'opacity 0.5s, transform 0.5s',
      opacity: fading ? 0 : 1,
      transform: fading ? 'translateY(8px)' : 'translateY(0)',
    }}>
      <span className="dot dot-warn" />
      <Icon name="bolt" size={12} color="var(--accent)" />
      <div>
        <div className="mono" style={{ fontSize: 11.5, fontWeight: 500 }}>Auto-probe running</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 2 }}>Background scan started on new target</div>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { projects, setProjects } = useAppStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [history, setHistory] = useState<{ days: string[]; pivot: Record<string, Record<string, number>> } | null>(null)
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [now, setNow] = useState(new Date())

  const [probeToast, setProbeToast] = useState(false)
  const [probeToastFading, setProbeToastFading] = useState(false)
  const wasProbing = useRef(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5000)
    return () => clearInterval(id)
  }, [])

  function showProbeToastFn() {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setProbeToast(true)
    setProbeToastFading(false)
    toastTimer.current = setTimeout(() => {
      setProbeToastFading(true)
      toastTimer.current = setTimeout(() => setProbeToast(false), 600)
    }, 4000)
  }

  function loadData() {
    getProjects().then(setProjects).catch(() => {})

    getStats().then(data => {
      setStats(data)
      const isProbing = data.recent_scans.some(s => s.auto_probe && (s.status === 'running' || s.status === 'pending'))
      if (isProbing && !wasProbing.current) showProbeToastFn()
      wasProbing.current = isProbing
    }).catch(() => {})

    fetch(`${getApiBase()}/stats/history`)
      .then(r => r.json())
      .then(setHistory)
      .catch(() => {})
  }

  useEffect(() => {
    loadData()
    let delay = 1000
    function connect() {
      const ws = new WebSocket(`${getWsBase()}/ws/events`)
      wsRef.current = ws
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'scan_update') { loadData(); delay = 1000 }
        } catch { /* ignore */ }
      }
      ws.onclose = () => {
        delay = Math.min(delay * 2, 30000)
        reconnectTimer.current = setTimeout(connect, delay)
      }
    }
    connect()
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [setProjects]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateProject(
    projectData: { name: string; description: string },
    targets: Array<{ hostname_or_ip: string; target_type: string; ports: string; notes: string }>,
    scope?: { include: string[]; exclude: string[] }
  ) {
    const project = await createProject({ name: projectData.name, description: projectData.description })
    if (scope && (scope.include.length > 0 || scope.exclude.length > 0)) {
      await fetch(`${getApiBase()}/projects/${project.id}/scope`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scope),
      })
    }
    for (const t of targets) {
      if (t.hostname_or_ip.trim()) {
        await createTarget(project.id, {
          hostname_or_ip: t.hostname_or_ip.trim(),
          target_type: t.target_type as any,
          ports: t.ports || undefined,
          notes: t.notes || undefined,
        })
      }
    }
    loadData()
  }

  const sev = stats?.severity_counts ?? {}

  // Build 14-day sparkline trends per severity
  const historyTrend = (key: string) =>
    history ? history.days.map(d => history.pivot[d]?.[key] ?? 0) : []

  const runningScans = stats?.recent_scans.filter(s => s.status === 'running' || s.status === 'pending').length ?? 0

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column' }}>
      {showProjectModal && (
        <ProjectModal
          onClose={() => setShowProjectModal(false)}
          onSave={handleCreateProject}
        />
      )}

      {/* Page header */}
      <div style={{ borderBottom: '1px solid var(--rule)', padding: '24px var(--pad) 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div className="smcap" style={{ marginBottom: 4 }}>
            {projects.length > 0 ? `${projects.length} project${projects.length > 1 ? 's' : ''} · ${stats?.targets ?? 0} targets` : 'workspace'}
          </div>
          <h1 className="mono" style={{ margin: 0, fontWeight: 500, fontSize: 22, letterSpacing: '-0.01em' }}>
            Operations Dashboard
          </h1>
          <div style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 6 }}>
            {stats?.recent_scans.some(s => s.status === 'running')
              ? `${runningScans} scan${runningScans > 1 ? 's' : ''} active · monitoring`
              : 'All systems nominal · monitoring'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.08em' }}>
            {now.toISOString().replace('T', ' ').slice(0, 19)} UTC
          </span>
          <button className="btn" onClick={loadData}>
            <Icon name="refresh" size={11} /> Resync
          </button>
          <button className="btn btn-primary" onClick={() => setShowProjectModal(true)}>
            <Icon name="plus" size={11} color="#1a1408" /> New project
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '1px solid var(--rule)' }}>
        <KPI label="Critical · open" value={sev.critical ?? 0} sub={`${sev.critical ?? 0} verified`} accentVar="--crit" trend={historyTrend('critical')} />
        <KPI label="High · open"     value={sev.high ?? 0}     sub="SLA 7d"                          accentVar="--high" trend={historyTrend('high')} divider />
        <KPI label="Total findings"  value={stats?.findings ?? 0} sub={`${sev.medium ?? 0} medium · ${sev.low ?? 0} low`} trend={historyTrend('medium')} divider />
        <KPI label="Active scans"    value={runningScans}      sub={`${stats?.scans ?? 0} total run`}  accentVar="--accent" divider />
        <KPI label="Projects"        value={stats?.projects ?? projects.length} sub={`${stats?.targets ?? 0} targets`} divider />
      </div>

      {/* Main 2-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', borderBottom: '1px solid var(--rule)', minHeight: 0 }}>
        {/* LEFT: projects + recent findings */}
        <div style={{ borderRight: '1px solid var(--rule)' }}>
          <ProjectsList onNew={() => setShowProjectModal(true)} onNavigate={() => navigate('/pentest')} />
          {stats?.recent_findings && stats.recent_findings.length > 0 && (
            <RecentFindings findings={stats.recent_findings} />
          )}
        </div>

        {/* RIGHT: severity breakdown + recent scans */}
        <div>
          <SeverityBreakdown counts={sev} />
          <RecentScans scans={stats?.recent_scans ?? []} />
        </div>
      </div>

      {/* Bottom: trend + quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr' }}>
        {history && history.days.length > 0 ? (
          <TrendSection history={history} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--pad)', borderRight: '1px solid var(--rule)' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-4)' }}>No trend data yet</span>
          </div>
        )}
        <div style={{ borderLeft: '1px solid var(--rule)' }}>
          <QuickActions onNew={() => setShowProjectModal(true)} />
        </div>
      </div>

      <ProbeToast visible={probeToast} fading={probeToastFading} />
    </div>
  )
}
