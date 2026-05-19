import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Download, ChevronDown, Tag, X, EyeOff, RotateCcw, ShieldOff, Plus, Trash2 } from 'lucide-react'
import { getApiBase } from '@/lib/config'
import Icon from '@/components/Icon'

const rule = '1px solid var(--rule)'

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

const STATUS_OPTIONS = ['open', 'in-review', 'remediated', 'accepted', 'false_positive'] as const
type FindingStatus = typeof STATUS_OPTIONS[number]

const STATUS_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  'open':           { color: 'var(--crit)',   bg: 'rgba(232,64,64,0.08)',   border: 'rgba(232,64,64,0.25)' },
  'in-review':      { color: 'var(--accent)', bg: 'rgba(240,168,58,0.08)', border: 'rgba(240,168,58,0.25)' },
  'remediated':     { color: 'var(--ok)',     bg: 'rgba(84,175,97,0.08)',   border: 'rgba(84,175,97,0.25)' },
  'accepted':       { color: 'var(--fg-3)',   bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)' },
  'false_positive': { color: '#a78bfa',       bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)' },
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

function Counter({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
      <span className="mono tnum" style={{ fontSize: 17, color, fontWeight: 500 }}>{v}</span>
      <span className="mono" style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>{label}</span>
    </div>
  )
}

function SevSquare({ sev }: { sev: string }) {
  return <div style={{ width: 10, height: 10, background: SEV_COLOR[sev] ?? 'var(--fg-4)', flexShrink: 0 }} />
}

function StatusPill({ status }: { status: string }) {
  const ss = STATUS_STYLES[status] ?? STATUS_STYLES.open
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: '2px 7px', letterSpacing: '0.06em',
      fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
      color: ss.color, background: ss.bg, border: `1px solid ${ss.border}`,
    }}>
      {status}
    </span>
  )
}

