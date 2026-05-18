import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import Icon from '../components/Icon'
import type { Project } from '../types/index'
import { getApiBase } from '@/lib/config'

interface WatchedService {
  id: string
  target_id: string
  service_term: string
  last_checked: string | null
  known_cves: string[]
  created_at: string
}

interface Target {
  id: string
  hostname_or_ip: string
  project_id: string
}

interface CveFinding {
  id: string
  severity: string
  title: string
  description: string
  cve_id: string | null
  created_at: string
}

const SEV_STYLE: Record<string, { color: string; background: string; border: string }> = {
  critical: { color: 'var(--crit)',   background: 'rgba(232,64,64,0.08)',  border: '1px solid rgba(232,64,64,0.3)' },
  high:     { color: '#f97316',       background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)' },
  medium:   { color: 'var(--accent)', background: 'rgba(240,168,58,0.08)', border: '1px solid rgba(240,168,58,0.3)' },
  low:      { color: 'var(--ok)',     background: 'rgba(84,175,97,0.08)',  border: '1px solid rgba(84,175,97,0.3)' },
  info:     { color: '#60a5fa',       background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)' },
}

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

export default function CveWatch() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [targets, setTargets] = useState<Target[]>([])
  const [watchedServices, setWatchedServices] = useState<Record<string, WatchedService[]>>({})
  const [cveFindings, setCveFindings] = useState<CveFinding[]>([])
  const [expandedTarget, setExpandedTarget] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`${getApiBase()}/projects`).then(r => r.json()).then(data => {
      setProjects(data)
      if (data.length > 0) setSelectedProject(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (selectedProject) loadData()
  }, [selectedProject])

  async function loadData() {
    setLoading(true)
    try {
      const [targetsRes, wsRes, findingsRes] = await Promise.all([
        fetch(`${getApiBase()}/projects/${selectedProject}/targets`),
        fetch(`${getApiBase()}/cve-watch?project_id=${selectedProject}`),
        fetch(`${getApiBase()}/findings?project_id=${selectedProject}`),
      ])

      const targetsData: Target[] = targetsRes.ok ? await targetsRes.json() : []
      setTargets(targetsData)

      const wsData: WatchedService[] = wsRes.ok ? await wsRes.json() : []
      const grouped: Record<string, WatchedService[]> = {}
      for (const ws of wsData) {
        if (!grouped[ws.target_id]) grouped[ws.target_id] = []
        grouped[ws.target_id].push(ws)
      }
      setWatchedServices(grouped)

      const findingsData: CveFinding[] = findingsRes.ok ? (await findingsRes.json()).filter((f: CveFinding) => f.cve_id) : []
      setCveFindings(findingsData)
    } finally {
      setLoading(false)
    }
  }

  const totalServices = Object.values(watchedServices).flat().length
  const totalCves = Object.values(watchedServices).flat().reduce((acc, ws) => acc + ws.known_cves.length, 0)

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg)', color: 'var(--fg)', minHeight: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)' }}>
            <Icon name="shield" size={18} color="var(--accent)" />
            CVE Watchlist
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
            Services discovered via auto-probe are watched for new CVEs daily.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 4, background: 'var(--bg-2)', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)' }}
        >
          <Icon name="refresh" size={12} color={loading ? 'var(--accent)' : 'currentColor'} />
          Refresh
        </button>
      </div>

      {/* Project selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>Project</label>
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 3, padding: '5px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none' }}
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 120px)', gap: 12 }}>
        {[
          { label: 'Targets', value: targets.length, color: 'var(--fg)' },
          { label: 'Watched Services', value: totalServices, color: 'var(--fg)' },
          { label: 'Known CVEs', value: totalCves, color: totalCves > 0 ? 'var(--accent)' : 'var(--fg)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: '12px 14px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: s.color }}>{s.value}</p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Target list */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
          <Icon name="refresh" size={24} color="var(--accent)" />
        </div>
      ) : targets.length === 0 ? (
        <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: '48px 24px', textAlign: 'center', maxWidth: 640 }}>
          <Icon name="shield" size={40} color="var(--rule-strong)" />
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
            No targets in this project. Add a target with Auto-Probe enabled to start watching for CVEs.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720 }}>
          {targets.map(target => {
            const services = watchedServices[target.id] || []
            const expanded = expandedTarget === target.id
            const cveCount = services.reduce((acc, ws) => acc + ws.known_cves.length, 0)

            return (
              <div key={target.id} style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, overflow: 'hidden' }}>
                <button
                  onClick={() => setExpandedTarget(expanded ? null : target.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <Icon name={expanded ? 'chev_d' : 'chev_r'} size={13} color="var(--fg-3)" />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>{target.hostname_or_ip}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {services.length > 0 && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', color: '#60a5fa', fontFamily: 'var(--font-sans)' }}>
                        {services.length} service{services.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {cveCount > 0 && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(240,168,58,0.08)', border: '1px solid rgba(240,168,58,0.25)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)' }}>
                        <AlertTriangle size={9} /> {cveCount} CVE{cveCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {services.length === 0 && (
                      <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>No services detected yet</span>
                    )}
                  </div>
                </button>

                {expanded && services.length > 0 && (
                  <div style={{ borderTop: rule }}>
                    {services.map((ws, i) => (
                      <div key={ws.id} style={{ padding: '10px 16px', borderBottom: i < services.length - 1 ? rule : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{ws.service_term}</span>
                          {ws.last_checked && (
                            <span style={{ fontSize: 10, color: 'var(--fg-3)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)' }}>
                              <Icon name="clock" size={9} color="currentColor" /> {new Date(ws.last_checked).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {ws.known_cves.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {ws.known_cves.map(cve => (
                              <a
                                key={cve}
                                href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'rgba(240,168,58,0.08)', border: '1px solid rgba(240,168,58,0.25)', color: 'var(--accent)', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}
                              >
                                {cve}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>No CVEs found yet — will check nightly.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {expanded && services.length === 0 && (
                  <div style={{ padding: '10px 16px', borderTop: rule }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
                      Enable Auto-Probe to automatically discover and watch services on this target.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* CVE Findings from this project */}
      {cveFindings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)' }}>
            <Icon name="eye" size={13} color="var(--accent)" />
            CVE Findings ({cveFindings.length})
          </h2>
          <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, overflow: 'hidden' }}>
            {cveFindings.map((f, i) => {
              const ss = SEV_STYLE[f.severity] ?? SEV_STYLE.info
              return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: i < cveFindings.length - 1 ? rule : 'none' }}>
                  <span style={{ flexShrink: 0, fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 700, textTransform: 'uppercase', fontFamily: 'var(--font-sans)', color: ss.color, background: ss.background, border: ss.border }}>
                    {f.severity}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>{f.title}</p>
                    {f.cve_id && (
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${f.cve_id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}
                      >
                        {f.cve_id}
                      </a>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--fg-3)', flexShrink: 0, fontFamily: 'var(--font-sans)' }}>
                    {new Date(f.created_at).toLocaleDateString()}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
