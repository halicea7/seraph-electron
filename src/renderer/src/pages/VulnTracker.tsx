import { useState, useEffect, useRef } from 'react'
import { Brain, Sparkles, AlertTriangle } from 'lucide-react'
import Icon from '../components/Icon'
import type { Project } from '../types/index'
import { getApiBase } from '@/lib/config'

// ── Types ──────────────────────────────────────────────────────────────────────

type VulnStatus = 'open' | 'in_progress' | 'mitigated' | 'accepted' | 'false_positive'
type VulnSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

interface Vuln {
  id: string
  project_id: string
  title: string
  description: string
  severity: VulnSeverity
  status: VulnStatus
  cvss_score: string | null
  cve_id: string | null
  affected_asset: string
  remediation_notes: string
  tags: string[]
  ai_remediation: string | null
  created_at: string
  updated_at: string
}

interface VulnStats {
  total: number
  by_status: Record<string, number>
  by_severity: Record<string, number>
}

interface ScanFinding {
  id: string
  title: string
  severity: string
  description: string | null
  scan_id: string
}

// ── Style maps ─────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<VulnSeverity, string> = {
  critical: 'var(--crit)',
  high:     '#f97316',
  medium:   'var(--accent)',
  low:      'var(--ok)',
  info:     '#60a5fa',
}

const SEV_STYLE: Record<VulnSeverity, { color: string; background: string; border: string }> = {
  critical: { color: 'var(--crit)',   background: 'rgba(232,64,64,0.08)',  border: '1px solid rgba(232,64,64,0.3)' },
  high:     { color: '#f97316',       background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)' },
  medium:   { color: 'var(--accent)', background: 'rgba(240,168,58,0.08)', border: '1px solid rgba(240,168,58,0.3)' },
  low:      { color: 'var(--ok)',     background: 'rgba(84,175,97,0.08)',  border: '1px solid rgba(84,175,97,0.3)' },
  info:     { color: '#60a5fa',       background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)' },
}

const STATUS_STYLE: Record<VulnStatus, { color: string; background: string; border: string }> = {
  open:           { color: 'var(--crit)',   background: 'rgba(232,64,64,0.08)',  border: '1px solid rgba(232,64,64,0.3)' },
  in_progress:    { color: 'var(--accent)', background: 'rgba(240,168,58,0.08)', border: '1px solid rgba(240,168,58,0.3)' },
  mitigated:      { color: 'var(--ok)',     background: 'rgba(84,175,97,0.08)',  border: '1px solid rgba(84,175,97,0.3)' },
  accepted:       { color: '#60a5fa',       background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)' },
  false_positive: { color: 'var(--fg-3)',   background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.2)' },
}

const STATUS_LABELS: Record<VulnStatus, string> = {
  open:           'Open',
  in_progress:    'In Progress',
  mitigated:      'Mitigated',
  accepted:       'Accepted',
  false_positive: 'False Positive',
}

