import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Icon from '../components/Icon'
import { useAppStore } from '@/stores/appStore'
import type { Project } from '@/types'
import { getApiBase } from '@/lib/config'

interface TimelineEvent {
  id: string
  kind: 'project' | 'target' | 'scan_start' | 'scan_end' | 'finding'
  title: string
  target: string | null
  severity: string | null
  status: string | null
  ts: string
}

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--crit)',
  high:     '#f97316',
  medium:   'var(--accent)',
  low:      'var(--ok)',
  info:     'var(--med)',
}

const SEV_BG: Record<string, string> = {
  critical: 'rgba(232,64,64,0.1)',
  high:     'rgba(249,115,22,0.1)',
  medium:   'rgba(240,168,58,0.1)',
  low:      'rgba(84,175,97,0.1)',
  info:     'rgba(240,168,58,0.06)',
}

const STATUS_COLORS: Record<string, { color: string; background: string; border: string }> = {
  completed: { color: 'var(--ok)',     background: 'rgba(84,175,97,0.08)',  border: '1px solid rgba(84,175,97,0.3)' },
  running:   { color: 'var(--accent)', background: 'rgba(240,168,58,0.08)', border: '1px solid rgba(240,168,58,0.3)' },
  pending:   { color: 'var(--fg-3)',   background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.2)' },
  failed:    { color: 'var(--crit)',   background: 'rgba(232,64,64,0.08)',  border: '1px solid rgba(232,64,64,0.3)' },
}

function kindIcon(kind: TimelineEvent['kind']) {
  switch (kind) {
    case 'project':    return <Icon name="folder" size={13} color="var(--fg-2)" />
    case 'target':     return <Icon name="target" size={13} color="#8b5cf6" />
    case 'scan_start': return <Icon name="activity" size={13} color="var(--accent)" />
    case 'scan_end':   return <Icon name="check" size={13} color="var(--ok)" />
    case 'finding':    return <AlertTriangle size={13} color="var(--accent)" />
  }
}

function kindDotColor(kind: TimelineEvent['kind']): string {
  switch (kind) {
    case 'project':    return 'var(--fg-2)'
    case 'target':     return '#8b5cf6'
    case 'scan_start': return 'var(--accent)'
    case 'scan_end':   return 'var(--ok)'
    case 'finding':    return 'var(--accent)'
  }
}

