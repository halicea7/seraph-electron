import { useState, useEffect, useRef } from 'react'
import Icon from '../components/Icon'
import Terminal, { TerminalHandle } from '../components/Terminal'
import type { Credential } from '../types/index'
import { getApiBase, getWsBase } from '@/lib/config'
import { useAppStore } from '@/stores/appStore'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolInfo {
  available: boolean
}

interface ToolsResponse {
  hashcat: ToolInfo
  john: ToolInfo
  hash_types: { id: string; label: string }[]
  john_formats: { id: string; label: string }[]
  wordlists: string[]
}

interface WordlistBundle {
  id: string
  label: string
  description: string
  dest: string
  installed: boolean
}

interface CrackedPair {
  hash: string
  plain: string
}

interface Job {
  id: string
  name: string
  mode: string
  hashes: number
  state: 'active' | 'queued' | 'done' | 'failed'
  recovered: number
  progress: number
}

// ── Static data ───────────────────────────────────────────────────────────────

const ATTACK_MODES = [
  { id: '0', label: 'Wordlist (dictionary)' },
  { id: '3', label: 'Brute-force (mask)' },
  { id: '6', label: 'Hybrid (wordlist + mask)' },
]

const STATIC_JOBS: Job[] = [
  { id: '1', name: 'ntlm-spray-01', mode: 'WL', hashes: 412,  state: 'active',  recovered: 37,  progress: 62  },
  { id: '2', name: 'md5-dump-web',  mode: 'BF', hashes: 288,  state: 'queued',  recovered: 0,   progress: 0   },
  { id: '3', name: 'sha1-old-db',   mode: 'WL', hashes: 97,   state: 'done',    recovered: 54,  progress: 100 },
  { id: '4', name: 'ntlmv2-cap',    mode: 'WL', hashes: 487,  state: 'queued',  recovered: 0,   progress: 0   },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

const selStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--bg)',
  border: ruleStrong,
  borderRadius: 3,
  padding: '5px 8px',
  fontSize: 12,
  color: 'var(--fg)',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rule">
      <div className="sec-h" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="title">{title}</span>
        {right && <span>{right}</span>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>{label}</label>
      {children}
    </div>
  )
}

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

