import { useState, useEffect } from 'react'
import Icon from '../components/Icon'
import type { Credential, CredType, CredSource, Project } from '../types/index'
import { getApiBase } from '@/lib/config'

const CRED_TYPE_STYLE: Record<CredType, { color: string; background: string; border: string }> = {
  password: { color: 'var(--accent)', background: 'rgba(240,168,58,0.08)',  border: '1px solid rgba(240,168,58,0.25)' },
  hash:     { color: '#a855f7',      background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)' },
  key:      { color: 'var(--accent)', background: 'rgba(240,168,58,0.08)', border: '1px solid rgba(240,168,58,0.25)' },
  token:    { color: 'var(--med)',   background: 'rgba(240,168,58,0.06)', border: '1px solid rgba(240,168,58,0.15)' },
  other:    { color: 'var(--fg-3)', background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.2)' },
}

const SOURCE_COLOR: Record<CredSource, string> = {
  manual:      'var(--fg-3)',
  c2_loot:     'var(--crit)',
  osint:       'var(--accent)',
  brute_force: '#f97316',
}

const SOURCE_LABELS: Record<CredSource, string> = {
  manual:      'Manual',
  c2_loot:     'C2 Loot',
  osint:       'OSINT',
  brute_force: 'Brute Force',
}

const EMPTY_FORM = {
  username: '',
  secret: '',
  cred_type: 'password' as CredType,
  source: 'manual' as CredSource,
  target_host: '',
  notes: '',
}

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