const ALL_STATUSES: VulnStatus[] = ['open', 'in_progress', 'mitigated', 'accepted', 'false_positive']
const ALL_SEVERITIES: VulnSeverity[] = ['critical', 'high', 'medium', 'low', 'info']

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--bg)',
  border: ruleStrong,
  borderRadius: 3,
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--fg)',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--fg-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 5,
  fontFamily: 'var(--font-sans)',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseTags(raw: string): string[] {
  return raw.split(',').map(t => t.trim()).filter(Boolean)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Status quick-change dropdown ──────────────────────────────────────────────

function StatusDropdown({ current, onSelect }: { current: VulnStatus; onSelect: (s: VulnStatus) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const ss = STATUS_STYLE[current]

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 10, padding: '2px 7px', borderRadius: 10,
          fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: 'pointer',
          color: ss.color, background: ss.background, border: ss.border,
        }}
      >
        {STATUS_LABELS[current]}
        <Icon name="chev_d" size={9} color="currentColor" />
      </button>
      {open && (
        <div style={{
          position: 'absolute', left: 0, top: '100%', marginTop: 4,
          zIndex: 20, borderRadius: 4, border: ruleStrong,
          background: 'var(--bg-2)', minWidth: 150, overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => { onSelect(s); setOpen(false) }}
              style={{
                width: '100%', textAlign: 'left', fontSize: 11,
                padding: '7px 12px', background: 'none', border: 'none',
                color: s === current ? 'var(--accent)' : 'var(--fg-2)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
                borderBottom: rule,
              }}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VulnTracker() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [vulns, setVulns] = useState<Vuln[]>([])
  const [stats, setStats] = useState<VulnStats>({ total: 0, by_status: {}, by_severity: {} })

  const [filterStatus, setFilterStatus] = useState<'all' | VulnStatus>('all')
  const [filterSeverity, setFilterSeverity] = useState<'all' | VulnSeverity>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editingVuln, setEditingVuln] = useState<Vuln | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')

  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formSeverity, setFormSeverity] = useState<VulnSeverity>('medium')
  const [formStatus, setFormStatus] = useState<VulnStatus>('open')
  const [formCvss, setFormCvss] = useState('')
  const [formCve, setFormCve] = useState('')
  const [formAsset, setFormAsset] = useState('')
  const [formRemediation, setFormRemediation] = useState('')
  const [formTags, setFormTags] = useState('')

  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [aiExpanded, setAiExpanded] = useState<string | null>(null)

  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [findingsList, setFindingsList] = useState<ScanFinding[]>([])
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set())

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${getApiBase()}/projects`)
      .then(r => r.json())
      .then((data: Project[]) => {
        setProjects(data)
        if (data.length > 0) setSelectedProject(data[0].id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedProject) {
      loadVulns()
      loadStats()
    }
  }, [selectedProject])

  async function loadVulns() {
    try {
      const res = await fetch(`${getApiBase()}/vulns?project_id=${selectedProject}`)
      setVulns(await res.json())
    } catch { setVulns([]) }
  }

  async function loadStats() {
    try {
      const res = await fetch(`${getApiBase()}/vulns/stats?project_id=${selectedProject}`)
      setStats(await res.json())
    } catch { setStats({ total: 0, by_status: {}, by_severity: {} }) }
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openCreateModal() {
    setEditingVuln(null)
    setFormTitle(''); setFormDesc(''); setFormSeverity('medium'); setFormStatus('open')
    setFormCvss(''); setFormCve(''); setFormAsset(''); setFormRemediation(''); setFormTags('')
    setModalError('')
    setShowModal(true)
  }

  function openEditModal(v: Vuln) {
    setEditingVuln(v)
    setFormTitle(v.title); setFormDesc(v.description); setFormSeverity(v.severity); setFormStatus(v.status)
    setFormCvss(v.cvss_score ?? ''); setFormCve(v.cve_id ?? ''); setFormAsset(v.affected_asset)
    setFormRemediation(v.remediation_notes); setFormTags(v.tags.join(', '))
    setModalError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!formTitle.trim()) { setModalError('Title is required.'); return }
    if (!selectedProject) { setModalError('Select a project first.'); return }
    setSaving(true); setModalError('')
    try {
      const body = {
        project_id: selectedProject,
        title: formTitle.trim(), description: formDesc.trim(),
        severity: formSeverity, status: formStatus,
        cvss_score: formCvss.trim() || null, cve_id: formCve.trim() || null,
        affected_asset: formAsset.trim(), remediation_notes: formRemediation.trim(),
        tags: parseTags(formTags),
      }
      if (editingVuln) {
        await fetch(`${getApiBase()}/vulns/${editingVuln.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        await fetch(`${getApiBase()}/vulns`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      setShowModal(false)
      await loadVulns(); await loadStats()
    } catch (err: any) {
      setModalError(err.message || 'Save failed.')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this vulnerability?')) return
    await fetch(`${getApiBase()}/vulns/${id}`, { method: 'DELETE' })
    setVulns(prev => prev.filter(v => v.id !== id))
    await loadStats()
  }

  async function handleStatusChange(vuln: Vuln, newStatus: VulnStatus) {
    await fetch(`${getApiBase()}/vulns/${vuln.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...vuln, status: newStatus }),
    })
    setVulns(prev => prev.map(v => v.id === vuln.id ? { ...v, status: newStatus } : v))
    await loadStats()
  }

  async function handleAiRemediate(vuln: Vuln) {
    setAiLoading(vuln.id)
    try {
      const res = await fetch(`${getApiBase()}/vulns/${vuln.id}/ai-remediate`, { method: 'POST' })
      const data = await res.json()
      setVulns(prev => prev.map(v => v.id === vuln.id ? { ...v, ai_remediation: data.ai_remediation } : v))
      setAiExpanded(vuln.id)
    } catch { /* ignore */ } finally { setAiLoading(null) }
  }

  async function openImportModal() {
    setSelectedFindingIds(new Set()); setFindingsList([])
    setShowImport(true)
    try {
      const res = await fetch(`${getApiBase()}/findings?project_id=${selectedProject}`)
      setFindingsList(await res.json())
    } catch { setFindingsList([]) }
  }

  function toggleFinding(id: string) {
    setSelectedFindingIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleImport() {
    if (selectedFindingIds.size === 0) return
    setImporting(true)
    try {
      await fetch(`${getApiBase()}/vulns/import-findings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: selectedProject, finding_ids: Array.from(selectedFindingIds) }),
      })
      setShowImport(false); await loadVulns(); await loadStats()
    } catch { /* ignore */ } finally { setImporting(false) }
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = vulns.filter(v => {
    if (filterStatus !== 'all' && v.status !== filterStatus) return false
    if (filterSeverity !== 'all' && v.severity !== filterSeverity) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!v.title.toLowerCase().includes(q) && !v.description.toLowerCase().includes(q) &&
          !v.affected_asset.toLowerCase().includes(q) && !(v.cve_id ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  // ── Render ────────────────────────────────────────────────────────────────

  const selStyle: React.CSSProperties = {
    background: 'var(--bg-2)', border: ruleStrong, borderRadius: 3,
    padding: '5px 8px', fontSize: 12, color: 'var(--fg)',
    fontFamily: 'var(--font-sans)', outline: 'none',
  }

  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto', background: 'var(--bg)', color: 'var(--fg)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="shield" size={20} color="var(--crit)" />
          <div>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Vulnerability Tracker</h1>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Track, prioritize, and remediate security findings</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={selStyle}>
            <option value="">Select project...</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={openImportModal}
            disabled={!selectedProject}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 4, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: selectedProject ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)', opacity: selectedProject ? 1 : 0.5 }}
          >
            <Icon name="download" size={13} color="currentColor" /> Import from Findings
          </button>
          <button
            onClick={openCreateModal}
            disabled={!selectedProject}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 4, background: selectedProject ? 'var(--accent)' : 'var(--bg-2)', color: selectedProject ? 'var(--bg)' : 'var(--fg-3)', border: 'none', fontSize: 12, fontWeight: 700, cursor: selectedProject ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)', opacity: selectedProject ? 1 : 0.5 }}
          >
            <Icon name="plus" size={13} color="currentColor" /> New Vulnerability
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Total', value: stats.total, color: 'var(--fg)' },
          { label: 'Open', value: stats.by_status['open'] ?? 0, color: 'var(--crit)', accent: 'rgba(232,64,64,0.5)' },
          { label: 'In Progress', value: stats.by_status['in_progress'] ?? 0, color: 'var(--accent)', accent: 'rgba(240,168,58,0.5)' },
          { label: 'Mitigated', value: stats.by_status['mitigated'] ?? 0, color: 'var(--ok)', accent: 'rgba(84,175,97,0.5)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: '12px 16px', borderTop: s.accent ? `2px solid ${s.accent}` : ruleStrong }}>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: s.color }}>{s.value}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)' }}>
            <Icon name="search" size={12} color="currentColor" />
          </span>
          <input
            type="text"
            placeholder="Search vulnerabilities..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 28 }}
          />
        </div>

        {/* Status pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="filter" size={11} color="var(--fg-3)" />
          {(['all', ...ALL_STATUSES] as const).map(s => {
            const isActive = filterStatus === s
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  fontSize: 10, padding: '3px 9px', borderRadius: 10, cursor: 'pointer',
                  fontWeight: isActive ? 700 : 400,
                  background: isActive ? 'var(--accent)' : 'none',
                  color: isActive ? 'var(--bg)' : 'var(--fg-3)',
                  border: isActive ? 'none' : ruleStrong,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {s === 'all' ? 'All Status' : STATUS_LABELS[s]}
              </button>
            )
          })}
        </div>

        {/* Severity pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {(['all', ...ALL_SEVERITIES] as const).map(s => {
            const isActive = filterSeverity === s
            const sc = s !== 'all' ? SEV_COLOR[s] : 'var(--accent)'
            return (
              <button
                key={s}
                onClick={() => setFilterSeverity(s)}
                style={{
                  fontSize: 10, padding: '3px 9px', borderRadius: 10, cursor: 'pointer',
                  fontWeight: isActive ? 700 : 400, textTransform: 'capitalize',
                  background: isActive ? (s === 'all' ? 'var(--accent)' : `${sc}22`) : 'none',
                  color: isActive ? (s === 'all' ? 'var(--bg)' : sc) : 'var(--fg-3)',
                  border: isActive && s !== 'all' ? `1px solid ${sc}55` : (isActive ? 'none' : ruleStrong),
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {s === 'all' ? 'All Severity' : s}
              </button>
            )
          })}
        </div>
      </div>

      {/* Vuln list */}
      {filtered.length === 0 ? (
        <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: '64px 24px', textAlign: 'center' }}>
          <Icon name="shield" size={40} color="var(--rule-strong)" />
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
            {vulns.length === 0 ? 'No vulnerabilities tracked yet.' : 'No vulnerabilities match the current filters.'}
          </p>
          {vulns.length === 0 && selectedProject && (
            <button
              onClick={openCreateModal}
              style={{ marginTop: 12, fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            >
              + Add your first vulnerability
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(vuln => {
            const sevColor = SEV_COLOR[vuln.severity]
            const ss = SEV_STYLE[vuln.severity]
            return (
              <div key={vuln.id} style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ display: 'flex' }}>
                  {/* Left severity bar */}
                  <div style={{ width: 3, flexShrink: 0, background: sevColor }} />
                  <div style={{ flex: 1, padding: '14px 16px' }}>
                    {/* Top row: badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700, textTransform: 'uppercase', fontFamily: 'var(--font-sans)', color: ss.color, background: ss.background, border: ss.border }}>
                        {vuln.severity}
                      </span>
                      <StatusDropdown current={vuln.status} onSelect={s => handleStatusChange(vuln, s)} />
                      {vuln.cve_id && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'var(--bg)', border: ruleStrong, color: 'var(--fg-2)', fontFamily: 'var(--font-mono)' }}>
                          {vuln.cve_id}
                        </span>
                      )}
                      {vuln.cvss_score && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'var(--bg)', border: ruleStrong, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
                          CVSS {vuln.cvss_score}
                        </span>
                      )}
                    </div>

                    <h3 style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>{vuln.title}</h3>

                    {vuln.affected_asset && (
                      <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
                        Asset: {vuln.affected_asset}
                      </p>
                    )}

                    {vuln.description && (
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {vuln.description}
                      </p>
                    )}

                    {/* Tags */}
                    {vuln.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                        {vuln.tags.map(tag => (
                          <span key={tag} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: 'rgba(240,168,58,0.06)', border: '1px solid rgba(240,168,58,0.2)', color: 'var(--accent)', fontFamily: 'var(--font-sans)' }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Bottom row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
                        {formatDate(vuln.created_at)}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                        <button
                          onClick={() => handleAiRemediate(vuln)}
                          disabled={aiLoading === vuln.id}
                          title="AI Remediation"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            fontSize: 11, padding: '4px 10px', borderRadius: 4,
                            background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)',
                            color: '#a855f7', cursor: aiLoading === vuln.id ? 'not-allowed' : 'pointer',
                            fontFamily: 'var(--font-sans)', opacity: aiLoading === vuln.id ? 0.6 : 1,
                          }}
                        >
                          <Brain size={11} /> AI Remediate
                        </button>
                        <button
                          onClick={() => openEditModal(vuln)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 10px', borderRadius: 4, background: 'none', border: ruleStrong, color: 'var(--fg-3)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                        >
                          <Icon name="edit" size={11} color="currentColor" /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(vuln.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 10px', borderRadius: 4, background: 'none', border: '1px solid rgba(232,64,64,0.2)', color: 'var(--fg-3)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--crit)'; e.currentTarget.style.borderColor = 'rgba(232,64,64,0.5)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-3)'; e.currentTarget.style.borderColor = 'rgba(232,64,64,0.2)' }}
                        >
                          <Icon name="trash" size={11} color="currentColor" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI remediation panel */}
                {vuln.ai_remediation && (
                  <div style={{ borderTop: '1px solid rgba(168,85,247,0.15)', padding: '10px 16px', background: 'rgba(168,85,247,0.05)' }}>
                    <button
                      onClick={() => setAiExpanded(aiExpanded === vuln.id ? null : vuln.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', width: '100%' }}
                    >
                      <Sparkles size={11} />
                      <span style={{ fontWeight: 600 }}>AI Remediation Insight</span>
                      <Icon name={aiExpanded === vuln.id ? 'chev_u' : 'chev_d'} size={10} color="currentColor" style={{ marginLeft: 'auto' }} />
                    </button>
                    {aiExpanded === vuln.id && (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap', borderLeft: '2px solid rgba(168,85,247,0.4)', paddingLeft: 12, fontFamily: 'var(--font-sans)' }}>
                        {vuln.ai_remediation}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)' }} onClick={() => setShowModal(false)} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 600, background: 'var(--bg-2)', border: ruleStrong, borderRadius: 6, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: rule, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="shield" size={15} color="var(--crit)" />
                <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>
                  {editingVuln ? 'Edit Vulnerability' : 'New Vulnerability'}
                </h2>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0 }}>
                <Icon name="x" size={14} color="currentColor" />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {modalError && (
                <div style={{ fontSize: 12, color: 'var(--crit)', background: 'rgba(232,64,64,0.08)', border: '1px solid rgba(232,64,64,0.3)', borderRadius: 3, padding: '7px 12px', fontFamily: 'var(--font-sans)' }}>
                  {modalError}
                </div>
              )}

              <div>
                <label style={labelStyle}>Title <span style={{ color: 'var(--crit)' }}>*</span></label>
                <input type="text" placeholder="e.g. SQL Injection in /login endpoint" value={formTitle} onChange={e => setFormTitle(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <textarea rows={3} placeholder="Describe the vulnerability and its impact..." value={formDesc} onChange={e => setFormDesc(e.target.value)} style={{ ...inputStyle, resize: 'none' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Severity</label>
                  <select value={formSeverity} onChange={e => setFormSeverity(e.target.value as VulnSeverity)} style={{ ...inputStyle }}>
                    {ALL_SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                {editingVuln && (
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select value={formStatus} onChange={e => setFormStatus(e.target.value as VulnStatus)} style={{ ...inputStyle }}>
                      {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>CVSS Score</label>
                  <input type="text" placeholder="e.g. 9.8" value={formCvss} onChange={e => setFormCvss(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>CVE ID</label>
                  <input type="text" placeholder="e.g. CVE-2024-1234" value={formCve} onChange={e => setFormCve(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Affected Asset</label>
                <input type="text" placeholder="e.g. 192.168.1.10 or https://example.com/login" value={formAsset} onChange={e => setFormAsset(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Remediation Notes</label>
                <textarea rows={3} placeholder="Steps to fix or mitigate this vulnerability..." value={formRemediation} onChange={e => setFormRemediation(e.target.value)} style={{ ...inputStyle, resize: 'none' }} />
              </div>

              <div>
                <label style={labelStyle}>Tags</label>
                <input type="text" placeholder="e.g. web, injection, authentication (comma-separated)" value={formTags} onChange={e => setFormTags(e.target.value)} style={inputStyle} />
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: rule, flexShrink: 0 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '6px 14px', borderRadius: 4, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 4, background: saving ? 'var(--bg)' : 'var(--accent)', color: saving ? 'var(--fg-3)' : 'var(--bg)', border: 'none', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? <Icon name="refresh" size={13} color="currentColor" /> : <Icon name="check" size={13} color="currentColor" />}
                {saving ? 'Saving…' : editingVuln ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Findings Modal */}
      {showImport && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)' }} onClick={() => setShowImport(false)} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 520, background: 'var(--bg-2)', border: ruleStrong, borderRadius: 6, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: rule, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="download" size={14} color="var(--accent)" />
                <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Import from Scan Findings</h2>
              </div>
              <button onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0 }}>
                <Icon name="x" size={14} color="currentColor" />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '14px 20px' }}>
              {findingsList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <AlertTriangle size={32} style={{ margin: '0 auto 8px', color: 'var(--fg-3)', display: 'block' }} />
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>No scan findings found for this project.</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Run a scan first to populate findings.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
                    Select findings to import as vulnerabilities ({selectedFindingIds.size} selected)
                  </p>
                  {findingsList.map(f => {
                    const fs = SEV_STYLE[(f.severity as VulnSeverity) ?? 'info']
                    return (
                      <label
                        key={f.id}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                          borderRadius: 3, border: ruleStrong, cursor: 'pointer',
                          background: selectedFindingIds.has(f.id) ? 'rgba(240,168,58,0.05)' : 'var(--bg)',
                        }}
                      >
                        <input type="checkbox" checked={selectedFindingIds.has(f.id)} onChange={() => toggleFinding(f.id)} style={{ marginTop: 2, accentColor: 'var(--accent)' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 700, textTransform: 'uppercase', fontFamily: 'var(--font-sans)', color: fs.color, background: fs.background, border: fs.border }}>
                              {f.severity}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</span>
                          </div>
                          {f.description && (
                            <p style={{ margin: 0, fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.description}</p>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: rule, flexShrink: 0 }}>
              <button onClick={() => setShowImport(false)} style={{ padding: '6px 14px', borderRadius: 4, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || selectedFindingIds.size === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 4, background: importing || selectedFindingIds.size === 0 ? 'var(--bg)' : 'var(--accent)', color: importing || selectedFindingIds.size === 0 ? 'var(--fg-3)' : 'var(--bg)', border: 'none', fontSize: 12, fontWeight: 700, cursor: importing || selectedFindingIds.size === 0 ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: importing || selectedFindingIds.size === 0 ? 0.5 : 1 }}
              >
                {importing ? <Icon name="refresh" size={13} color="currentColor" /> : <Icon name="download" size={13} color="currentColor" />}
                {importing ? 'Importing…' : `Import ${selectedFindingIds.size > 0 ? selectedFindingIds.size : ''} Selected`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