interface DetailProps {
  finding: FindingRow
  tagInput: string
  setTagInput: (v: string) => void
  onAddTag: () => void
  onRemoveTag: (tag: string) => void
  onChangeStatus: (id: string, s: FindingStatus) => void
  onShowFpModal: () => void
  onRestore: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function FindingDetail({ finding, tagInput, setTagInput, onAddTag, onRemoveTag, onChangeStatus, onShowFpModal, onRestore, onDelete, onClose }: DetailProps) {
  const [aiOpen, setAiOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const fTags = (finding.tags ?? '').split(',').map(t => t.trim()).filter(Boolean)
  const fStatus = (finding.status || 'open') as FindingStatus
  const ss = STATUS_STYLES[fStatus] ?? STATUS_STYLES.open

  return (
    <div style={{ overflowY: 'auto', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '18px var(--pad)', borderBottom: rule, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div className="smcap">{finding.id.slice(0, 8)} · {finding.cve_id ?? 'manual finding'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-4)', padding: 0, flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>
        <h2 style={{ margin: '8px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, lineHeight: 1.25, letterSpacing: '-0.01em', color: 'var(--fg)' }}>
          {finding.title}
        </h2>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
            color: SEV_COLOR[finding.severity] ?? 'var(--fg-3)',
            background: `${SEV_COLOR[finding.severity] ?? '#888'}18`,
            border: `1px solid ${SEV_COLOR[finding.severity] ?? 'var(--rule-strong)'}44`,
          }}>{finding.severity}</span>
          {finding.cvss_score && (
            <span className="badge badge-accent">cvss {finding.cvss_score}</span>
          )}
          <StatusPill status={fStatus} />
        </div>
      </div>

      <div style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {/* KV metadata */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
          {[
            { k: 'target',  v: finding.target || '—' },
            { k: 'project', v: finding.project || '—' },
            { k: 'cve',     v: finding.cve_id || '—' },
            { k: 'created', v: finding.created_at ? new Date(finding.created_at).toLocaleDateString() : '—' },
          ].map(({ k, v }) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dashed var(--rule)' }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Description */}
        {finding.description && (
          <div style={{ border: rule, padding: 14 }}>
            <div className="smcap" style={{ marginBottom: 6 }}>Description</div>
            <p style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6, margin: 0, fontFamily: 'var(--font-serif)' }}>
              {finding.description}
            </p>
          </div>
        )}

        {/* Tags */}
        <div style={{ border: rule, padding: 12 }}>
          <div className="smcap" style={{ marginBottom: 8 }}>Tags</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {fTags.map(tag => (
              <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, background: 'rgba(240,168,58,0.08)', color: 'var(--accent)', border: '1px solid rgba(240,168,58,0.25)', padding: '2px 8px' }}>
                {tag}
                <button onClick={() => onRemoveTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, display: 'flex' }}>
                  <X size={9} />
                </button>
              </span>
            ))}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Tag size={10} style={{ color: 'var(--fg-4)' }} />
              <input
                type="text"
                placeholder="add tag…"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddTag() } }}
                style={{ background: 'transparent', fontSize: 10, color: 'var(--fg-3)', outline: 'none', width: 70, border: 'none', borderBottom: rule }}
              />
            </div>
          </div>
          {finding.fp_reason && (
            <div style={{ marginTop: 8, fontSize: 10, color: '#a78bfa', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', padding: '4px 8px' }}>
              FP: {finding.fp_reason}
            </div>
          )}
        </div>

        {/* Status change */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setStatusOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', background: ss.bg, border: `1px solid ${ss.border}`,
              cursor: 'pointer', color: ss.color, fontFamily: 'var(--font-mono)', fontSize: 11,
            }}
          >
            <span style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Status: {fStatus}</span>
            <ChevronDown size={12} style={{ transform: statusOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {statusOpen && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', background: 'var(--bg-2)', border: rule, zIndex: 20 }}>
              {STATUS_OPTIONS.filter(o => o !== 'false_positive').map(opt => {
                const os = STATUS_STYLES[opt]
                return (
                  <button
                    key={opt}
                    onClick={() => { onChangeStatus(finding.id, opt); setStatusOpen(false) }}
                    style={{
                      display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left',
                      fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
                      background: opt === fStatus ? os.bg : 'none',
                      color: opt === fStatus ? os.color : 'var(--fg-3)',
                      border: 'none', borderBottom: rule, cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* AI Remediation */}
        <div style={{ border: `1px solid ${aiOpen ? 'var(--accent)' : 'var(--rule)'}` }}>
          <div className="sec-h">
            <span className="title">AI REMEDIATION · LOCAL LLM</span>
            <button onClick={() => setAiOpen(v => !v)} className="btn btn-sm" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
              {aiOpen ? <><Icon name="check" size={9} /> ready</> : <><Icon name="bolt" size={9} /> Generate</>}
            </button>
          </div>
          <div style={{ padding: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--fg-3)', margin: 0, lineHeight: 1.55 }}>
              {aiOpen
                ? 'AI remediation requires a connected Ollama endpoint. Configure it in Settings → AI.'
                : 'One-click remediation guidance routed through your local Ollama endpoint. No external API calls.'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
            <Icon name="check" size={9} /> Verify
          </button>
          <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
            <Icon name="flag" size={9} /> Tag
          </button>
          <button className="btn btn-sm btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
            <Icon name="file" size={9} color="#1a1408" /> Report
          </button>
        </div>

        {/* FP / Delete row */}
        <div style={{ display: 'flex', gap: 6, paddingTop: 4, borderTop: '1px dashed var(--rule)' }}>
          {fStatus === 'false_positive' ? (
            <button
              onClick={() => onRestore(finding.id)}
              className="btn btn-sm btn-ghost"
              style={{ color: '#a78bfa', borderColor: 'rgba(167,139,250,0.3)' }}
            >
              <RotateCcw size={9} /> Restore
            </button>
          ) : (
            <button
              onClick={onShowFpModal}
              className="btn btn-sm btn-ghost"
            >
              <EyeOff size={9} /> False positive
            </button>
          )}
          <button
            onClick={() => onDelete(finding.id)}
            className="btn btn-sm btn-ghost"
            style={{ marginLeft: 'auto', color: 'var(--crit)', borderColor: 'rgba(232,64,64,0.25)' }}
          >
            <Trash2 size={9} /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AllFindings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [findings, setFindings] = useState<FindingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sevFilter, setSevFilter] = useState(searchParams.get('severity') ?? 'all')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? 'all')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [fpModal, setFpModal] = useState<{ id: string; title: string } | null>(null)
  const [fpReason, setFpReason] = useState('')
  const [fpSaving, setFpSaving] = useState(false)
  const [showFp, setShowFp] = useState(false)
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({})
  const exportRef = useRef<HTMLDivElement>(null)

  // FP rules state
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

  useEffect(() => {
    fetch(`${getApiBase()}/findings`)
      .then(r => r.json())
      .then(setFindings)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!rulesOpen) return
    fetch(`${getApiBase()}/projects`).then(r => r.json()).then((data: ProjectOpt[]) => {
      setRuleProjects(data)
      if (data.length > 0 && !ruleProjectId) setRuleProjectId(data[0].id)
    }).catch(() => {})
  }, [rulesOpen])

  useEffect(() => {
    if (!ruleProjectId) return
    fetch(`${getApiBase()}/projects/${ruleProjectId}/fp-rules`).then(r => r.json()).then(setFpRules).catch(() => setFpRules([]))
  }, [ruleProjectId])

  function updateFilter(sev: string, q: string, stat: string) {
    const params: Record<string, string> = {}
    if (sev !== 'all') params.severity = sev
    if (q) params.q = q
    if (stat !== 'all') params.status = stat
    setSearchParams(params, { replace: true })
  }

  function exportCSV() {
    const header = 'severity,status,title,target,project,cve_id,cvss_score,created_at,description'
    const rows = filtered.map(f =>
      [f.severity, f.status, f.title, f.target, f.project, f.cve_id ?? '', f.cvss_score ?? '', f.created_at ?? '', f.description ?? '']
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

  function changeStatus(id: string, newStatus: FindingStatus) {
    fetch(`${getApiBase()}/findings/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    }).then(() => setFindings(prev => prev.map(f => f.id === id ? { ...f, status: newStatus } : f)))
  }

  function addTag(id: string) {
    const raw = (tagInputs[id] ?? '').trim()
    if (!raw) return
    const finding = findings.find(f => f.id === id)
    if (!finding) return
    const existing = (finding.tags ?? '').split(',').map(t => t.trim()).filter(Boolean)
    if (existing.includes(raw)) { setTagInputs(p => ({ ...p, [id]: '' })); return }
    const newTags = [...existing, raw]
    fetch(`${getApiBase()}/findings/${id}/tags`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    }).then(() => {
      setFindings(prev => prev.map(f => f.id === id ? { ...f, tags: newTags.join(',') } : f))
      setTagInputs(p => ({ ...p, [id]: '' }))
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
    }).then(() => setFindings(prev => prev.map(f => f.id === id ? { ...f, tags: newTags.join(',') } : f)))
  }

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

  function deleteFinding(id: string) {
    fetch(`${getApiBase()}/findings/${id}`, { method: 'DELETE' }).then(res => {
      if (res.ok) {
        setFindings(prev => prev.filter(f => f.id !== id))
        if (selectedId === id) setSelectedId(null)
      }
    })
  }

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

  const filtered = findings.filter(f => {
    if (!showFp && f.status === 'false_positive') return false
    if (sevFilter !== 'all' && f.severity !== sevFilter) return false
    if (statusFilter !== 'all' && f.status !== statusFilter) return false
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
    if (f.status !== 'false_positive') acc[f.severity] = (acc[f.severity] || 0) + 1
    return acc
  }, {})

  const selectedFinding = filtered.find(f => f.id === selectedId) ?? null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Page header */}
      <div style={{ borderBottom: rule, padding: '18px var(--pad)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
        <div>
          <div className="smcap" style={{ marginBottom: 4 }}>Findings & Vulnerabilities</div>
          <h1 className="mono" style={{ margin: 0, fontWeight: 500, fontSize: 22, letterSpacing: '-0.01em' }}>All Findings</h1>
          <div style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 6 }}>
            {filtered.length} of {findings.length} findings
            {counts.critical ? ` · ${counts.critical} critical` : ''}
            {counts.high ? ` · ${counts.high} high` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => setShowFp(p => !p)}
            className={`btn ${showFp ? '' : 'btn-ghost'}`}
            style={showFp ? { color: '#a78bfa', borderColor: 'rgba(167,139,250,0.4)' } : {}}
          >
            <EyeOff size={11} /> {showFp ? 'Hide FPs' : 'Show FPs'}
          </button>
          <div style={{ position: 'relative' }} ref={exportRef}>
            <button onClick={() => setExportOpen(o => !o)} className="btn">
              <Download size={11} /> Export <ChevronDown size={10} />
            </button>
            {exportOpen && (
              <div style={{ position: 'absolute', right: 0, marginTop: 4, width: 144, background: 'var(--bg-2)', border: rule, zIndex: 10, overflow: 'hidden' }}>
                <button onClick={exportCSV} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--fg-2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                  Download CSV
                </button>
                <button onClick={exportJSON} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--fg-2)', background: 'none', border: 'none', cursor: 'pointer', borderTop: rule, fontFamily: 'var(--font-mono)' }}>
                  Download JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px var(--pad)', borderBottom: rule, background: 'var(--bg-2)', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Search size={12} color="var(--fg-3)" />
          <input
            placeholder="search · cve · title"
            value={search}
            onChange={e => { setSearch(e.target.value); updateFilter(sevFilter, e.target.value, statusFilter) }}
            style={{ width: 220 }}
          />
        </div>
        <div style={{ width: 1, height: 18, background: 'var(--rule)' }} />
        <SegBtns
          options={['all', ...SEV_ORDER.filter(s => counts[s])]}
          value={sevFilter}
          onChange={v => { setSevFilter(v); updateFilter(v, search, statusFilter) }}
        />
        <div style={{ width: 1, height: 18, background: 'var(--rule)' }} />
        <SegBtns
          options={['all', 'open', 'in-review', 'remediated', 'accepted']}
          value={statusFilter}
          onChange={v => { setStatusFilter(v); updateFilter(sevFilter, search, v) }}
        />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
          <Counter label="critical" v={counts.critical ?? 0} color="var(--crit)" />
          <Counter label="high"     v={counts.high     ?? 0} color="var(--high)" />
          <Counter label="medium"   v={counts.medium   ?? 0} color="var(--med)" />
          <Counter label="low"      v={counts.low      ?? 0} color="var(--ok)" />
        </div>
      </div>

      {/* Main split */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedFinding ? '1fr 480px' : '1fr', flex: 1, minHeight: 0 }}>
        {/* List */}
        <div style={{ overflowY: 'auto', borderRight: selectedFinding ? rule : 'none' }}>
          {loading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>No findings match the current filter.</div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 26 }}></th>
                  <th style={{ width: 58 }}>CVSS</th>
                  <th>Finding</th>
                  <th style={{ width: 190 }}>Target</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 120 }}>Project</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => (
                  <tr
                    key={f.id}
                    className={selectedId === f.id ? 'selected' : ''}
                    onClick={() => setSelectedId(selectedId === f.id ? null : f.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td><SevSquare sev={f.severity} /></td>
                    <td className="mono tnum" style={{
                      color: f.cvss_score
                        ? parseFloat(f.cvss_score) >= 9 ? 'var(--crit)' : parseFloat(f.cvss_score) >= 7 ? 'var(--high)' : 'var(--fg-2)'
                        : 'var(--fg-4)',
                    }}>
                      {f.cvss_score ?? '—'}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 12.5 }}>{f.title}</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 2 }}>
                        {f.cve_id ?? 'no cve'}
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.target}
                    </td>
                    <td><StatusPill status={f.status || 'open'} /></td>
                    <td className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.project}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selectedFinding && (
          <FindingDetail
            finding={selectedFinding}
            tagInput={tagInputs[selectedFinding.id] ?? ''}
            setTagInput={v => setTagInputs(p => ({ ...p, [selectedFinding.id]: v }))}
            onAddTag={() => addTag(selectedFinding.id)}
            onRemoveTag={tag => removeTag(selectedFinding.id, tag)}
            onChangeStatus={changeStatus}
            onShowFpModal={() => { setFpModal({ id: selectedFinding.id, title: selectedFinding.title }); setFpReason('') }}
            onRestore={restoreFinding}
            onDelete={deleteFinding}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {/* FP Suppression Rules — collapsible footer */}
      <div style={{ borderTop: rule, flexShrink: 0 }}>
        <button
          onClick={() => setRulesOpen(o => !o)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px var(--pad)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <ShieldOff size={13} style={{ color: '#a78bfa' }} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>Auto-suppression Rules</span>
          <span style={{ fontSize: 11, color: 'var(--fg-4)', marginLeft: 4 }}>— auto-mark FPs at parse time</span>
          <ChevronDown size={11} style={{ color: 'var(--fg-4)', marginLeft: 'auto', transform: rulesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {rulesOpen && (
          <div style={{ padding: '0 var(--pad) 16px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: rule }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--fg-2)', fontFamily: 'var(--font-mono)' }}>Project:</label>
              <select
                value={ruleProjectId}
                onChange={e => setRuleProjectId(e.target.value)}
                style={{ background: 'var(--bg)', border: rule, padding: '4px 8px', fontSize: 11, color: 'var(--fg)', outline: 'none' }}
              >
                {ruleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {fpRules.length === 0 ? (
              <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0 }}>No rules yet. Rules here will auto-suppress matching findings when scans are parsed.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {fpRules.map(rule => (
                  <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}>
                    {rule.tool && (
                      <span className="mono" style={{ fontSize: 10, background: 'rgba(100,116,139,0.2)', color: 'var(--fg-2)', padding: '1px 6px' }}>{rule.tool}</span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--fg-2)', flex: 1 }}>title contains <span style={{ color: '#a78bfa', fontWeight: 500 }}>"{rule.title_contains}"</span></span>
                    <button onClick={() => deleteFpRule(rule.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-4)', padding: 0 }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                placeholder="Tool (e.g. nikto)"
                value={ruleTool}
                onChange={e => setRuleTool(e.target.value)}
                style={{ padding: '5px 8px', fontSize: 11, color: 'var(--fg)', outline: 'none', width: 130 }}
              />
              <input
                type="text"
                placeholder="Title contains (required)"
                value={ruleTitleContains}
                onChange={e => setRuleTitleContains(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addFpRule() }}
                style={{ padding: '5px 8px', fontSize: 11, color: 'var(--fg)', outline: 'none', width: 210 }}
              />
              <button
                onClick={addFpRule}
                disabled={!ruleTitleContains.trim() || !ruleProjectId || ruleSaving}
                className="btn btn-sm"
                style={{ color: '#a78bfa', borderColor: 'rgba(167,139,250,0.4)' }}
              >
                <Plus size={10} /> Add Rule
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FP Modal */}
      {fpModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
          <div style={{ width: '100%', maxWidth: 480, background: 'var(--bg-2)', border: rule, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0, fontFamily: 'var(--font-mono)' }}>Mark as False Positive</h2>
            <p style={{ fontSize: 12, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{fpModal.title}</p>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--fg-2)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>Reason *</label>
              <textarea
                value={fpReason}
                onChange={e => setFpReason(e.target.value)}
                placeholder="Explain why this is a false positive…"
                rows={3}
                style={{ width: '100%', padding: '8px 12px', fontSize: 13, color: 'var(--fg)', outline: 'none', resize: 'none', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setFpModal(null)} className="btn btn-ghost">Cancel</button>
              <button
                onClick={() => suppressFinding(fpModal.id, fpReason)}
                disabled={!fpReason.trim() || fpSaving}
                className="btn btn-primary"
                style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.15)', borderColor: 'rgba(167,139,250,0.4)' }}
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