function fmt(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type KindFilter = TimelineEvent['kind'] | 'all'
const KIND_FILTERS: { label: string; value: KindFilter }[] = [
  { label: 'All',      value: 'all' },
  { label: 'Projects', value: 'project' },
  { label: 'Targets',  value: 'target' },
  { label: 'Scans',    value: 'scan_end' },
  { label: 'Findings', value: 'finding' },
]

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

export default function Timeline() {
  const { selectedProject, setSelectedProject } = useAppStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [localProjectId, setLocalProjectId] = useState<string>(selectedProject?.id ?? '')
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<string>('all')

  useEffect(() => {
    fetch(`${getApiBase()}/projects`)
      .then(r => r.json())
      .then((data: Project[]) => {
        setProjects(data)
        if (!localProjectId && data.length > 0) setLocalProjectId(data[0].id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedProject?.id && selectedProject.id !== localProjectId) {
      setLocalProjectId(selectedProject.id)
    }
  }, [selectedProject?.id])

  function handleProjectChange(id: string) {
    setLocalProjectId(id)
    const proj = projects.find(p => p.id === id)
    if (proj) setSelectedProject(proj)
  }

  const activeProjectId = localProjectId || selectedProject?.id || ''
  const activeProjectName = projects.find(p => p.id === activeProjectId)?.name ?? selectedProject?.name ?? ''

  async function load(projectId: string) {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${getApiBase()}/projects/${projectId}/timeline`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: TimelineEvent[] = await res.json()
      setEvents([...data].reverse())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load timeline')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (activeProjectId) load(activeProjectId)
    else setEvents([])
  }, [activeProjectId])

  const filtered = events.filter(e => {
    const kindOk = kindFilter === 'all'
      || e.kind === kindFilter
      || (kindFilter === 'scan_end' && (e.kind === 'scan_start' || e.kind === 'scan_end'))
    const sevOk = severityFilter === 'all' || e.severity === severityFilter
    return kindOk && sevOk
  })

  const findingCount = events.filter(e => e.kind === 'finding').length
  const scanCount = events.filter(e => e.kind === 'scan_end').length
  const targetCount = events.filter(e => e.kind === 'target').length
  const criticalCount = events.filter(e => e.severity === 'critical').length

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg)', color: 'var(--fg)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Engagement Timeline</h1>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
            {activeProjectName || 'Select a project'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={localProjectId}
            onChange={e => handleProjectChange(e.target.value)}
            style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 3, padding: '5px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none' }}
          >
            {projects.length === 0 && <option value="">No projects</option>}
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {activeProjectId && (
            <button
              onClick={() => load(activeProjectId)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 4, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            >
              <Icon name="refresh" size={12} color="currentColor" /> Refresh
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {activeProjectId && events.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Targets', value: targetCount, color: '#8b5cf6' },
            { label: 'Scans run', value: scanCount, color: 'var(--med)' },
            { label: 'Findings', value: findingCount, color: 'var(--accent)' },
            { label: 'Critical', value: criticalCount, color: 'var(--crit)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2, fontFamily: 'var(--font-sans)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {events.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Icon name="filter" size={12} color="var(--fg-3)" />
          <div style={{ display: 'flex', gap: 4 }}>
            {KIND_FILTERS.map(f => {
              const isActive = kindFilter === f.value
              return (
                <button
                  key={f.value}
                  onClick={() => setKindFilter(f.value)}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'var(--font-sans)', background: isActive ? 'rgba(240,168,58,0.12)' : 'none', color: isActive ? 'var(--accent)' : 'var(--fg-3)', border: isActive ? '1px solid rgba(240,168,58,0.3)' : ruleStrong }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
            {['all', 'critical', 'high', 'medium', 'low'].map(sev => {
              const isActive = severityFilter === sev
              const sc = sev !== 'all' ? SEV_COLOR[sev] : 'var(--accent)'
              return (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 3, cursor: 'pointer', textTransform: 'capitalize', fontFamily: 'var(--font-sans)', background: isActive ? (sev === 'all' ? 'rgba(240,168,58,0.12)' : `${sc}22`) : 'none', color: isActive ? (sev === 'all' ? 'var(--accent)' : sc) : 'var(--fg-3)', border: isActive ? (sev === 'all' ? '1px solid rgba(240,168,58,0.3)' : `1px solid ${sc}55`) : ruleStrong }}
                >
                  {sev === 'all' ? 'All sev.' : sev}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* States */}
      {!activeProjectId && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--fg-3)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
          Select a project above to view its timeline.
        </div>
      )}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <Icon name="refresh" size={24} color="var(--accent)" />
        </div>
      )}
      {error && (
        <div style={{ background: 'rgba(232,64,64,0.08)', border: '1px solid rgba(232,64,64,0.3)', borderRadius: 3, color: 'var(--crit)', padding: '10px 14px', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 && activeProjectId && !error && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--fg-3)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
          No events match the current filters.
        </div>
      )}

      {/* Timeline */}
      {!loading && filtered.length > 0 && (
        <div style={{ position: 'relative' }}>
          {/* Vertical line */}
          <div style={{ position: 'absolute', left: 19, top: 0, bottom: 0, width: 1, background: 'var(--rule)' }} />

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map(event => {
              const dotColor = kindDotColor(event.kind)
              const statusSty = event.status ? STATUS_COLORS[event.status] : null
              return (
                <div key={event.id} style={{ position: 'relative', display: 'flex', gap: 14 }}>
                  {/* Dot */}
                  <div style={{ position: 'relative', zIndex: 1, flexShrink: 0, width: 38, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, boxShadow: `0 0 8px ${dotColor}80`, border: '2px solid var(--bg)' }} />
                  </div>

                  {/* Card */}
                  <div style={{ flex: 1, marginBottom: 10, background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        {kindIcon(event.kind)}
                        <span style={{ fontSize: 13, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>{event.title}</span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--fg-3)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{fmt(event.ts)}</span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      {event.target && (
                        <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>{event.target}</span>
                      )}
                      {event.severity && (
                        <span style={{
                          fontSize: 10, padding: '1px 7px', borderRadius: 10, fontFamily: 'var(--font-sans)', fontWeight: 600,
                          color: SEV_COLOR[event.severity] ?? 'var(--fg-3)',
                          background: SEV_BG[event.severity] ?? 'rgba(100,116,139,0.08)',
                          border: `1px solid ${SEV_COLOR[event.severity] ?? 'var(--fg-3)'}40`,
                        }}>
                          {event.severity}
                        </span>
                      )}
                      {event.status && statusSty && (
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, fontFamily: 'var(--font-sans)', color: statusSty.color, background: statusSty.background, border: statusSty.border }}>
                          {event.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
