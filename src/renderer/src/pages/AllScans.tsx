import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getApiBase } from '@/lib/config'
import {
  ArrowLeft, Zap, Search, GitCompare, X, Plus, Minus, Equal,
  Terminal as TerminalIcon, Loader, Cpu, Trash2, Ban,
} from 'lucide-react'

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

interface ScanRow {
  id: string
  scan_type: string
  status: string
  target: string
  target_id: string | null
  project: string
  project_id: string | null
  finding_count: number
  auto_probe: boolean
  started_at: string | null
  completed_at: string | null
  created_at: string | null
}

interface ScanDetail extends ScanRow {
  raw_output: string | null
  config_json: string | null
}

interface DiffFinding {
  id: string
  severity: string
  title: string
  description: string
  cve_id: string | null
  cvss_score: string | null
}

interface DiffResult {
  scan_a: string
  scan_b: string
  new: DiffFinding[]
  resolved: DiffFinding[]
  unchanged: DiffFinding[]
}

const STATUS_COLORS: Record<string, string> = {
  completed:  '#22c55e',
  running:    'var(--accent)',
  pending:    '#64748b',
  failed:     '#ef4444',
  cancelled:  '#f59e0b',
}

const STATUS_STYLES: Record<string, { color: string; background: string; border: string }> = {
  completed: { color: 'var(--ok)',     background: 'rgba(84,175,97,0.08)',   border: '1px solid rgba(84,175,97,0.3)' },
  running:   { color: 'var(--accent)',  background: 'rgba(240,168,58,0.08)', border: '1px solid rgba(240,168,58,0.3)' },
  pending:   { color: 'var(--fg-3)',   background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.2)' },
  failed:    { color: 'var(--crit)',   background: 'rgba(232,64,64,0.08)',   border: '1px solid rgba(232,64,64,0.3)' },
  cancelled: { color: 'var(--accent)', background: 'rgba(240,168,58,0.08)', border: '1px solid rgba(240,168,58,0.3)' },
}

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--crit)', high: '#f97316', medium: 'var(--accent)', low: 'var(--ok)', info: 'var(--med)',
}
const SEV_BG: Record<string, string> = {
  critical: 'rgba(232,64,64,0.1)', high: 'rgba(249,115,22,0.1)', medium: 'rgba(240,168,58,0.1)',
  low: 'rgba(84,175,97,0.1)', info: 'rgba(180,140,60,0.1)',
}

const STATUSES = ['all', 'completed', 'running', 'pending', 'failed']