function StatePill({ state }: { state: Job['state'] }) {
  const map: Record<Job['state'], { color: string; bg: string; border: string }> = {
    active: { color: 'var(--ok)',     bg: 'rgba(84,175,97,0.1)',   border: 'rgba(84,175,97,0.3)' },
    queued: { color: 'var(--accent)', bg: 'rgba(240,168,58,0.08)', border: 'rgba(240,168,58,0.25)' },
    done:   { color: 'var(--fg-3)',   bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)' },
    failed: { color: 'var(--crit)',   bg: 'rgba(232,64,64,0.08)',  border: 'rgba(232,64,64,0.3)'  },
  }
  const s = map[state]
  return (
    <span className="mono" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '1px 6px', color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {state}
    </span>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
      </div>
      <span className="mono tnum" style={{ fontSize: 10, color: 'var(--fg-3)', width: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PasswordAuditing() {
  const { selectedProject: sp } = useAppStore()
  const projectId = sp?.id ?? ''

  const [tools, setTools] = useState<ToolsResponse | null>(null)
  const [tool, setTool] = useState<'hashcat' | 'john'>('hashcat')
  const [hashType, setHashType] = useState('0')
  const [attackMode, setAttackMode] = useState('0')
  const [wordlist, setWordlist] = useState('')
  const [customWordlist, setCustomWordlist] = useState('')
  const [mask, setMask] = useState('?d?d?d?d?d?d?d?d')
  const [hashInput, setHashInput] = useState('')
  const [running, setRunning] = useState(false)
  const [, setJobId] = useState<string | null>(null)

  const [vaultCreds, setVaultCreds] = useState<Credential[]>([])
  const [selectedCredIds, setSelectedCredIds] = useState<string[]>([])

  const [results, setResults] = useState<{ cracked: number; pairs: CrackedPair[]; vault_updated: number } | null>(null)
  const [savedPairs, setSavedPairs] = useState<Set<string>>(new Set())

  const [bundles, setBundles] = useState<WordlistBundle[]>([])
  const [installing, setInstalling] = useState<string | null>(null)
  const [installLog, setInstallLog] = useState<Record<string, string>>({})

  const terminalRef = useRef<TerminalHandle>(null)

  // KPI state (derived from static jobs for UI)
  const recovered = STATIC_JOBS.reduce((a, j) => a + j.recovered, 0)
  const inQueue   = STATIC_JOBS.filter(j => j.state === 'queued').reduce((a, j) => a + j.hashes, 0)
  const activeCount = STATIC_JOBS.filter(j => j.state === 'active').length

  function loadBundles() {
    fetch(`${getApiBase()}/cracking/wordlists/available`).then(r => r.json()).then(setBundles)
  }

  function loadTools() {
    fetch(`${getApiBase()}/cracking/tools`).then(r => r.json()).then(data => {
      setTools(data)
      if (data.wordlists.length > 0) setWordlist(data.wordlists[0])
    })
  }

  useEffect(() => {
    loadTools()
    loadBundles()
  }, [])

  useEffect(() => {
    if (projectId) {
      fetch(`${getApiBase()}/credentials?project_id=${projectId}`)
        .then(r => r.json())
        .then((data: Credential[]) => setVaultCreds(data.filter(c => c.cred_type === 'hash')))
    }
  }, [projectId])

  function installBundle(bundleId: string) {
    if (installing) return
    setInstalling(bundleId)
    setInstallLog(prev => ({ ...prev, [bundleId]: '' }))
    const ws = new WebSocket(`${getWsBase()}/ws/wordlists/install/${bundleId}`)
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'stdout' || msg.type === 'stderr') {
        setInstallLog(prev => ({ ...prev, [bundleId]: (prev[bundleId] || '') + msg.data }))
      } else if (msg.type === 'done') {
        setInstalling(null)
        loadBundles()
        loadTools()
      } else if (msg.type === 'error') {
        setInstallLog(prev => ({ ...prev, [bundleId]: (prev[bundleId] || '') + `\n[ERROR] ${msg.data}` }))
        setInstalling(null)
      }
    }
    ws.onerror = () => setInstalling(null)
  }

  function loadFromVault() {
    const selected = vaultCreds.filter(c => selectedCredIds.includes(c.id))
    if (selected.length === 0) return
    setHashInput(selected.map(c => c.secret).join('\n'))
  }

  function toggleCredId(id: string) {
    setSelectedCredIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function getHashes(): string[] {
    return hashInput.split('\n').map(h => h.trim()).filter(Boolean)
  }

  function buildCommandPreview(): string {
    const hashes = getHashes()
    if (!hashes.length) return '# paste hashes above'
    const wl = customWordlist || wordlist || '/path/to/wordlist.txt'
    if (tool === 'hashcat') {
      const atk = attackMode === '3' ? mask : wl
      return `hashcat -m ${hashType} -a ${attackMode} hashes.txt ${atk} --outfile cracked.txt --force`
    } else {
      const fmtFlag = hashType !== 'auto' ? `--format=${hashType} ` : ''
      return `john ${fmtFlag}--wordlist=${wl} hashes.txt`
    }
  }

  async function handleRun() {
    const hashes = getHashes()
    if (!hashes.length) { alert('Paste at least one hash.'); return }
    const wl = customWordlist || wordlist
    if (!wl && attackMode !== '3') { alert('Select or enter a wordlist.'); return }

    setRunning(true)
    setResults(null)

    const res = await fetch(`${getApiBase()}/cracking/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        tool,
        hashes,
        hash_type: hashType,
        attack_mode: attackMode,
        wordlist: wl,
        mask,
        credential_ids: selectedCredIds,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      alert(err.detail || 'Failed to start job')
      setRunning(false)
      return
    }

    const { job_id } = await res.json()
    setJobId(job_id)

    const ws = new WebSocket(`${getWsBase()}/ws/cracking/${job_id}`)

    ws.onopen = () => {
      terminalRef.current?.writeln(`\x1b[33m[*] Starting ${tool}...\x1b[0m`)
      terminalRef.current?.writeln(`\x1b[33m[*] ${hashes.length} hash(es) to crack\x1b[0m\r\n`)
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'stdout') {
        terminalRef.current?.write(msg.data)
      } else if (msg.type === 'stderr') {
        terminalRef.current?.write('\x1b[33m' + msg.data + '\x1b[0m')
      } else if (msg.type === 'exit') {
        const color = msg.code === 0 || msg.code === 1 ? '\x1b[32m' : '\x1b[31m'
        terminalRef.current?.writeln(`${color}\r\n[*] Tool exited (code ${msg.code})\x1b[0m`)
      } else if (msg.type === 'results') {
        setResults({ cracked: msg.cracked, pairs: msg.pairs, vault_updated: msg.vault_updated })
        terminalRef.current?.writeln(
          `\x1b[36m\r\n[+] Cracked: ${msg.cracked} | Vault updated: ${msg.vault_updated}\x1b[0m`
        )
        setRunning(false)
      } else if (msg.type === 'error') {
        terminalRef.current?.writeln(`\x1b[31m[ERROR] ${msg.data}\x1b[0m`)
        setRunning(false)
      }
    }

    ws.onerror = () => {
      terminalRef.current?.writeln('\x1b[31m[!] WebSocket error\x1b[0m')
      setRunning(false)
    }
  }

  async function saveToVault(pair: CrackedPair) {
    if (!projectId) return
    await fetch(`${getApiBase()}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        username: '',
        secret: pair.plain,
        cred_type: 'password',
        source: 'brute_force',
        target_host: '',
        notes: `Cracked from hash: ${pair.hash}`,
      }),
    })
    setSavedPairs(prev => new Set([...prev, pair.hash]))
  }

  const hashTypes = tool === 'hashcat' ? (tools?.hash_types || []) : (tools?.john_formats || [])

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', color: 'var(--fg)' }}>

      {/* PageHeader */}
      <PageHeader
        title="Password Auditing"
        sub="Local hashcat / John jobs against captured material. Hashes never leave this host."
        right={
          <>
            <button className="btn" onClick={loadFromVault} disabled={selectedCredIds.length === 0} style={{ opacity: selectedCredIds.length === 0 ? 0.4 : 1 }}>
              <Icon name="upload" size={11} color="currentColor" /> Import hashes
            </button>
            <button className="btn-primary" onClick={handleRun} disabled={running || !getHashes().length} style={{ opacity: running || !getHashes().length ? 0.5 : 1 }}>
              {running ? <><Icon name="refresh" size={12} color="currentColor" /> Cracking…</> : <><Icon name="play" size={12} color="currentColor" /> New job</>}
            </button>
          </>
        }
      />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: rule, flexShrink: 0 }}>
        {[
          { label: 'recovered',       value: String(recovered), color: 'var(--ok)' },
          { label: 'in queue',        value: String(inQueue),   color: 'var(--accent)' },
          { label: 'gpu hashrate · 1000', value: '12.4 GH/s', color: 'var(--fg)' },
          { label: 'rule chains',     value: '7',               color: 'var(--fg)' },
        ].map((kpi, i) => (
          <div key={kpi.label} style={{ padding: '18px var(--pad)', borderLeft: i > 0 ? rule : 'none' }}>
            <div className="smcap" style={{ marginBottom: 4 }}>{kpi.label}</div>
            <div className="mono tnum" style={{ fontSize: 30, fontWeight: 500, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Body grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', flex: 1, minHeight: 0 }}>

        {/* Left: Jobs */}
        <div style={{ borderRight: rule, overflowY: 'auto' }}>
          <Section
            title="JOBS"
            right={<span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ok)', fontFamily: 'var(--font-mono)' }}>● {activeCount} active</span>}
          >
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>Mode</th>
                  <th>Name</th>
                  <th style={{ width: 80 }}>Hashes</th>
                  <th style={{ width: 80 }}>State</th>
                  <th style={{ width: 90 }}>Recovered</th>
                  <th style={{ width: 140 }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {STATIC_JOBS.map(job => (
                  <tr key={job.id}>
                    <td><span className="mono tnum" style={{ color: 'var(--accent)', fontSize: 10, textTransform: 'uppercase' }}>{job.mode}</span></td>
                    <td><span className="mono" style={{ fontSize: 12 }}>{job.name}</span></td>
                    <td><span className="mono tnum" style={{ fontSize: 12 }}>{job.hashes}</span></td>
                    <td><StatePill state={job.state} /></td>
                    <td><span className="mono tnum" style={{ color: 'var(--ok)', fontSize: 12 }}>{job.recovered}</span></td>
                    <td><ProgressBar pct={job.progress} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* Results */}
          {results && (
            <Section title="RESULTS">
              <div style={{ padding: '0 var(--pad) 16px' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(84,175,97,0.1)', color: 'var(--ok)', border: '1px solid rgba(84,175,97,0.3)', fontWeight: 700, fontFamily: 'var(--font-sans)' }}>
                    {results.cracked} cracked
                  </span>
                  {results.vault_updated > 0 && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(240,168,58,0.08)', color: 'var(--accent)', border: '1px solid rgba(240,168,58,0.25)', fontWeight: 700, fontFamily: 'var(--font-sans)' }}>
                      {results.vault_updated} vault updated
                    </span>
                  )}
                </div>
                {results.pairs.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-3)', fontStyle: 'italic', fontFamily: 'var(--font-sans)' }}>No hashes cracked in this run.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {results.pairs.map((pair, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 3, border: rule }}>
                        <span className="mono tnum" style={{ fontSize: 10, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: 160, flexShrink: 0 }}>{pair.hash}</span>
                        <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>→</span>
                        <span className="mono" style={{ fontSize: 13, color: 'var(--ok)', fontWeight: 700, flex: 1 }}>{pair.plain}</span>
                        {projectId && !savedPairs.has(pair.hash) && (
                          <button onClick={() => saveToVault(pair)} className="btn-sm">Save to Vault</button>
                        )}
                        {savedPairs.has(pair.hash) && <Icon name="check" size={12} color="var(--ok)" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}
        </div>

        {/* Right: Config + wordlist */}
        <div style={{ overflowY: 'auto' }}>
          <Section title="WORDLIST + RULE">
            <div style={{ padding: '14px var(--pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Tool selector */}
              <Field label="Tool">
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['hashcat', 'john'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => { setTool(t); setHashType(t === 'hashcat' ? '0' : 'auto') }}
                      className="mono"
                      style={{
                        flex: 1, padding: '5px 0', borderRadius: 3,
                        background: tool === t ? 'var(--accent)' : 'none',
                        color: tool === t ? 'var(--bg)' : 'var(--fg-3)',
                        border: tool === t ? 'none' : ruleStrong,
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}
                    >{t}</button>
                  ))}
                </div>
                {tools && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                    {(['hashcat', 'john'] as const).map(t => (
                      <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: tools[t].available ? 'var(--ok)' : 'var(--crit)', display: 'inline-block' }} />
                        <span className="mono" style={{ color: 'var(--fg-3)' }}>{t}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Field>

              {/* Hash type */}
              <Field label={tool === 'hashcat' ? 'Hash Type (-m)' : 'Format'}>
                <select value={hashType} onChange={e => setHashType(e.target.value)} style={selStyle}>
                  {hashTypes.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
                </select>
              </Field>

              {/* Attack mode (hashcat only) */}
              {tool === 'hashcat' && (
                <Field label="Attack Mode (-a)">
                  <select value={attackMode} onChange={e => setAttackMode(e.target.value)} style={selStyle}>
                    {ATTACK_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  {attackMode === '3' && (
                    <div style={{ marginTop: 8 }}>
                      <input value={mask} onChange={e => setMask(e.target.value)} style={{ ...selStyle, marginBottom: 4 }} placeholder="?d?d?d?d?d?d?d?d" />
                      <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>?l=lower ?u=upper ?d=digit ?s=special ?a=all</div>
                    </div>
                  )}
                </Field>
              )}

              {/* Wordlist */}
              {attackMode !== '3' && (
                <Field label="Wordlist">
                  {tools && tools.wordlists.length > 0 && (
                    <select value={wordlist} onChange={e => setWordlist(e.target.value)} style={{ ...selStyle, marginBottom: 6 }}>
                      <option value="">Select wordlist…</option>
                      {tools.wordlists.map(w => <option key={w} value={w}>{w.split('/').pop()}</option>)}
                    </select>
                  )}
                  <input value={customWordlist} onChange={e => setCustomWordlist(e.target.value)} style={selStyle} placeholder="Custom path…" />
                </Field>
              )}

              {/* Hash input */}
              <Field label={`Hashes (one per line) · ${getHashes().length}`}>
                <textarea
                  value={hashInput}
                  onChange={e => setHashInput(e.target.value)}
                  rows={5}
                  placeholder={"5f4dcc3b5aa765d61d8327deb882cf99\n098f6bcd4621d373cade4e832627b4f6"}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'var(--bg)', border: ruleStrong, borderRadius: 3,
                    padding: '8px 10px', fontSize: 11, color: 'var(--fg)',
                    fontFamily: 'var(--font-mono)', outline: 'none', resize: 'none',
                  }}
                />
              </Field>

              {/* Load from vault */}
              {vaultCreds.length > 0 && (
                <Field label="Load from Vault">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 100, overflowY: 'auto', marginBottom: 8 }}>
                    {vaultCreds.map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
                        <input
                          type="checkbox"
                          checked={selectedCredIds.includes(c.id)}
                          onChange={() => toggleCredId(c.id)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.secret.slice(0, 24)}…</span>
                      </label>
                    ))}
                  </div>
                  <button onClick={loadFromVault} disabled={selectedCredIds.length === 0} className="btn" style={{ width: '100%', justifyContent: 'center', opacity: selectedCredIds.length === 0 ? 0.4 : 1 }}>
                    <Icon name="upload" size={11} color="currentColor" /> Load {selectedCredIds.length || ''} hash{selectedCredIds.length !== 1 ? 'es' : ''}
                  </button>
                </Field>
              )}

              {/* hashcat status */}
              <div>
                <div className="smcap" style={{ marginBottom: 6 }}>hashcat status</div>
                <div className="rule" style={{ padding: 0 }}>
                  <pre className="term" style={{ margin: 0, fontSize: 10, lineHeight: 1.5, padding: '10px 12px', whiteSpace: 'pre-wrap' }}>
                    <span className="muted">{buildCommandPreview()}</span>
                    {'\n'}
                    {running
                      ? <span className="ok">Status.........: Running</span>
                      : <span className="muted">Status.........: Idle</span>
                    }
                  </pre>
                </div>
              </div>

              {/* Wordlist bundles */}
              {bundles.length > 0 && (
                <Field label="Get Wordlists">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {bundles.map(b => (
                      <div key={b.id} style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--fg)' }}>{b.label}</span>
                          {b.installed ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ok)' }}>
                              <Icon name="check" size={9} color="currentColor" /> Installed
                            </span>
                          ) : (
                            <button onClick={() => installBundle(b.id)} disabled={installing !== null} className="btn-sm" style={{ opacity: installing !== null && installing !== b.id ? 0.4 : 1 }}>
                              <Icon name={installing === b.id ? 'refresh' : 'download'} size={9} color="currentColor" />
                              {installing === b.id ? 'Installing…' : 'Install'}
                            </button>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>{b.description}</p>
                        {installLog[b.id] && (
                          <pre style={{ margin: '6px 0 0', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--fg-2)', background: 'var(--bg)', borderRadius: 2, padding: 6, maxHeight: 80, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                            {installLog[b.id]}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </Field>
              )}
            </div>
          </Section>

          {/* Live terminal */}
          <Section title="LIVE OUTPUT">
            <div style={{ padding: '0 var(--pad) 16px', height: 240 }}>
              <div style={{ height: '100%', border: ruleStrong, overflow: 'hidden' }}>
                <Terminal ref={terminalRef} />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
