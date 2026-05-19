import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search, ChevronDown, Download, Tag, X, Trash2, EyeOff, RotateCcw, ShieldOff, Plus } from 'lucide-react'
import { getApiBase } from '@/lib/config'

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

interface FindingRow {
  id: string
  severity: string
  title: string
  description: string
  cve_id: string | null
  cvss_score: string | null
  status: string
  fp_reason: string | null
  tags: string
  target: string
  project: string
  project_id: string | null
  created_at: string | null
}

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info']

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--crit)', high: '#f97316', medium: 'var(--accent)', low: 'var(--ok)', info: 'var(--fg-3)',
}

const SEV_BG: Record<string, string> = {
  critical: 'rgba(232,64,64,0.1)', high: 'rgba(249,115,22,0.1)', medium: 'rgba(240,168,58,0.1)',
  low: 'rgba(84,175,97,0.1)', info: 'rgba(100,116,139,0.1)',
}

const STATUS_OPTIONS = ['open', 'in-review', 'remediated', 'accepted', 'false_positive'] as const
type FindingStatus = typeof STATUS_OPTIONS[number]

const STATUS_STYLES: Record<string, { color: string; background: string; border: string }> = {
  'open':           { color: 'var(--crit)',   background: 'rgba(232,64,64,0.08)',   border: '1px solid rgba(232,64,64,0.25)' },
  'in-review':      { color: 'var(--accent)', background: 'rgba(240,168,58,0.08)', border: '1px solid rgba(240,168,58,0.25)' },
  'remediated':     { color: 'var(--ok)',     background: 'rgba(84,175,97,0.08)',   border: '1px solid rgba(84,175,97,0.25)' },
  'accepted':       { color: 'var(--fg-3)',   background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.2)' },
  'false_positive': { color: '#a78bfa',       background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)' },
}