export default function CredentialVault() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterSource, setFilterSource] = useState<string>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`${getApiBase()}/projects`)
      .then(r => r.json())
      .then(data => {
        setProjects(data)
        if (data.length > 0) setSelectedProject(data[0].id)
      })
  }, [])

  useEffect(() => {
    if (selectedProject) loadCredentials()
  }, [selectedProject])

  async function loadCredentials() {
    const res = await fetch(`${getApiBase()}/credentials?project_id=${selectedProject}`)
    setCredentials(await res.json())
  }

  async function handleSave() {
    if (!selectedProject) return
    setSaving(true)
    await fetch(`${getApiBase()}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, project_id: selectedProject }),
    })
    setSaving(false)
    setShowModal(false)
    setForm(EMPTY_FORM)
    loadCredentials()
  }

  async function handleDelete(id: string) {
    await fetch(`${getApiBase()}/credentials/${id}`, { method: 'DELETE' })
    setCredentials(prev => prev.filter(c => c.id !== id))
  }

  function toggleReveal(id: string) {
    setRevealedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const filtered = credentials.filter(c => {
    if (filterType !== 'all' && c.cred_type !== filterType) return false
    if (filterSource !== 'all' && c.source !== filterSource) return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.username.toLowerCase().includes(q) && !c.target_host.toLowerCase().includes(q) && !c.notes.toLowerCase().includes(q)) return false
    }
    return true
  })

  const selStyle: React.CSSProperties = {
    background: 'var(--bg-2)',
    border: ruleStrong,
    borderRadius: 3,
    padding: '4px 8px',
    fontSize: 12,
    color: 'var(--fg)',
    fontFamily: 'var(--font-sans)',
    outline: 'none',
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, height: '100%', minHeight: 0, background: 'var(--bg)', color: 'var(--fg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)' }}>
            <Icon name="key" size={16} color="var(--accent)" />
            Credential Vault
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
            Harvested credentials, hashes, keys, and tokens
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={!selectedProject}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 4,
            background: selectedProject ? 'var(--accent)' : 'var(--bg-2)',
            color: selectedProject ? 'var(--bg)' : 'var(--fg-3)',
            border: 'none', fontSize: 12, fontWeight: 600,
            fontFamily: 'var(--font-sans)', cursor: selectedProject ? 'pointer' : 'not-allowed',
            opacity: selectedProject ? 1 : 0.5,
          }}
        >
          <Icon name="plus" size={13} color="currentColor" /> Add Credential
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={selStyle}>
          <option value="">Select project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selStyle}>
          <option value="all">All Types</option>
          {(['password','hash','key','token','other'] as CredType[]).map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>

        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={selStyle}>
          <option value="all">All Sources</option>
          {(['manual','c2_loot','osint','brute_force'] as CredSource[]).map(s => (
            <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...selStyle, width: 160 }}
        />

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
          {filtered.length} credential{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 180, color: 'var(--fg-3)' }}>
            <Icon name="shield" size={36} color="var(--rule-strong)" />
            <p style={{ margin: '12px 0 0', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
              {credentials.length === 0 ? 'No credentials stored yet' : 'No credentials match current filters'}
            </p>
          </div>
        ) : (
          <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '110px 150px 1fr 110px 130px 80px',
              borderBottom: rule,
              padding: '8px 16px',
            }}>
              {['Type', 'Username', 'Secret', 'Source', 'Target Host', 'Actions'].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)' }}>{h}</div>
              ))}
            </div>

            {filtered.map((cred, idx) => {
              const revealed = revealedIds.has(cred.id)
              const typeStyle = CRED_TYPE_STYLE[cred.cred_type]
              return (
                <div
                  key={cred.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 150px 1fr 110px 130px 80px',
                    borderBottom: idx < filtered.length - 1 ? rule : 'none',
                    padding: '10px 16px',
                    alignItems: 'center',
                  }}
                >
                  {/* Type badge */}
                  <div>
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 10,
                      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                      fontFamily: 'var(--font-sans)',
                      color: typeStyle.color, background: typeStyle.background, border: typeStyle.border,
                    }}>
                      {cred.cred_type}
                    </span>
                  </div>

                  {/* Username */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cred.username || '—'}
                    </span>
                    {cred.username && (
                      <button
                        onClick={() => copyText(cred.username, `u-${cred.id}`)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === `u-${cred.id}` ? 'var(--ok)' : 'var(--fg-3)', padding: 0, flexShrink: 0 }}
                      >
                        <Icon name={copied === `u-${cred.id}` ? 'check' : 'copy'} size={11} color="currentColor" />
                      </button>
                    )}
                  </div>

                  {/* Secret */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: 'var(--fg-2)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {revealed ? cred.secret : '••••••••••••'}
                    </span>
                    <button
                      onClick={() => toggleReveal(cred.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, flexShrink: 0 }}
                    >
                      <Icon name={revealed ? 'eye_off' : 'eye'} size={11} color="currentColor" />
                    </button>
                    {cred.secret && (
                      <button
                        onClick={() => copyText(cred.secret, `s-${cred.id}`)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === `s-${cred.id}` ? 'var(--ok)' : 'var(--fg-3)', padding: 0, flexShrink: 0 }}
                      >
                        <Icon name={copied === `s-${cred.id}` ? 'check' : 'copy'} size={11} color="currentColor" />
                      </button>
                    )}
                  </div>

                  {/* Source */}
                  <div style={{ fontSize: 11, fontWeight: 500, color: SOURCE_COLOR[cred.source], fontFamily: 'var(--font-sans)' }}>
                    {SOURCE_LABELS[cred.source]}
                  </div>

                  {/* Target Host */}
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cred.target_host || '—'}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => handleDelete(cred.id)}
                      title="Delete"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--crit)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-3)')}
                    >
                      <Icon name="trash" size={13} color="currentColor" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Credential Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)' }}>
          <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 6, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <h2 style={{ margin: '0 0 18px', fontSize: 14, fontWeight: 700, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)' }}>
              <Icon name="key" size={14} color="var(--accent)" /> Add Credential
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: 'var(--fg-3)', marginBottom: 5, fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</label>
                  <select value={form.cred_type} onChange={e => setForm(f => ({ ...f, cred_type: e.target.value as CredType }))} style={{ ...inputStyle }}>
                    {(['password','hash','key','token','other'] as CredType[]).map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: 'var(--fg-3)', marginBottom: 5, fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Source</label>
                  <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value as CredSource }))} style={{ ...inputStyle }}>
                    {(['manual','c2_loot','osint','brute_force'] as CredSource[]).map(s => (
                      <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--fg-3)', marginBottom: 5, fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Username / Account</label>
                <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} style={inputStyle} placeholder="administrator" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--fg-3)', marginBottom: 5, fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Secret (password / hash / key)</label>
                <input type="password" value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} style={inputStyle} placeholder="••••••••" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--fg-3)', marginBottom: 5, fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Target Host</label>
                <input value={form.target_host} onChange={e => setForm(f => ({ ...f, target_host: e.target.value }))} style={inputStyle} placeholder="192.168.1.10" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--fg-3)', marginBottom: 5, fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} rows={2} placeholder="Found in /etc/shadow, domain admin..." />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                onClick={() => { setShowModal(false); setForm(EMPTY_FORM) }}
                style={{ flex: 1, padding: '7px 0', borderRadius: 4, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.secret}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 4,
                  background: saving || !form.secret ? 'var(--bg-2)' : 'var(--accent)',
                  color: saving || !form.secret ? 'var(--fg-3)' : 'var(--bg)',
                  border: 'none', fontSize: 12, fontWeight: 600,
                  fontFamily: 'var(--font-sans)', cursor: saving || !form.secret ? 'not-allowed' : 'pointer',
                  opacity: saving || !form.secret ? 0.5 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save Credential'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