export default function AllScans() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [scans, setScans] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? 'all')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [selected, setSelected] = useState<string[]>([])
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState('')

  // Log drawer
  const [drawerScan, setDrawerScan] = useState<ScanDetail | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [parseLoading, setParseLoading] = useState(false)
  const [parseMsg, setParseMsg] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  function updateFilter(status: string, q: string) {
    const params: Record<string, string> = {}
    if (status !== 'all') params.status = status
    if (q) params.q = q
    setSearchParams(params, { replace: true })
  }

  const openParam = searchParams.get('open')

  useEffect(() => {
    fetch(`${getApiBase()}/scans`)
      .then(r => r.json())
      .then((data: ScanRow[]) => {
        setScans(data)
        // Auto-open drawer if ?open=<scan_id> was passed (e.g. from a notification)
        if (openParam) {
          const target = data.find(s => s.id === openParam)
          if (target) openDrawer(target)
          // Remove the param from the URL so back/refresh doesn't re-open
          setSearchParams(prev => { prev.delete('open'); return prev }, { replace: true })
        }
      })
      .finally(() => setLoading(false))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = scans.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return s.target.toLowerCase().includes(q) || s.project.toLowerCase().includes(q) || s.scan_type.toLowerCase().includes(q)
    }
    return true
  })

  function toggleSelect(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
    setDiff(null)
    setDiffError('')
  }

  function parseFindings(scanId: string) {
    setParseLoading(true)
    setParseMsg('')
    fetch(`${getApiBase()}/audit/scans/${scanId}/parse`, { method: 'POST' })
      .then(r => r.json())
      .then(d => setParseMsg(`${d.parsed ?? 0} findings parsed`))
      .catch(() => setParseMsg('Parse failed'))
      .finally(() => setParseLoading(false))
  }

  async function cancelScan(scanId: string) {
    setCancelLoading(true)
    try {
      const res = await fetch(`${getApiBase()}/scans/${scanId}/cancel`, { method: 'POST' })
      if (res.ok) {
        setScans(prev => prev.map(s => s.id === scanId ? { ...s, status: 'cancelled' } : s))
        setDrawerScan(prev => prev?.id === scanId ? { ...prev, status: 'cancelled' } : prev)
      }
    } finally {
      setCancelLoading(false)
    }
  }

  async function deleteScan(scanId: string) {
    setDeleteLoading(true)
    try {
      const res = await fetch(`${getApiBase()}/scans/${scanId}`, { method: 'DELETE' })
      if (res.ok) {
        setScans(prev => prev.filter(s => s.id !== scanId))
        setDrawerScan(null)
      }
    } finally {
      setDeleteLoading(false)
    }
  }

  function openDrawer(scan: ScanRow) {
    setParseMsg('')
    setDrawerLoading(true)
    setDrawerScan({ ...scan, raw_output: null, config_json: null })
    fetch(`${getApiBase()}/audit/scans/${scan.id}`)
      .then(r => r.json())
      .then(data => setDrawerScan({ ...scan, raw_output: data.raw_output ?? null, config_json: data.config_json ?? null }))
      .catch(() => setDrawerScan(prev => prev ? { ...prev, raw_output: 'Failed to load output.' } : null))
      .finally(() => setDrawerLoading(false))
  }

  function runDiff() {
    if (selected.length !== 2) return
    setDiffLoading(true)
    setDiffError('')
    fetch(`${getApiBase()}/scans/diff?a=${selected[0]}&b=${selected[1]}`)
      .then(r => r.ok ? r.json() : r.json().then((e: {detail: string}) => Promise.reject(e.detail)))
      .then(setDiff)
      .catch(e => setDiffError(String(e)))
      .finally(() => setDiffLoading(false))
  }

  const scanName = (id: string) => {
    const s = scans.find(x => x.id === id)
    return s ? `${s.scan_type} @ ${s.target}` : id.slice(0, 8)
  }

  const badgeStyle = (status: string): React.CSSProperties => {
    const ss = STATUS_STYLES[status] ?? STATUS_STYLES.pending
    return { fontSize: 10, padding: '1px 7px', borderRadius: 10, fontFamily: 'var(--font-sans)', color: ss.color, background: ss.background, border: ss.border }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', border: ruleStrong, borderRadius: 4,
    color: 'var(--fg)', fontFamily: 'var(--font-sans)', fontSize: 13,
    padding: '6px 12px 6px 30px', outline: 'none', width: 256,
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Main content */}
      <div style={{ flex: 1, padding: 32, display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto', transition: 'margin-right 0.2s', marginRight: drawerScan ? 480 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-2)', padding: 0 }}>
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>All Scans</h1>
            <p style={{ color: 'var(--fg-2)', fontSize: 13, marginTop: 2 }}>{scans.length} total scans across all projects</p>
          </div>
          {/* Diff controls */}
          {selected.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>{selected.length}/2 selected</span>
              {selected.length === 2 && (
                <button
                  onClick={runDiff}
                  disabled={diffLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: 'rgba(240,168,58,0.1)', color: 'var(--accent)', border: '1px solid rgba(240,168,58,0.3)', cursor: diffLoading ? 'not-allowed' : 'pointer', opacity: diffLoading ? 0.5 : 1 }}
                >
                  <GitCompare size={13} />
                  {diffLoading ? 'Comparing…' : 'Diff Scans'}
                </button>
              )}
              <button onClick={() => { setSelected([]); setDiff(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0 }}>
                <X size={15} />
              </button>
            </div>
          )}
        </div>

        {/* Selection hint */}
        {selected.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--fg-4)', marginTop: -12 }}>
            Click a row to view its output · check the box on two rows to <strong style={{ color: 'var(--fg-3)' }}>Diff Scans</strong>
          </p>
        )}

        {/* Diff result panel */}
        {diff && (
          <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: rule }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GitCompare size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scan Diff</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11 }}>
                <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>{scanName(diff.scan_a)}</span>
                <span style={{ color: 'var(--fg-4)' }}>→</span>
                <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>{scanName(diff.scan_b)}</span>
              </div>
              <button onClick={() => setDiff(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0 }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: rule }}>
              <DiffBucket label="New" icon={<Plus size={12} />} color="var(--crit)" findings={diff.new} />
              <div style={{ borderLeft: rule, borderRight: rule }}>
                <DiffBucket label="Resolved" icon={<Minus size={12} />} color="var(--ok)" findings={diff.resolved} />
              </div>
              <DiffBucket label="Unchanged" icon={<Equal size={12} />} color="var(--fg-3)" findings={diff.unchanged} />
            </div>
          </div>
        )}

        {diffError && (
          <div style={{ padding: '8px 16px', borderRadius: 4, background: 'rgba(232,64,64,0.08)', border: '1px solid rgba(232,64,64,0.3)', fontSize: 11, color: 'var(--crit)' }}>{diffError}</div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)' }} />
            <input
              type="text"
              placeholder="Search target, project, type…"
              value={search}
              onChange={e => { setSearch(e.target.value); updateFilter(statusFilter, e.target.value) }}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 4 }}>
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); updateFilter(s, search) }}
                style={{
                  padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 500,
                  textTransform: 'capitalize', border: 'none', cursor: 'pointer',
                  background: statusFilter === s ? 'rgba(240,168,58,0.1)' : 'none',
                  color: statusFilter === s ? 'var(--accent)' : 'var(--fg-3)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{filtered.length} shown</span>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: 'var(--fg-3)', fontSize: 13 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: 'var(--fg-3)', fontSize: 13 }}>No scans match the current filter.</div>
          ) : (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: rule, textAlign: 'left' }}>
                  <th style={{ padding: '12px 12px', width: 32 }} />
                  <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Type</th>
                  <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Target</th>
                  <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Project</th>
                  <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</th>
                  <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Findings</th>
                  <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, idx) => {
                  const isSelected = selected.includes(s.id)
                  const selIdx = selected.indexOf(s.id)
                  const isOpen = drawerScan?.id === s.id
                  return (
                    <tr
                      key={s.id}
                      onClick={() => openDrawer(s)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: idx < filtered.length - 1 ? rule : 'none',
                        background: isOpen ? 'rgba(240,168,58,0.06)' : isSelected ? 'rgba(240,168,58,0.04)' : 'none',
                      }}
                    >
                      <td style={{ padding: '12px' }} onClick={e => toggleSelect(e, s.id)}>
                        <div style={{
                          width: 20, height: 20, borderRadius: 4, border: isSelected ? '1px solid var(--accent)' : ruleStrong,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          background: isSelected ? 'rgba(240,168,58,0.2)' : 'none',
                          color: isSelected ? 'var(--accent)' : 'transparent',
                        }}>
                          {isSelected ? selIdx + 1 : ''}
                        </div>
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 4, height: 20, borderRadius: 2, flexShrink: 0, backgroundColor: STATUS_COLORS[s.status] || STATUS_COLORS.pending }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>{s.scan_type}</span>
                          {s.auto_probe && <Zap size={11} style={{ color: 'var(--ok)', flexShrink: 0 }} />}
                        </div>
                      </td>
                      <td style={{ padding: '12px 20px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>{s.target}</td>
                      <td style={{ padding: '12px 20px', fontSize: 11, color: 'var(--fg-3)' }}>{s.project}</td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={badgeStyle(s.status)}>{s.status}</span>
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                        {s.finding_count > 0 ? (
                          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{s.finding_count}</span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--fg-4)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 20px', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
                        {s.started_at ? new Date(s.started_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Log drawer */}
      {drawerScan && (
        <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 480, display: 'flex', flexDirection: 'column', borderLeft: ruleStrong, zIndex: 30, background: 'var(--bg)' }}>
          {/* Drawer header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 20px', borderBottom: rule, flexShrink: 0 }}>
            <TerminalIcon size={16} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{drawerScan.scan_type}</span>
                <span style={badgeStyle(drawerScan.status)}>{drawerScan.status}</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{drawerScan.target} · {drawerScan.project}</p>
              {drawerScan.started_at && (
                <p style={{ fontSize: 11, color: 'var(--fg-4)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                  {new Date(drawerScan.started_at).toLocaleString()}
                  {drawerScan.completed_at && ` → ${new Date(drawerScan.completed_at).toLocaleString()}`}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {drawerScan.raw_output !== null && (
                <button
                  onClick={() => parseFindings(drawerScan.id)}
                  disabled={parseLoading}
                  title="Re-parse output into findings"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 4, fontSize: 11, background: 'rgba(240,168,58,0.08)', color: 'var(--accent)', border: '1px solid rgba(240,168,58,0.25)', cursor: parseLoading ? 'not-allowed' : 'pointer', opacity: parseLoading ? 0.5 : 1 }}
                >
                  {parseLoading ? <Loader size={11} className="animate-spin" /> : <Cpu size={11} />}
                  {parseLoading ? 'Parsing…' : 'Parse Findings'}
                </button>
              )}
              {parseMsg && <span style={{ fontSize: 11, color: 'var(--ok)' }}>{parseMsg}</span>}
              {(drawerScan.status === 'running' || drawerScan.status === 'pending') && (
                <button
                  onClick={() => cancelScan(drawerScan.id)}
                  disabled={cancelLoading}
                  title="Cancel this scan"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 4, fontSize: 11, background: 'rgba(240,168,58,0.08)', color: 'var(--accent)', border: '1px solid rgba(240,168,58,0.25)', cursor: cancelLoading ? 'not-allowed' : 'pointer', opacity: cancelLoading ? 0.5 : 1 }}
                >
                  {cancelLoading ? <Loader size={11} className="animate-spin" /> : <Ban size={11} />}
                  {cancelLoading ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
              <button
                onClick={() => deleteScan(drawerScan.id)}
                disabled={deleteLoading}
                title="Delete this scan and all its findings"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 4, fontSize: 11, background: 'rgba(232,64,64,0.08)', color: 'var(--crit)', border: '1px solid rgba(232,64,64,0.25)', cursor: deleteLoading ? 'not-allowed' : 'pointer', opacity: deleteLoading ? 0.5 : 1 }}
              >
                {deleteLoading ? <Loader size={11} className="animate-spin" /> : <Trash2 size={11} />}
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => setDrawerScan(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0 }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Output */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {drawerLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-3)', fontSize: 13 }}>
                <Loader size={14} className="animate-spin" />
                Loading output…
              </div>
            ) : drawerScan.raw_output ? (
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{drawerScan.raw_output}</pre>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--fg-4)' }}>
                <TerminalIcon size={32} />
                <p style={{ fontSize: 13 }}>No output recorded for this scan.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DiffBucket({ label, icon, color, findings }: {
  label: string
  icon: React.ReactNode
  color: string
  findings: DiffFinding[]
}) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, color }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{findings.length}</span>
      </div>
      {findings.length === 0 ? (
        <p style={{ fontSize: 11, color: 'var(--fg-4)', textAlign: 'center', padding: '16px 0' }}>None</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 240 }}>
          {findings.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span
                style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase', flexShrink: 0, marginTop: 2, background: SEV_BG[f.severity] ?? 'rgba(100,116,139,0.15)', color: SEV_COLOR[f.severity] ?? 'var(--fg-3)' }}
              >
                {f.severity}
              </span>
              <p style={{ fontSize: 11, color: 'var(--fg-2)', lineHeight: 1.4 }}>{f.title}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