export default function AllFindings() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [findings, setFindings] = useState<FindingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sevFilter, setSevFilter] = useState(searchParams.get('severity') ?? 'all')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? 'all')
  const [tagFilter, setTagFilter] = useState(searchParams.get('tag') ?? '')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [statusDropdown, setStatusDropdown] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState<Record<string, string>>({})
  const [fpModal, setFpModal] = useState<{ id: string; title: string } | null>(null)
  const [fpReason, setFpReason] = useState('')
  const [fpSaving, setFpSaving] = useState(false)
  const [showFp, setShowFp] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // FP suppression rules state
  interface FPRule { id: string; tool: string | null; title_contains: string; created_at: string }
  interface ProjectOpt { id: string; name: string }
  const [rulesOpen, setRulesOpen] = useState(false)
  const [ruleProjects, setRuleProjects] = useState<ProjectOpt[]>([])
  const [ruleProjectId, setRuleProjectId] = useState('')
  const [fpRules, setFpRules] = useState<FPRule[]>([])
  const [ruleTool, setRuleTool] = useState('')
  const [ruleTitleContains, setRuleTitleContains] = useState('')
  const [ruleSaving, setRuleSaving] = useState(false)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close status dropdown when clicking outside
  useEffect(() => {
    function handler() { setStatusDropdown(null) }
    if (statusDropdown) document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [statusDropdown])

  function exportCSV() {
    const header = 'severity,status,title,target,project,cve_id,cvss_score,tags,created_at,description'
    const rows = filtered.map(f =>
      [f.severity, f.status, f.title, f.target, f.project, f.cve_id ?? '', f.cvss_score ?? '',
       f.tags ?? '', f.created_at ?? '', f.description ?? '']
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'findings.csv'; a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'findings.json'; a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }

  function updateFilter(sev: string, q: string, stat: string, tag: string) {
    const params: Record<string, string> = {}
    if (sev !== 'all') params.severity = sev
    if (q) params.q = q
    if (stat !== 'all') params.status = stat
    if (tag) params.tag = tag
    setSearchParams(params, { replace: true })
  }

  useEffect(() => {
    fetch(`${getApiBase()}/findings`)
      .then(r => r.json())
      .then(setFindings)
      .finally(() => setLoading(false))
  }, [])

  async function suppressFinding(id: string, reason: string) {
    setFpSaving(true)
    try {
      await fetch(`${getApiBase()}/findings/${id}/suppress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      setFindings(prev => prev.map(f => f.id === id ? { ...f, status: 'false_positive', fp_reason: reason } : f))
      setFpModal(null)
      setFpReason('')
    } finally {
      setFpSaving(false)
    }
  }

  async function restoreFinding(id: string) {
    await fetch(`${getApiBase()}/findings/${id}/restore`, { method: 'POST' })
    setFindings(prev => prev.map(f => f.id === id ? { ...f, status: 'open', fp_reason: null } : f))
  }

  const filtered = findings.filter(f => {
    if (!showFp && f.status === 'false_positive') return false
    if (sevFilter !== 'all' && f.severity !== sevFilter) return false
    if (statusFilter !== 'all' && f.status !== statusFilter) return false
    if (tagFilter) {
      const tags = (f.tags ?? '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      if (!tags.includes(tagFilter.toLowerCase())) return false
    }
    if (search) {
      const q = search.toLowerCase()
      return (
        f.title.toLowerCase().includes(q) ||
        f.target.toLowerCase().includes(q) ||
        f.project.toLowerCase().includes(q) ||
        (f.cve_id?.toLowerCase().includes(q) ?? false)
      )
    }
    return true
  })

  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1
    return acc
  }, {})

  const statusCounts = findings.reduce<Record<string, number>>((acc, f) => {
    const s = f.status || 'open'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  function changeStatus(id: string, newStatus: FindingStatus) {
    fetch(`${getApiBase()}/findings/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    }).then(() => {
      setFindings(prev => prev.map(f => f.id === id ? { ...f, status: newStatus } : f))
    })
    setStatusDropdown(null)
  }

  function addTag(id: string) {
    const raw = (tagInput[id] ?? '').trim()
    if (!raw) return
    const finding = findings.find(f => f.id === id)
    if (!finding) return
    const existing = (finding.tags ?? '').split(',').map(t => t.trim()).filter(Boolean)
    if (existing.includes(raw)) { setTagInput(p => ({ ...p, [id]: '' })); return }
    const newTags = [...existing, raw]
    fetch(`${getApiBase()}/findings/${id}/tags`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    }).then(() => {
      setFindings(prev => prev.map(f => f.id === id ? { ...f, tags: newTags.join(',') } : f))
      setTagInput(p => ({ ...p, [id]: '' }))
    })
  }

  function removeTag(id: string, tag: string) {
    const finding = findings.find(f => f.id === id)
    if (!finding) return
    const newTags = (finding.tags ?? '').split(',').map(t => t.trim()).filter(t => t && t !== tag)
    fetch(`${getApiBase()}/findings/${id}/tags`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    }).then(() => {
      setFindings(prev => prev.map(f => f.id === id ? { ...f, tags: newTags.join(',') } : f))
    })
  }

  function deleteFinding(id: string) {
    fetch(`${getApiBase()}/findings/${id}`, { method: 'DELETE' }).then(res => {
      if (res.ok) setFindings(prev => prev.filter(f => f.id !== id))
    })
  }

  // Load project list once when rules panel opens
  useEffect(() => {
    if (!rulesOpen) return
    fetch(`${getApiBase()}/projects`).then(r => r.json()).then((data: ProjectOpt[]) => {
      setRuleProjects(data)
      if (data.length > 0 && !ruleProjectId) setRuleProjectId(data[0].id)
    }).catch(() => {})
  }, [rulesOpen])

  // Load rules when project changes
  useEffect(() => {
    if (!ruleProjectId) return
    fetch(`${getApiBase()}/projects/${ruleProjectId}/fp-rules`).then(r => r.json()).then(setFpRules).catch(() => setFpRules([]))
  }, [ruleProjectId])

  async function addFpRule() {
    if (!ruleProjectId || !ruleTitleContains.trim()) return
    setRuleSaving(true)
    try {
      const res = await fetch(`${getApiBase()}/projects/${ruleProjectId}/fp-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: ruleTool.trim() || null, title_contains: ruleTitleContains.trim() }),
      })
      if (res.ok) {
        const rule = await res.json()
        setFpRules(prev => [...prev, rule])
        setRuleTitleContains('')
        setRuleTool('')
      }
    } finally {
      setRuleSaving(false)
    }
  }

  async function deleteFpRule(ruleId: string) {
    await fetch(`${getApiBase()}/projects/${ruleProjectId}/fp-rules/${ruleId}`, { method: 'DELETE' })
    setFpRules(prev => prev.filter(r => r.id !== ruleId))
  }

  const statusBadgeStyle = (status: string): React.CSSProperties => {
    const ss = STATUS_STYLES[status] ?? STATUS_STYLES.open
    return { fontSize: 9, fontWeight: 500, padding: '1px 7px', borderRadius: 10, fontFamily: 'var(--font-sans)', color: ss.color, background: ss.background, border: ss.border, cursor: 'pointer' }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', border: ruleStrong, borderRadius: 4,
    color: 'var(--fg)', fontFamily: 'var(--font-sans)', fontSize: 13,
    padding: '6px 12px', outline: 'none',
  }

  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-2)', padding: 0 }}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>All Findings</h1>
          <p style={{ color: 'var(--fg-2)', fontSize: 13, marginTop: 2 }}>{findings.length} findings across all projects</p>
        </div>
        {/* Export dropdown */}
        <div style={{ position: 'relative' }} ref={exportRef}>
          <button
            onClick={() => setExportOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 500, color: 'var(--fg-2)', border: ruleStrong, background: 'var(--bg-2)', cursor: 'pointer' }}
          >
            <Download size={13} />
            Export
            <ChevronDown size={11} style={{ color: 'var(--fg-3)', transform: exportOpen ? 'rotate(180deg)' : 'none' }} />
          </button>
          {exportOpen && (
            <div style={{ position: 'absolute', right: 0, marginTop: 4, width: 144, background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, zIndex: 10, overflow: 'hidden' }}>
              <button onClick={exportCSV} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--fg-2)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Download CSV
              </button>
              <button onClick={exportJSON} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--fg-2)', background: 'none', border: 'none', cursor: 'pointer', borderTop: rule }}>
                Download JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)' }} />
            <input
              type="text"
              placeholder="Search title, target, CVE…"
              value={search}
              onChange={e => { setSearch(e.target.value); updateFilter(sevFilter, e.target.value, statusFilter, tagFilter) }}
              style={{ ...inputStyle, paddingLeft: 30, width: 256 }}
            />
          </div>

          {/* Tag filter */}
          <div style={{ position: 'relative' }}>
            <Tag size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)' }} />
            <input
              type="text"
              placeholder="Filter by tag…"
              value={tagFilter}
              onChange={e => { setTagFilter(e.target.value); updateFilter(sevFilter, search, statusFilter, e.target.value) }}
              style={{ ...inputStyle, paddingLeft: 30, width: 160 }}
            />
          </div>

          <button
            onClick={() => setShowFp(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 4, fontSize: 11, border: showFp ? '1px solid rgba(167,139,250,0.3)' : ruleStrong, background: showFp ? 'rgba(167,139,250,0.08)' : 'none', color: showFp ? '#a78bfa' : 'var(--fg-3)', cursor: 'pointer' }}
          >
            <EyeOff size={12} />
            {showFp ? 'Hide' : 'Show'} false positives
          </button>
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{filtered.length} shown</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Severity chips */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 4 }}>
            <button
              onClick={() => { setSevFilter('all'); updateFilter('all', search, statusFilter, tagFilter) }}
              style={{ padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer', background: sevFilter === 'all' ? 'rgba(100,116,139,0.2)' : 'none', color: sevFilter === 'all' ? 'var(--fg)' : 'var(--fg-3)' }}
            >
              All ({findings.length})
            </button>
            {SEV_ORDER.map(s => (
              counts[s] ? (
                <button
                  key={s}
                  onClick={() => { setSevFilter(s); updateFilter(s, search, statusFilter, tagFilter) }}
                  style={{ padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 500, textTransform: 'capitalize', border: 'none', cursor: 'pointer', background: sevFilter === s ? SEV_BG[s] : 'none', color: sevFilter === s ? SEV_COLOR[s] : 'var(--fg-3)' }}
                >
                  {s} ({counts[s]})
                </button>
              ) : null
            ))}
          </div>

          {/* Status chips */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 4 }}>
            <button
              onClick={() => { setStatusFilter('all'); updateFilter(sevFilter, search, 'all', tagFilter) }}
              style={{ padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer', background: statusFilter === 'all' ? 'rgba(100,116,139,0.2)' : 'none', color: statusFilter === 'all' ? 'var(--fg)' : 'var(--fg-3)' }}
            >
              Any status
            </button>
            {STATUS_OPTIONS.map(s => {
              const ss = STATUS_STYLES[s]
              return statusCounts[s] ? (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); updateFilter(sevFilter, search, s, tagFilter) }}
                  style={{ padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 500, textTransform: 'capitalize', border: statusFilter === s ? ss.border : 'none', cursor: 'pointer', background: statusFilter === s ? ss.background : 'none', color: statusFilter === s ? ss.color : 'var(--fg-3)' }}
                >
                  {s} ({statusCounts[s]})
                </button>
              ) : null
            })}
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: 'var(--fg-3)', fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: 'var(--fg-3)', fontSize: 13 }}>No findings match the current filter.</div>
        ) : (
          <div>
            {filtered.map((f, idx) => {
              const fStatus = (f.status || 'open') as FindingStatus
              const fTags = (f.tags ?? '').split(',').map(t => t.trim()).filter(Boolean)
              return (
                <div key={f.id} style={{ borderBottom: idx < filtered.length - 1 ? rule : 'none' }}>
                  <button
                    onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span
                      style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 10, textTransform: 'uppercase', flexShrink: 0, width: 56, textAlign: 'center', background: SEV_BG[f.severity] ?? 'rgba(100,116,139,0.1)', color: SEV_COLOR[f.severity] ?? 'var(--fg-3)' }}
                    >
                      {f.severity}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{f.title}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
                        <span style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.target}</span>
                        <span style={{ fontSize: 11, color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.project}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {f.cve_id && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{f.cve_id}</span>
                      )}
                      {f.cvss_score && (
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 4, border: ruleStrong, color: 'var(--fg-2)' }}>
                          CVSS {f.cvss_score}
                        </span>
                      )}
                      {/* Status badge — inline dropdown */}
                      <div
                        style={{ position: 'relative' }}
                        onClick={e => { e.stopPropagation(); setStatusDropdown(statusDropdown === f.id ? null : f.id) }}
                      >
                        <span style={statusBadgeStyle(fStatus)}>{fStatus}</span>
                        {statusDropdown === f.id && (
                          <div style={{ position: 'absolute', right: 0, top: 24, width: 112, background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, zIndex: 20, overflow: 'hidden' }}>
                            {STATUS_OPTIONS.map(opt => {
                              const oss = STATUS_STYLES[opt]
                              return (
                                <button
                                  key={opt}
                                  onClick={e => { e.stopPropagation(); changeStatus(f.id, opt) }}
                                  style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 500, background: opt === fStatus ? oss.background : 'none', color: opt === fStatus ? oss.color : 'var(--fg-3)', border: 'none', cursor: 'pointer' }}
                                >
                                  {opt}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <ChevronDown
                        size={12}
                        style={{ color: 'var(--fg-4)', transition: 'transform 0.15s', transform: expanded === f.id ? 'rotate(180deg)' : 'none' }}
                      />
                    </div>
                  </button>
                  {expanded === f.id && (
                    <div style={{ padding: '4px 20px 16px 96px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <p style={{ fontSize: 11, color: 'var(--fg-2)', lineHeight: 1.6, margin: 0 }}>{f.description}</p>
                      {/* Tags */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {fTags.map(tag => (
                          <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, background: 'rgba(240,168,58,0.08)', color: 'var(--accent)', border: '1px solid rgba(240,168,58,0.25)', borderRadius: 10, padding: '1px 8px' }}>
                            {tag}
                            <button onClick={() => removeTag(f.id, tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, display: 'flex', alignItems: 'center' }}>
                              <X size={9} />
                            </button>
                          </span>
                        ))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Tag size={10} style={{ color: 'var(--fg-4)' }} />
                          <input
                            type="text"
                            placeholder="add tag…"
                            value={tagInput[f.id] ?? ''}
                            onChange={e => setTagInput(p => ({ ...p, [f.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') addTag(f.id) }}
                            style={{ background: 'transparent', fontSize: 10, color: 'var(--fg-3)', outline: 'none', width: 80, border: 'none', borderBottom: rule }}
                          />
                        </div>
                        {/* False positive controls */}
                        {f.status === 'false_positive' ? (
                          <button
                            onClick={e => { e.stopPropagation(); restoreFinding(f.id) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 10, padding: '1px 8px', background: 'none', cursor: 'pointer' }}
                          >
                            <RotateCcw size={9} /> Restore
                          </button>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); setFpModal({ id: f.id, title: f.title }); setFpReason('') }}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--fg-3)', border: ruleStrong, borderRadius: 10, padding: '1px 8px', background: 'none', cursor: 'pointer' }}
                          >
                            <EyeOff size={9} /> False positive
                          </button>
                        )}
                        {f.fp_reason && (
                          <div style={{ width: '100%', marginTop: 4, fontSize: 10, color: '#a78bfa', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 4, padding: '4px 8px' }}>
                            FP reason: {f.fp_reason}
                          </div>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); deleteFinding(f.id) }}
                          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--crit)', border: '1px solid rgba(232,64,64,0.25)', borderRadius: 10, padding: '1px 8px', background: 'none', cursor: 'pointer' }}
                        >
                          <Trash2 size={9} /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Suppression Rules Panel */}
      <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, overflow: 'hidden' }}>
        <button
          onClick={() => setRulesOpen(o => !o)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          <ShieldOff size={14} style={{ color: '#a78bfa' }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-2)' }}>Auto-suppression Rules</span>
          <span style={{ fontSize: 11, color: 'var(--fg-3)', marginLeft: 4 }}>— apply at parse time to auto-mark FPs</span>
          <ChevronDown size={12} style={{ color: 'var(--fg-4)', marginLeft: 'auto', transform: rulesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {rulesOpen && (
          <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16, borderTop: rule }}>
            {/* Project picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>Project:</label>
              <select
                value={ruleProjectId}
                onChange={e => setRuleProjectId(e.target.value)}
                style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--fg)', outline: 'none' }}
              >
                {ruleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Rules list */}
            {fpRules.length === 0 ? (
              <p style={{ fontSize: 11, color: 'var(--fg-3)' }}>No rules yet. Rules added here will auto-suppress matching findings when scans are parsed.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {fpRules.map(rule => (
                  <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 4, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}>
                    {rule.tool && (
                      <span style={{ fontSize: 10, background: 'rgba(100,116,139,0.2)', color: 'var(--fg-2)', borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--font-mono)' }}>{rule.tool}</span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--fg-2)', flex: 1 }}>title contains <span style={{ color: '#a78bfa', fontWeight: 500 }}>"{rule.title_contains}"</span></span>
                    <button
                      onClick={() => deleteFpRule(rule.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-4)', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add rule form */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Tool (optional, e.g. nikto)"
                value={ruleTool}
                onChange={e => setRuleTool(e.target.value)}
                style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 4, padding: '6px 8px', fontSize: 11, color: 'var(--fg)', outline: 'none', width: 144 }}
              />
              <input
                type="text"
                placeholder="Title contains (required)"
                value={ruleTitleContains}
                onChange={e => setRuleTitleContains(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addFpRule() }}
                style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 4, padding: '6px 8px', fontSize: 11, color: 'var(--fg)', outline: 'none', width: 224 }}
              />
              <button
                onClick={addFpRule}
                disabled={!ruleTitleContains.trim() || !ruleProjectId || ruleSaving}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 4, fontSize: 11, background: '#a78bfa', color: '#0d0c0a', border: 'none', cursor: (!ruleTitleContains.trim() || !ruleProjectId || ruleSaving) ? 'not-allowed' : 'pointer', opacity: (!ruleTitleContains.trim() || !ruleProjectId || ruleSaving) ? 0.5 : 1, fontWeight: 600 }}
              >
                <Plus size={11} /> Add Rule
              </button>
            </div>
          </div>
        )}
      </div>

      {/* False Positive Modal */}
      {fpModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
          <div
            style={{ width: '100%', maxWidth: 480, borderRadius: 4, border: ruleStrong, boxShadow: '0 8px 40px rgba(0,0,0,0.5)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--bg-2)' }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Mark as False Positive</h2>
            <p style={{ fontSize: 13, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{fpModal.title}</p>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-2)', marginBottom: 4 }}>Reason <span style={{ color: 'var(--crit)' }}>*</span></label>
              <textarea
                value={fpReason}
                onChange={e => setFpReason(e.target.value)}
                placeholder="Explain why this is a false positive…"
                rows={3}
                style={{ width: '100%', background: 'var(--bg)', border: ruleStrong, borderRadius: 4, padding: '8px 12px', fontSize: 13, color: 'var(--fg)', outline: 'none', resize: 'none', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setFpModal(null)}
                style={{ padding: '8px 16px', fontSize: 13, color: 'var(--fg-3)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => suppressFinding(fpModal.id, fpReason)}
                disabled={!fpReason.trim() || fpSaving}
                style={{ padding: '8px 16px', borderRadius: 4, fontSize: 13, color: '#0d0c0a', background: '#a78bfa', border: 'none', cursor: (!fpReason.trim() || fpSaving) ? 'not-allowed' : 'pointer', opacity: (!fpReason.trim() || fpSaving) ? 0.5 : 1, fontWeight: 600 }}
              >
                {fpSaving ? 'Saving…' : 'Suppress'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
