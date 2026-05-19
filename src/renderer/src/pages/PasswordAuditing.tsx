import { useState, useEffect, useRef } from 'react'
import Icon from '../components/Icon'
import Terminal, { TerminalHandle } from '../components/Terminal'
import type { Credential } from '../types/index'
import { getApiBase, getWsBase } from '@/lib/config'
import { useAppStore } from '@/stores/appStore'

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

const ATTACK_MODES = [
  { id: '0', label: 'Wordlist (dictionary)' },
  { id: '3', label: 'Brute-force (mask)' },
  { id: '6', label: 'Hybrid (wordlist + mask)' },
]

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

const sectionStyle: React.CSSProperties = {
  background: 'var(--bg-2)',
  border: ruleStrong,
  borderRadius: 4,
  padding: '12px 14px',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--fg-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 8,
  fontFamily: 'var(--font-sans)',
}

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
    <div style={{ display: 'flex', height: '100%', gap: 16, minHeight: 0, background: 'var(--bg)', color: 'var(--fg)', padding: 16 }}>
      {/* Left: Config */}
      <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', minHeight: 0 }}>

        {/* Tool selector */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Tool</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['hashcat', 'john'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTool(t); setHashType(t === 'hashcat' ? '0' : 'auto') }}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: 3,
                  background: tool === t ? 'var(--accent)' : 'none',
                  color: tool === t ? 'var(--bg)' : 'var(--fg-3)',
                  border: tool === t ? 'none' : ruleStrong,
                  fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                }}
              >
                {t}
              </button>
            ))}
          </div>
          {tools && (
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              {(['hashcat', 'john'] as const).map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: tools[t].available ? 'var(--ok)' : 'var(--crit)', display: 'inline-block' }} />
                  <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>{t}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hash type */}
        <div style={sectionStyle}>
          <span style={labelStyle}>{tool === 'hashcat' ? 'Hash Type (-m)' : 'Format'}</span>
          <select value={hashType} onChange={e => setHashType(e.target.value)} style={selStyle}>
            {hashTypes.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
          </select>
        </div>

        {/* Attack mode (hashcat only) */}
        {tool === 'hashcat' && (
          <div style={sectionStyle}>
            <span style={labelStyle}>Attack Mode (-a)</span>
            <select value={attackMode} onChange={e => setAttackMode(e.target.value)} style={selStyle}>
              {ATTACK_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {attackMode === '3' && (
              <div style={{ marginTop: 8 }}>
                <label style={{ ...labelStyle, marginBottom: 4 }}>Mask</label>
                <input value={mask} onChange={e => setMask(e.target.value)} style={selStyle} placeholder="?d?d?d?d?d?d?d?d" />
                <div style={{ marginTop: 4, fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>?l=lower ?u=upper ?d=digit ?s=special ?a=all</div>
              </div>
            )}
          </div>
        )}

        {/* Wordlist */}
        {attackMode !== '3' && (
          <div style={sectionStyle}>
            <span style={labelStyle}>Wordlist</span>
            {tools && tools.wordlists.length > 0 && (
              <select value={wordlist} onChange={e => setWordlist(e.target.value)} style={{ ...selStyle, marginBottom: 6 }}>
                <option value="">Select wordlist...</option>
                {tools.wordlists.map(w => <option key={w} value={w}>{w.split('/').pop()}</option>)}
              </select>
            )}
            <input
              value={customWordlist}
              onChange={e => setCustomWordlist(e.target.value)}
              style={selStyle}
              placeholder="Custom path..."
            />
          </div>
        )}

        {/* Get wordlists */}
        <div style={sectionStyle}>
          <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="download" size={10} color="currentColor" /> Get Wordlists
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bundles.map(b => (
              <div key={b.id} style={{ background: 'var(--bg)', border: rule, borderRadius: 3, padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{b.label}</span>
                  {b.installed ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ok)' }}>
                      <Icon name="check" size={9} color="currentColor" /> Installed
                    </span>
                  ) : (
                    <button
                      onClick={() => installBundle(b.id)}
                      disabled={installing !== null}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 10, padding: '2px 8px', borderRadius: 3,
                        background: 'none', border: ruleStrong,
                        color: installing === b.id ? 'var(--accent)' : 'var(--fg-3)',
                        cursor: installing !== null ? 'not-allowed' : 'pointer',
                        opacity: installing !== null && installing !== b.id ? 0.4 : 1,
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
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
        </div>

        {/* Load from vault */}
        <div style={sectionStyle}>
          <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="key" size={10} color="currentColor" /> Load from Vault
          </span>
          {vaultCreds.length > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
                  <input
                    type="checkbox"
                    checked={selectedCredIds.length === vaultCreds.length}
                    ref={el => { if (el) el.indeterminate = selectedCredIds.length > 0 && selectedCredIds.length < vaultCreds.length }}
                    onChange={e => setSelectedCredIds(e.target.checked ? vaultCreds.map(c => c.id) : [])}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  All ({vaultCreds.length})
                </label>
                {selectedCredIds.length > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-sans)' }}>{selectedCredIds.length} selected</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto', marginBottom: 8 }}>
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
              <button
                onClick={loadFromVault}
                disabled={selectedCredIds.length === 0}
                style={{
                  width: '100%', padding: '5px 0', borderRadius: 3,
                  background: 'none', border: ruleStrong,
                  fontSize: 11, color: selectedCredIds.length > 0 ? 'var(--accent)' : 'var(--fg-3)',
                  cursor: selectedCredIds.length > 0 ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--font-sans)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: selectedCredIds.length === 0 ? 0.5 : 1,
                }}
              >
                <Icon name="upload" size={11} color="currentColor" />
                Load {selectedCredIds.length || ''} hash{selectedCredIds.length !== 1 ? 'es' : ''}
              </button>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 10, color: 'var(--fg-3)', fontStyle: 'italic', fontFamily: 'var(--font-sans)' }}>
              {projectId ? 'No hash-type credentials in this project' : 'Select a project'}
            </p>
          )}
        </div>
      </div>

      {/* Center: hash input + command + results */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: 12, overflowY: 'auto' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)' }}>
            <Icon name="lock" size={16} color="var(--accent)" /> Password Auditing
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
            hashcat / john the ripper — cracked plaintexts saved back to Credential Vault
          </p>
        </div>

        {/* Hash input */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={labelStyle}>Hashes (one per line)</span>
            <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
              {getHashes().length} hash{getHashes().length !== 1 ? 'es' : ''}
            </span>
          </div>
          <textarea
            value={hashInput}
            onChange={e => setHashInput(e.target.value)}
            rows={6}
            placeholder={"5f4dcc3b5aa765d61d8327deb882cf99\n098f6bcd4621d373cade4e832627b4f6\n..."}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg)', border: rule, borderRadius: 3,
              padding: '8px 10px', fontSize: 11, color: 'var(--fg)',
              fontFamily: 'var(--font-mono)', outline: 'none', resize: 'none',
            }}
          />
        </div>

        {/* Command preview */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Command Preview</span>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)',
            background: 'var(--bg)', border: rule, borderRadius: 3,
            padding: '8px 10px', wordBreak: 'break-all',
          }}>
            {buildCommandPreview()}
          </div>
          <button
            onClick={handleRun}
            disabled={running || !getHashes().length}
            style={{
              marginTop: 12, width: '100%', padding: '9px 0', borderRadius: 4,
              background: running || !getHashes().length ? 'var(--bg-2)' : 'var(--ok)',
              color: running || !getHashes().length ? 'var(--fg-3)' : '#fff',
              border: 'none', fontSize: 13, fontWeight: 700,
              fontFamily: 'var(--font-sans)', cursor: running || !getHashes().length ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: running || !getHashes().length ? 0.5 : 1,
            }}
          >
            {running
              ? <><Icon name="refresh" size={14} color="currentColor" /> Cracking...</>
              : <><Icon name="play" size={14} color="currentColor" /> Start Cracking</>
            }
          </button>
        </div>

        {/* Results */}
        {results && (
          <div style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Icon name="shield" size={14} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Results</span>
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
                  <div
                    key={i}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 3, border: rule }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: 160, flexShrink: 0 }}>{pair.hash}</span>
                    <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>→</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ok)', fontWeight: 700, flex: 1 }}>{pair.plain}</span>
                    {projectId && !savedPairs.has(pair.hash) && (
                      <button
                        onClick={() => saveToVault(pair)}
                        style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: ruleStrong, borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0 }}
                      >
                        Save to Vault
                      </button>
                    )}
                    {savedPairs.has(pair.hash) && (
                      <Icon name="check" size={12} color="var(--ok)" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Terminal */}
      <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Live Output</span>
        <div style={{ flex: 1, border: ruleStrong, borderRadius: 4, overflow: 'hidden' }}>
          <Terminal ref={terminalRef} className="flex-1" />
        </div>
      </div>
    </div>
  )
}
