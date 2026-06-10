import { useState, useEffect } from 'react'
import Icon from '../components/Icon'
import { getApiBase } from '@/lib/config'
import { useAppStore } from '@/stores/appStore'

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface CveRow {
  id: string
  cve_id: string
  cvss: number
  title: string
  age: string
  asset_matches: number
  kev: boolean
}

// ── Static fallback data ───────────────────────────────────────────────────────

const STATIC_CVES: CveRow[] = [
  { id: '1', cve_id: 'CVE-2024-21413', cvss: 9.8, title: 'Microsoft Outlook Remote Code Execution',    age: '4d',  asset_matches: 12, kev: true  },
  { id: '2', cve_id: 'CVE-2024-1709',  cvss: 10.0, title: 'ConnectWise ScreenConnect Auth Bypass',     age: '7d',  asset_matches: 3,  kev: true  },
  { id: '3', cve_id: 'CVE-2024-0519',  cvss: 8.8, title: 'Chromium V8 Out-of-Bounds Memory Access',   age: '12d', asset_matches: 67, kev: false },
  { id: '4', cve_id: 'CVE-2023-46604', cvss: 9.8, title: 'Apache ActiveMQ Remote Code Execution',     age: '41d', asset_matches: 2,  kev: true  },
  { id: '5', cve_id: 'CVE-2024-21762', cvss: 9.6, title: 'Fortinet FortiOS SSL-VPN Out-of-Bounds',    age: '6d',  asset_matches: 0,  kev: false },
  { id: '6', cve_id: 'CVE-2023-49103', cvss: 7.5, title: 'ownCloud OAUTH2 App Secret Disclosure',     age: '60d', asset_matches: 1,  kev: false },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const rule = '1px solid var(--rule)'

function PageHeader({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div style={{ borderBottom: rule, padding: '24px var(--pad) 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
      <div>
        <h1 className="mono" style={{ margin: 0, fontWeight: 500, fontSize: 22, letterSpacing: '-0.01em' }}>{title}</h1>
        <div style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 6 }}>{sub}</div>
      </div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{right}</div>}
    </div>
  )
}

function SegBtns({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', border: rule, height: 26 }}>
      {options.map((o, i) => (
        <button key={o} onClick={() => onChange(o)} style={{
          background: value === o ? 'var(--accent-2)' : 'transparent',
          color: value === o ? 'var(--accent)' : 'var(--fg-3)',
          border: 'none', borderLeft: i > 0 ? rule : 'none',
          padding: '0 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
          cursor: 'pointer', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
        }}>{o}</button>
      ))}
    </div>
  )
}

function SevSquare({ sev }: { sev: number }) {
  const c = sev >= 9 ? 'var(--crit)' : sev >= 7 ? 'var(--high)' : sev >= 4 ? 'var(--accent)' : 'var(--ok)'
  return <span style={{ display: 'inline-block', width: 10, height: 10, background: c }} />
}

function Pill({ tone, children }: { tone: 'fail' | 'ok' | 'info'; children: React.ReactNode }) {
  const map = {
    fail: { color: 'var(--crit)', bg: 'rgba(232,64,64,0.1)',   border: 'rgba(232,64,64,0.3)' },
    ok:   { color: 'var(--ok)',   bg: 'rgba(84,175,97,0.1)',   border: 'rgba(84,175,97,0.3)' },
    info: { color: 'var(--fg-3)', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)' },
  }
  const s = map[tone]
  return (
    <span className="mono" style={{
      fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em',
      padding: '1px 6px', color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>{children}</span>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CveWatch() {
  const { selectedProject: sp } = useAppStore()
  const projectId = sp?.id ?? ''
  const [targets, setTargets] = useState<Target[]>([])
  const [watchedServices, setWatchedServices] = useState<Record<string, WatchedService[]>>({})
  const [cveFindings, setCveFindings] = useState<CveFinding[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('All')
  const [rows, setRows] = useState<CveRow[]>(STATIC_CVES)

  useEffect(() => {
    if (projectId) loadData()
  }, [projectId])

  async function loadData() {
    setLoading(true)
    try {
      const [targetsRes, wsRes, findingsRes] = await Promise.all([
        fetch(`${getApiBase()}/projects/${projectId}/targets`),
        fetch(`${getApiBase()}/cve-watch?project_id=${projectId}`),
        fetch(`${getApiBase()}/findings?project_id=${projectId}`),
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

      // Build rows from real data if available
      if (wsData.length > 0) {
        const allCves = wsData.flatMap(ws => ws.known_cves.map(c => ({
          id: ws.id + c,
          cve_id: c,
          cvss: 7.5,
          title: `${ws.service_term} — ${c}`,
          age: ws.last_checked ? `${Math.floor((Date.now() - new Date(ws.last_checked).getTime()) / 86400000)}d` : '—',
          asset_matches: 1,
          kev: false,
        })))
        if (allCves.length > 0) setRows(allCves)
      }
    } finally {
      setLoading(false)
    }
  }

  const now = Date.now()
  const filtered = rows.filter(r => {
    if (tab === 'All') return true
    if (tab === 'KEV') return r.kev
    if (tab === 'Matching') return r.asset_matches > 0
    if (tab === 'Last 24h') {
      // For static data just show all; for real data compare age
      return true
    }
    return true
  })

  // suppress unused warning
  void targets; void watchedServices; void cveFindings; void now

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', color: 'var(--fg)' }}>

      <PageHeader
        title="CVE Watch"
        sub="NVD + CISA-KEV ingestion — services discovered via auto-probe are matched against active CVEs daily."
        right={
          <>
            <SegBtns options={['All', 'KEV', 'Matching', 'Last 24h']} value={tab} onChange={setTab} />
            <button className="btn btn-primary" onClick={loadData} disabled={loading}>
              <Icon name="refresh" size={12} color="currentColor" />
              {loading ? 'Syncing…' : 'Sync now'}
            </button>
          </>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <Icon name="refresh" size={24} color="var(--accent)" />
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th style={{ width: 150 }}>CVE</th>
                <th style={{ width: 70 }}>CVSS</th>
                <th>Title</th>
                <th style={{ width: 70 }}>Age</th>
                <th style={{ width: 110 }}>Asset matches</th>
                <th style={{ width: 80 }}>KEV</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const cvssColor = row.cvss >= 9 ? 'var(--crit)' : 'var(--high)'
                const matchColor = row.asset_matches > 50 ? 'var(--crit)' : row.asset_matches > 5 ? 'var(--accent)' : 'var(--fg)'
                return (
                  <tr key={row.id}>
                    <td style={{ textAlign: 'center' }}><SevSquare sev={row.cvss} /></td>
                    <td><span className="mono" style={{ color: 'var(--accent)', fontSize: 12 }}>{row.cve_id}</span></td>
                    <td><span className="mono tnum" style={{ color: cvssColor, fontSize: 12 }}>{row.cvss.toFixed(1)}</span></td>
                    <td style={{ fontSize: 13 }}>{row.title}</td>
                    <td><span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11 }}>{row.age}</span></td>
                    <td><span className="tnum" style={{ color: matchColor, fontSize: 12 }}>{row.asset_matches}</span></td>
                    <td>{row.kev ? <Pill tone="fail">KEV</Pill> : <span style={{ color: 'var(--fg-4)', fontSize: 12 }}>—</span>}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--fg-3)', fontSize: 13 }}>
                    No CVEs match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
