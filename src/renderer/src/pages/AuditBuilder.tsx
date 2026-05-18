import { useState, useEffect, useRef } from 'react'
import {
  ShieldAlert, Globe, Server, ClipboardCheck, Cloud,
  CheckSquare, Square, BookMarked, CheckCircle, XCircle,
  AlertTriangle, Gauge, KeyRound,
} from 'lucide-react'
import Icon from '../components/Icon'
import ScriptPreview from '../components/ScriptPreview'
import Terminal, { TerminalHandle } from '../components/Terminal'
import { getProjects, getTargets } from '../api/client'
import type { Project, TargetSummary, ScanCategory } from '../types'
import { getApiBase } from '@/lib/config'

// ── Constants ─────────────────────────────────────────────────────────────────

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--bg)',
  border: ruleStrong, borderRadius: 3, padding: '6px 10px',
  fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--fg-3)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
  fontFamily: 'var(--font-sans)',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 14, flexShrink: 0,
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  name: string
  description: string
  scan_categories: Array<{ category_id: string; config: Record<string, unknown> }>
  schedule: string | null
  last_run: string | null
  next_run: string | null
}

// ── Category icon helper ───────────────────────────────────────────────────────

function CategoryIcon({ id, color, size = 16 }: { id: string; color: string; size?: number }) {
  switch (id) {
    case 'network_discovery': return <Icon name="network" size={size} color={color} />
    case 'vulnerability_scan': return <ShieldAlert size={size} color={color} />
    case 'web_audit': return <Globe size={size} color={color} />
    case 'host_hardening': return <Server size={size} color={color} />
    case 'openscap': return <ClipboardCheck size={size} color={color} />
    case 'cloud_aws': return <Cloud size={size} color={color} />
    case 'log_monitoring': return <Icon name="activity" size={size} color={color} />
    default: return <Icon name="shield" size={size} color={color} />
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AuditBuilder() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [targets, setTargets] = useState<TargetSummary[]>([])
  const [selectedTarget, setSelectedTarget] = useState<string>('')
  const [categories, setCategories] = useState<Record<string, ScanCategory>>({})
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [categoryConfigs, setCategoryConfigs] = useState<Record<string, Record<string, unknown>>>({})
  const [generatedScript, setGeneratedScript] = useState('')
  const [scanId, setScanId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'terminal' | 'compliance'>('preview')

  const [hardeningProfiles, setHardeningProfiles] = useState<Record<string, unknown>[]>([])
  const [selectedHardeningProfile, setSelectedHardeningProfile] = useState('cis_l1')
  const [complianceReport, setComplianceReport] = useState<Record<string, unknown> | null>(null)
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState('')
  const [toolStatus, setToolStatus] = useState<Record<string, { available: boolean }>>({})
  const terminalRef = useRef<TerminalHandle>(null)

  const REMOTE_CATEGORIES = new Set(['host_hardening', 'openscap', 'log_monitoring'])
  const needsSSH = [...selectedCategories].some(c => REMOTE_CATEGORIES.has(c))
  const [sshCredentials, setSshCredentials] = useState<Array<{ id: string; username: string; target_host: string; notes: string }>>([])
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>('')

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [profileName, setProfileName] = useState('')
  const [showProfileSave, setShowProfileSave] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleCron, setScheduleCron] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)

  useEffect(() => {
    loadProjects()
    loadCategories()
    loadToolStatus()
    loadProfiles()
    loadHardeningProfiles()
  }, [])

  async function loadHardeningProfiles() {
    try {
      const res = await fetch(`${getApiBase()}/hardening/profiles`)
      if (res.ok) setHardeningProfiles(await res.json())
    } catch { /* ignore */ }
  }

  async function handleScoreScan() {
    if (!scanId || !selectedProject) return
    setScoring(true); setScoreError('')
    try {
      const res = await fetch(`${getApiBase()}/hardening/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_id: scanId, profile_id: selectedHardeningProfile, project_id: selectedProject }),
      })
      if (!res.ok) { const err = await res.json(); setScoreError(err.detail || 'Scoring failed'); return }
      setComplianceReport(await res.json())
    } catch (e: unknown) {
      setScoreError(e instanceof Error ? e.message : 'Scoring failed')
    } finally { setScoring(false) }
  }

  async function loadProjects() {
    try {
      const data = await getProjects()
      setProjects(data)
      if (data.length > 0) setSelectedProject(data[0].id)
    } catch (err) { console.error('Failed to load projects', err) }
  }

  async function loadCategories() {
    try {
      const res = await fetch(`${getApiBase()}/audit/categories`)
      const data = await res.json()
      setCategories(data)
      const defaults: Record<string, Record<string, unknown>> = {}
      for (const [id, cat] of Object.entries(data as Record<string, ScanCategory>)) {
        defaults[id] = {}
        for (const [key, schema] of Object.entries(cat.config_schema)) {
          defaults[id][key] = schema.default ?? ''
        }
      }
      setCategoryConfigs(defaults)
    } catch (err) { console.error('Failed to load categories', err) }
  }

  async function loadToolStatus() {
    try {
      const res = await fetch(`${getApiBase()}/settings/tools`)
      setToolStatus(await res.json())
    } catch { /* optional */ }
  }

  async function loadProfiles() {
    try {
      const res = await fetch(`${getApiBase()}/profiles`)
      if (res.ok) {
        const data = await res.json()
        const parsed = data.map((p: Record<string, unknown>) => ({
          ...p,
          scan_categories: typeof p.scan_categories === 'string'
            ? JSON.parse(p.scan_categories as string)
            : p.scan_categories,
        }))
        setProfiles(parsed)
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (selectedProject) {
      getTargets(selectedProject)
        .then(data => {
          setTargets(data)
          if (data.length > 0) setSelectedTarget(data[0].id)
          else setSelectedTarget('')
        })
        .catch(err => console.error('Failed to load targets', err))

      fetch(`${getApiBase()}/credentials/keys?project_id=${selectedProject}`)
        .then(r => r.ok ? r.json() : [])
        .then(setSshCredentials)
        .catch(() => {})
    }
  }, [selectedProject])

  function toggleCategory(id: string) {
    setSelectedCategories(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function updateConfig(categoryId: string, key: string, value: unknown) {
    setCategoryConfigs(prev => ({
      ...prev,
      [categoryId]: { ...prev[categoryId], [key]: value },
    }))
  }

  function applyProfile(profileId: string) {
    const profile = profiles.find(p => p.id === profileId)
    if (!profile) return
    const newSelected = new Set<string>()
    const newConfigs: Record<string, Record<string, unknown>> = { ...categoryConfigs }
    for (const cat of profile.scan_categories) {
      newSelected.add(cat.category_id)
      newConfigs[cat.category_id] = { ...newConfigs[cat.category_id], ...cat.config }
    }
    setSelectedCategories(newSelected)
    setCategoryConfigs(newConfigs)
    setSelectedProfileId('')
  }

  async function handleSaveSchedule() {
    if (!selectedProfileId) return
    setSavingSchedule(true)
    await fetch(`${getApiBase()}/profiles/${selectedProfileId}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cron: scheduleCron || null, project_id: selectedProject || null, target_id: selectedTarget || null }),
    })
    setSavingSchedule(false)
    setShowSchedule(false)
    await loadProfiles()
  }

  async function handleClearSchedule() {
    if (!selectedProfileId) return
    await fetch(`${getApiBase()}/profiles/${selectedProfileId}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cron: null }),
    })
    await loadProfiles()
  }

  async function handleSaveProfile() {
    if (!profileName.trim()) return
    setSavingProfile(true)
    try {
      await fetch(`${getApiBase()}/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName.trim(),
          description: `Saved from Audit Builder — ${Array.from(selectedCategories).join(', ')}`,
          scan_categories: Array.from(selectedCategories).map(id => ({
            category_id: id,
            config: categoryConfigs[id] || {},
          })),
        }),
      })
      setProfileName('')
      setShowProfileSave(false)
      await loadProfiles()
    } catch (err) { console.error('Failed to save profile', err) }
    finally { setSavingProfile(false) }
  }

  async function handleGenerate() {
    if (!selectedProject || !selectedTarget || selectedCategories.size === 0) return
    setGenerating(true)
    try {
      const scanCategories = Array.from(selectedCategories).map(id => ({
        category_id: id, config: categoryConfigs[id] || {},
      }))
      const res = await fetch(`${getApiBase()}/audit/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: selectedProject, target_id: selectedTarget,
          scan_categories: scanCategories,
          credential_id: needsSSH && selectedCredentialId ? selectedCredentialId : null,
        }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail ?? `HTTP ${res.status}`) }
      const data = await res.json()
      setGeneratedScript(data.script)
      setScanId(data.scan_id)
      setComplianceReport(null)
      setActiveTab('preview')
    } catch (err) { console.error('Script generation failed', err) }
    finally { setGenerating(false) }
  }

  async function handleDownload() {
    if (!scanId) return
    const res = await fetch(`${getApiBase()}/audit/script/${scanId}/download`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `seraph_audit_${scanId.slice(0, 8)}.sh`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleRunOnServer() {
    if (!scanId || !generatedScript) return
    setActiveTab('terminal')
    setTimeout(() => { terminalRef.current?.connect(scanId, generatedScript) }, 100)
  }

  function renderConfigField(categoryId: string, key: string, schema: ScanCategory['config_schema'][string]) {
    const value = categoryConfigs[categoryId]?.[key]

    if (schema.type === 'select') {
      return (
        <select
          style={{ ...inputStyle, fontSize: 12 }}
          value={value as string}
          onChange={e => updateConfig(categoryId, key, e.target.value)}
        >
          {(schema.options ?? []).map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )
    }

    if (schema.type === 'multiselect') {
      const selected: string[] = Array.isArray(value) ? value as string[] : []
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(schema.options ?? []).map((opt: string) => {
            const isSel = selected.includes(opt)
            return (
              <button
                key={opt}
                onClick={() => {
                  const next = isSel ? selected.filter(s => s !== opt) : [...selected, opt]
                  updateConfig(categoryId, key, next)
                }}
                style={{
                  padding: '3px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  background: isSel ? 'rgba(240,168,58,0.12)' : 'var(--bg)',
                  border: isSel ? '1px solid rgba(240,168,58,0.35)' : ruleStrong,
                  color: isSel ? 'var(--accent)' : 'var(--fg-3)',
                }}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )
    }

    if (schema.type === 'boolean') {
      return (
        <button
          onClick={() => updateConfig(categoryId, key, !value)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--fg-2)' }}
        >
          {value
            ? <CheckSquare size={15} color="var(--accent)" />
            : <Square size={15} color="var(--fg-3)" />}
          {value ? 'Enabled' : 'Disabled'}
        </button>
      )
    }

    return (
      <input
        type="text"
        style={inputStyle}
        value={(value as string) || ''}
        placeholder={schema.placeholder || ''}
        onChange={e => updateConfig(categoryId, key, e.target.value)}
      />
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 14, overflow: 'hidden', padding: 16, background: 'var(--bg)', boxSizing: 'border-box' }}>

      {/* ── Left Panel ─────────────────────────────────────────────────────── */}
      <div style={{ width: 296, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>

        {/* Target Selection */}
        <div style={cardStyle}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)' }}>
            Target Selection
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={labelStyle}>Project</label>
              <select style={inputStyle} value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
                <option value="">Select project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Target</label>
              <select
                style={{ ...inputStyle, opacity: targets.length === 0 ? 0.5 : 1 }}
                value={selectedTarget}
                onChange={e => setSelectedTarget(e.target.value)}
                disabled={targets.length === 0}
              >
                <option value="">Select target…</option>
                {targets.map(t => <option key={t.id} value={t.id}>{t.hostname_or_ip}</option>)}
              </select>
            </div>

            {needsSSH && (
              <div>
                <label style={{ ...labelStyle, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <KeyRound size={10} /> SSH Key Credential
                </label>
                {sshCredentials.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
                    No SSH keys in vault for this project.
                  </p>
                ) : (
                  <select style={inputStyle} value={selectedCredentialId} onChange={e => setSelectedCredentialId(e.target.value)}>
                    <option value="">Run locally (no SSH)</option>
                    {sshCredentials.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.username}@{c.target_host || 'any'}{c.notes ? ` — ${c.notes}` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {selectedCredentialId && (
                  <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-sans)', opacity: 0.7 }}>
                    Script will run on the target via SSH
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Load Profile */}
        {profiles.length > 0 && (
          <div style={cardStyle}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)' }}>
              <BookMarked size={12} color="var(--fg-3)" /> Load Profile
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                style={{ ...inputStyle, flex: 1 }}
                value={selectedProfileId}
                onChange={e => { setSelectedProfileId(e.target.value); setShowSchedule(false) }}
              >
                <option value="">Select profile…</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.schedule ? '⏰ ' : ''}{p.name}</option>
                ))}
              </select>
              <button
                onClick={() => applyProfile(selectedProfileId)}
                disabled={!selectedProfileId}
                style={{ padding: '6px 10px', borderRadius: 3, background: 'rgba(240,168,58,0.1)', border: '1px solid rgba(240,168,58,0.3)', color: 'var(--accent)', cursor: selectedProfileId ? 'pointer' : 'not-allowed', opacity: selectedProfileId ? 1 : 0.4 }}
              >
                <Icon name="chev_r" size={13} color="var(--accent)" />
              </button>
              <button
                onClick={() => {
                  const p = profiles.find(p => p.id === selectedProfileId)
                  setScheduleCron(p?.schedule || '')
                  setShowSchedule(s => !s)
                }}
                disabled={!selectedProfileId}
                title="Schedule"
                style={{ padding: '6px 10px', borderRadius: 3, background: 'none', border: ruleStrong, color: 'var(--fg-3)', cursor: selectedProfileId ? 'pointer' : 'not-allowed', opacity: selectedProfileId ? 1 : 0.4 }}
              >
                <Icon name="clock" size={13} color="var(--fg-3)" />
              </button>
            </div>

            {showSchedule && selectedProfileId && (() => {
              const prof = profiles.find(p => p.id === selectedProfileId)
              return (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: rule }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--fg-3)', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)' }}>
                      <Icon name="clock" size={10} color="var(--fg-3)" /> Schedule (cron)
                    </span>
                    <button onClick={() => setShowSchedule(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Icon name="x" size={11} color="var(--fg-3)" />
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {[['Daily 2am', '0 2 * * *'], ['Weekly Sun', '0 2 * * 0'], ['Hourly', '0 * * * *']].map(([label, expr]) => (
                      <button
                        key={label}
                        onClick={() => setScheduleCron(expr)}
                        style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'none', border: ruleStrong, color: 'var(--fg-3)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    value={scheduleCron}
                    onChange={e => setScheduleCron(e.target.value)}
                    placeholder="0 2 * * *"
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                  />
                  {prof?.last_run && (
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
                      Last run: {new Date(prof.last_run).toLocaleString()}
                    </p>
                  )}
                  {prof?.next_run && (
                    <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
                      Next run: {new Date(prof.next_run).toLocaleString()}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      onClick={handleSaveSchedule}
                      disabled={savingSchedule || !scheduleCron}
                      style={{ flex: 1, padding: '5px 0', borderRadius: 3, background: 'rgba(240,168,58,0.1)', border: '1px solid rgba(240,168,58,0.3)', fontSize: 11, color: 'var(--accent)', cursor: savingSchedule || !scheduleCron ? 'not-allowed' : 'pointer', opacity: savingSchedule || !scheduleCron ? 0.5 : 1, fontFamily: 'var(--font-sans)' }}
                    >
                      {savingSchedule ? 'Saving…' : 'Save'}
                    </button>
                    {prof?.schedule && (
                      <button
                        onClick={handleClearSchedule}
                        style={{ padding: '5px 10px', borderRadius: 3, background: 'rgba(232,64,64,0.08)', border: '1px solid rgba(232,64,64,0.3)', fontSize: 11, color: 'var(--crit)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Scan Categories */}
        <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: ruleStrong, flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)' }}>
              Scan Categories
            </p>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {Object.entries(categories).map(([id, cat]) => {
              const isSelected = selectedCategories.has(id)
              const isExpanded = expandedCategory === id
              const toolsAvailable = cat.tools.length === 0 || cat.tools.some(t => toolStatus[t]?.available)
              const iconColor = isSelected ? 'var(--accent)' : 'var(--fg-3)'

              return (
                <div key={id} style={{ opacity: toolsAvailable ? 1 : 0.45, borderBottom: rule }}>
                  <div
                    onClick={() => toggleCategory(id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(240,168,58,0.04)' : 'transparent',
                      borderLeft: isSelected ? '2px solid rgba(240,168,58,0.5)' : '2px solid transparent',
                    }}
                  >
                    <div style={{ flexShrink: 0, color: isSelected ? 'var(--accent)' : 'var(--fg-3)' }}>
                      {isSelected ? <CheckSquare size={14} color="var(--accent)" /> : <Square size={14} color="var(--fg-3)" />}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <CategoryIcon id={id} color={iconColor} size={15} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>{cat.name}</p>
                      <p style={{ margin: 0, fontSize: 10, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>{cat.description}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setExpandedCategory(isExpanded ? null : id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}
                    >
                      <Icon name={isExpanded ? 'chev_u' : 'chev_d'} size={13} color="var(--fg-3)" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.15)', borderTop: rule }}>
                      {/* Control mappings */}
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ margin: '0 0 6px', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Control Mappings</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {cat.control_mappings.map(m => (
                            <span
                              key={`${m.framework}-${m.control_id}`}
                              title={m.title}
                              style={{ fontSize: 10, padding: '1px 7px', borderRadius: 3, color: 'var(--fg-3)', border: ruleStrong, background: 'var(--bg)', fontFamily: 'var(--font-mono)' }}
                            >
                              {m.framework === 'NIST_800_53' ? 'NIST ' : 'CIS '}{m.control_id}
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* Config fields */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {Object.entries(cat.config_schema).map(([key, schema]) => (
                          <div key={key}>
                            <label style={labelStyle}>{key.replace(/_/g, ' ')}</label>
                            {renderConfigField(id, key, schema)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={generating || selectedCategories.size === 0 || !selectedTarget}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 0', borderRadius: 4, fontSize: 13, fontWeight: 600,
            fontFamily: 'var(--font-sans)', cursor: generating || selectedCategories.size === 0 || !selectedTarget ? 'not-allowed' : 'pointer',
            background: generating || selectedCategories.size === 0 || !selectedTarget ? 'var(--bg-2)' : 'rgba(240,168,58,0.12)',
            border: '1px solid rgba(240,168,58,0.35)',
            color: generating || selectedCategories.size === 0 || !selectedTarget ? 'var(--fg-3)' : 'var(--accent)',
            flexShrink: 0,
          }}
        >
          <Icon name={generating ? 'refresh' : 'play'} size={15} color="currentColor" />
          {generating ? 'Generating…' : 'Generate Script'}
        </button>

        {/* Save Profile */}
        {selectedCategories.size > 0 && (
          <div style={{ ...cardStyle }}>
            {!showProfileSave ? (
              <button
                onClick={() => setShowProfileSave(true)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}
              >
                <BookMarked size={13} color="var(--fg-3)" /> Save as Profile
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>Profile Name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  placeholder="e.g. Linux Full Audit"
                  style={inputStyle}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveProfile() }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => { setShowProfileSave(false); setProfileName('') }}
                    style={{ flex: 1, padding: '5px 0', borderRadius: 3, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={savingProfile || !profileName.trim()}
                    style={{ flex: 1, padding: '5px 0', borderRadius: 3, background: 'rgba(240,168,58,0.1)', border: '1px solid rgba(240,168,58,0.3)', fontSize: 12, color: 'var(--accent)', cursor: savingProfile || !profileName.trim() ? 'not-allowed' : 'pointer', opacity: savingProfile || !profileName.trim() ? 0.5 : 1, fontFamily: 'var(--font-sans)', fontWeight: 600 }}
                  >
                    {savingProfile ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right Panel ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: 12 }}>

        {/* Tab Bar + Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 4 }}>
            {(['preview', 'terminal', 'compliance'] as const).map(tab => {
              const isActive = activeTab === tab
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '5px 14px', borderRadius: 3, fontSize: 12, fontWeight: 500,
                    fontFamily: 'var(--font-sans)', cursor: 'pointer', textTransform: 'capitalize',
                    background: isActive ? 'rgba(240,168,58,0.12)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--fg-3)',
                    border: isActive ? '1px solid rgba(240,168,58,0.3)' : '1px solid transparent',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {tab === 'compliance' && <Icon name="shield" size={11} color="currentColor" />}
                  {tab === 'compliance' ? 'Compliance' : tab}
                </button>
              )
            })}
          </div>

          {generatedScript && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleDownload}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 4, background: 'var(--bg-2)', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              >
                <Icon name="download" size={13} color="currentColor" /> Download
              </button>
              <button
                onClick={handleRunOnServer}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 4, background: 'rgba(84,175,97,0.1)', border: '1px solid rgba(84,175,97,0.35)', fontSize: 12, fontWeight: 600, color: 'var(--ok)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              >
                <Icon name="play" size={13} color="var(--ok)" /> Run on Server
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {activeTab === 'preview' ? (
            <div style={{ height: '100%' }}>
              <ScriptPreview script={generatedScript} className="h-full" />
            </div>
          ) : activeTab === 'terminal' ? (
            <div style={{ height: '100%', border: ruleStrong, borderRadius: 4, overflow: 'hidden' }}>
              <Terminal ref={terminalRef} className="h-full" />
            </div>
          ) : (
            /* ── Compliance Tab ─────────────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }}>
              {/* Profile Selector */}
              <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 16 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)' }}>
                  <Icon name="shield" size={14} color="var(--accent)" /> Hardening Profile
                </h3>
                <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
                  Select a compliance framework, then run an audit with the recommended categories and click Score.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                  {hardeningProfiles.map(p => {
                    const profile = p as Record<string, unknown>
                    const isActive = selectedHardeningProfile === profile.id
                    return (
                      <button
                        key={String(profile.id)}
                        onClick={() => setSelectedHardeningProfile(String(profile.id))}
                        style={{
                          padding: 12, textAlign: 'left', borderRadius: 4, cursor: 'pointer',
                          background: isActive ? 'rgba(240,168,58,0.06)' : 'var(--bg)',
                          border: isActive ? '1px solid rgba(240,168,58,0.35)' : ruleStrong,
                        }}
                      >
                        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>{String(profile.name)}</p>
                        <p style={{ margin: '0 0 8px', fontSize: 10, color: 'var(--fg-3)', lineHeight: 1.4, fontFamily: 'var(--font-sans)' }}>{String(profile.description)}</p>
                        <p style={{ margin: 0, fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                          {Array.isArray(profile.controls) ? profile.controls.length : 0} controls
                        </p>
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={handleScoreScan}
                    disabled={scoring || !scanId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px', borderRadius: 4,
                      background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)',
                      fontSize: 12, fontWeight: 600, color: '#60a5fa',
                      cursor: scoring || !scanId ? 'not-allowed' : 'pointer',
                      opacity: scoring || !scanId ? 0.5 : 1, fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {scoring ? <Icon name="refresh" size={13} color="currentColor" /> : <Gauge size={13} color="currentColor" />}
                    {scoring ? 'Scoring…' : 'Score Scan'}
                  </button>
                  {!scanId && <span style={{ fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Generate and run a scan first, then score it.</span>}
                  {scoreError && <span style={{ fontSize: 12, color: 'var(--crit)', fontFamily: 'var(--font-sans)' }}>{scoreError}</span>}
                </div>
              </div>

              {/* Score Results */}
              {complianceReport && (() => {
                const report = complianceReport as Record<string, unknown>
                const score = Number(report.overall_score ?? 0)
                const passCount = Number(report.pass_count ?? 0)
                const failCount = Number(report.fail_count ?? 0)
                const controls = Array.isArray(report.controls) ? report.controls as Record<string, unknown>[] : []
                const warnings = Array.isArray(report.warnings) ? report.warnings as string[] : []
                const suggestions = Array.isArray(report.suggestions) ? report.suggestions as string[] : []
                const barColor = score >= 70 ? 'var(--ok)' : score >= 50 ? 'var(--accent)' : 'var(--crit)'

                return (
                  <>
                    {/* Score Card */}
                    <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <div>
                          <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>{String(report.profile ?? '')}</p>
                          <p style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
                            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--fg)' }}>{score}</span>
                            <span style={{ fontSize: 18, color: 'var(--fg-3)' }}>/100</span>
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Hardening Score</p>
                        </div>
                        <div style={{ display: 'flex', gap: 24 }}>
                          <div style={{ textAlign: 'center' }}>
                            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ok)', fontFamily: 'var(--font-mono)' }}>{passCount}</p>
                            <p style={{ margin: 0, fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Passed</p>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--crit)', fontFamily: 'var(--font-mono)' }}>{failCount}</p>
                            <p style={{ margin: 0, fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Failed</p>
                          </div>
                        </div>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, background: barColor, width: `${score}%`, transition: 'width 0.7s ease' }} />
                      </div>
                    </div>

                    {/* Controls */}
                    <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 14 }}>
                      <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)' }}>Controls</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {controls.map(ctrl => {
                          const isPassed = ctrl.status === 'pass'
                          return (
                            <div key={String(ctrl.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 3, background: 'var(--bg)' }}>
                              {isPassed
                                ? <CheckCircle size={12} color="var(--ok)" />
                                : <XCircle size={12} color="var(--crit)" />}
                              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', flexShrink: 0, width: 56 }}>{String(ctrl.id)}</span>
                              <span style={{ flex: 1, fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>{String(ctrl.title)}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: isPassed ? 'var(--ok)' : 'var(--crit)', fontFamily: 'var(--font-sans)' }}>
                                {String(ctrl.status).toUpperCase()}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Warnings */}
                    {warnings.length > 0 && (
                      <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 14 }}>
                        <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)' }}>
                          <AlertTriangle size={11} color="var(--accent)" /> Warnings ({warnings.length})
                        </p>
                        <div style={{ maxHeight: 192, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {warnings.map((w, i) => (
                            <p key={i} style={{ margin: 0, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', opacity: 0.8, paddingBottom: 4, borderBottom: rule }}>{w}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggestions */}
                    {suggestions.length > 0 && (
                      <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 14 }}>
                        <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)' }}>Suggestions</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {suggestions.map((s, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--fg-2)', fontFamily: 'var(--font-sans)' }}>
                              <Icon name="chev_r" size={11} color="var(--accent)" />
                              <span>{s}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
