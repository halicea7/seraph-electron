import { useState, useEffect, useRef } from 'react'
import ToolCard, { ToolStatus } from '../components/ToolCard'
import Terminal, { TerminalHandle } from '../components/Terminal'
import Icon from '@/components/Icon'
import type { Project, Target } from '../types/index'
import { getApiBase, getWsBase } from '@/lib/config'

interface OSINTTool {
  tool: string
  description: string
  command_template: string
  install: string
  available: boolean
}

interface ToolState {
  status: ToolStatus
  output: string
  scanId: string | null
  renderedCommand: string
  results: { emails: number; subdomains: number; ips: number; new_targets: number } | null
}

const TOOL_KEYS = ['theHarvester', 'amass', 'subfinder']

function renderTemplate(template: string, domain: string): string {
  return template.replace(/\{domain\}/g, domain || '{domain}')
}

const rule = '1px solid var(--rule)'

export default function OSINTModule() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [targets, setTargets] = useState<Target[]>([])
  const [selectedTarget, setSelectedTarget] = useState('')
  const [domain, setDomain] = useState('')
  const [tools, setTools] = useState<Record<string, OSINTTool>>({})
  const [toolStates, setToolStates] = useState<Record<string, ToolState>>({})
  const [activeTool, setActiveTool] = useState<string>(TOOL_KEYS[0])
  const terminalRef = useRef<TerminalHandle>(null)

  useEffect(() => {
    fetch(`${getApiBase()}/projects`).then(r => r.json()).then(data => {
      setProjects(data)
      if (data.length > 0) setSelectedProject(data[0].id)
    })
    fetch(`${getApiBase()}/osint/tools`).then(r => r.json()).then(data => {
      setTools(data)
      const states: Record<string, ToolState> = {}
      Object.values(data).forEach((t: any) => {
        states[t.tool] = { status: 'idle', output: '', scanId: null, renderedCommand: t.command_template, results: null }
      })
      setToolStates(states)
    })
  }, [])

  useEffect(() => {
    if (!selectedProject) return
    fetch(`${getApiBase()}/projects/${selectedProject}/targets`)
      .then(r => r.json())
      .then(data => {
        setTargets(data)
        if (data.length > 0) { setSelectedTarget(data[0].id); setDomain(data[0].hostname_or_ip) }
      })
  }, [selectedProject])

  useEffect(() => {
    setToolStates(prev => {
      const next = { ...prev }
      Object.entries(tools).forEach(([key, tool]) => {
        if (next[key] && next[key].status === 'idle') {
          next[key] = { ...next[key], renderedCommand: renderTemplate(tool.command_template, domain) }
        }
      })
      return next
    })
  }, [domain, tools])

  function updateTool(toolName: string, updates: Partial<ToolState>) {
    setToolStates(prev => ({ ...prev, [toolName]: { ...prev[toolName], ...updates } }))
  }

  async function handleRun(toolName: string, command: string) {
    if (!selectedProject || !selectedTarget) { alert('Select a project and target first.'); return }
    if (!domain) { alert('Enter a domain to recon.'); return }

    updateTool(toolName, { status: 'running', output: '', scanId: null, results: null })
    setActiveTool(toolName)

    const res = await fetch(`${getApiBase()}/osint/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: selectedProject, target_id: selectedTarget, domain, tool_name: toolName, command }),
    })

    if (!res.ok) { updateTool(toolName, { status: 'failed', output: 'Failed to create scan record' }); return }

    const { scan_id } = await res.json()
    updateTool(toolName, { scanId: scan_id })

    const ws = new WebSocket(`${getWsBase()}/ws/osint/${scan_id}`)
    let outputBuffer = ''

    ws.onopen = () => { terminalRef.current?.writeln(`\x1b[33m[*] Running: ${command}\x1b[0m`) }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'stdout') {
        terminalRef.current?.write(msg.data)
        outputBuffer += msg.data
      } else if (msg.type === 'stderr') {
        terminalRef.current?.write('\x1b[33m' + msg.data + '\x1b[0m')
        outputBuffer += msg.data
      } else if (msg.type === 'exit') {
        const status: ToolStatus = msg.code === 0 ? 'completed' : 'failed'
        updateTool(toolName, { status, output: outputBuffer })
        if (msg.code === 0) terminalRef.current?.writeln('\x1b[32m\r\n[+] Completed (exit 0)\x1b[0m')
        else terminalRef.current?.writeln(`\x1b[31m\r\n[!] Exited with code ${msg.code}\x1b[0m`)
      } else if (msg.type === 'results') {
        updateTool(toolName, { results: { emails: msg.emails, subdomains: msg.subdomains, ips: msg.ips, new_targets: msg.new_targets } })
        terminalRef.current?.writeln(`\x1b[36m\r\n[*] Results: ${msg.emails} emails · ${msg.subdomains} subdomains · ${msg.ips} IPs · ${msg.new_targets} new targets added\x1b[0m`)
      } else if (msg.type === 'error') {
        terminalRef.current?.writeln(`\x1b[31m[ERROR] ${msg.data}\x1b[0m`)
        updateTool(toolName, { status: 'failed', output: msg.data })
      }
    }

    ws.onerror = () => { updateTool(toolName, { status: 'failed', output: 'WebSocket error' }) }
  }

  const selectStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--rule-strong)',
    borderRadius: 3, padding: '5px 8px', fontSize: 12, color: 'var(--fg)',
    fontFamily: 'var(--font-sans)', outline: 'none',
  }

  const totalDiscoveries = {
    emails:      TOOL_KEYS.reduce((s, k) => s + (toolStates[k]?.results?.emails      || 0), 0),
    subdomains:  TOOL_KEYS.reduce((s, k) => s + (toolStates[k]?.results?.subdomains  || 0), 0),
    ips:         TOOL_KEYS.reduce((s, k) => s + (toolStates[k]?.results?.ips         || 0), 0),
    new_targets: TOOL_KEYS.reduce((s, k) => s + (toolStates[k]?.results?.new_targets || 0), 0),
  }

  const hasDiscoveries = TOOL_KEYS.some(k => toolStates[k]?.results)

  const activeToolData = tools[activeTool]
  const activeState = toolStates[activeTool] || { status: 'idle' as ToolStatus, output: '', scanId: null, renderedCommand: '', results: null }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left sidebar ── */}
      <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: rule, overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: rule }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Icon name="search" size={14} color="var(--accent)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>OSINT Module</span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0 }}>Passive recon — no active probing</p>
        </div>

        {/* Project / Target / Domain */}
        <div style={{ padding: '12px 16px', borderBottom: rule, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', display: 'block', marginBottom: 4 }}>Project</label>
            <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={selectStyle}>
              <option value="">Select project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', display: 'block', marginBottom: 4 }}>Target</label>
            <select value={selectedTarget} onChange={e => { setSelectedTarget(e.target.value); const t = targets.find(t => t.id === e.target.value); if (t) setDomain(t.hostname_or_ip) }} disabled={targets.length === 0} style={{ ...selectStyle, opacity: targets.length === 0 ? 0.5 : 1 }}>
              <option value="">Select target…</option>
              {targets.map(t => <option key={t.id} value={t.id}>{t.hostname_or_ip}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', display: 'block', marginBottom: 4 }}>Domain</label>
            <input
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="example.com"
              style={{ ...selectStyle, fontFamily: 'var(--font-mono)' }}
            />
          </div>
        </div>

        {/* Tool list */}
        <div style={{ borderBottom: rule }}>
          <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>Sources</div>
          {TOOL_KEYS.map(key => {
            const tool = tools[key]
            const state = toolStates[key]
            const isActive = activeTool === key
            const available = tool?.available ?? false
            const status = state?.status ?? 'idle'
            const resultCount = (state?.results?.emails || 0) + (state?.results?.subdomains || 0) + (state?.results?.ips || 0)
            return (
              <button
                key={key}
                onClick={() => setActiveTool(key)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 16px',
                  background: isActive ? 'var(--accent-2)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  borderBottom: rule, cursor: 'pointer', border: 'none',
                  borderLeftWidth: 2, borderLeftStyle: 'solid',
                  borderLeftColor: isActive ? 'var(--accent)' : 'transparent',
                  borderBottomWidth: 1, borderBottomStyle: 'solid',
                  borderBottomColor: 'var(--rule)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: isActive ? 'var(--accent)' : available ? 'var(--fg-2)' : 'var(--fg-3)' }}>{key}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: status === 'running' ? 'var(--accent)' : status === 'completed' ? 'var(--ok)' : status === 'failed' ? 'var(--crit)' : resultCount > 0 ? 'var(--fg-2)' : 'var(--fg-3)' }}>
                    {status === 'running' ? '…' : resultCount > 0 ? resultCount : available ? '—' : '✗'}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
                  {tool?.description || key}
                </div>
              </button>
            )
          })}
        </div>

        {/* Discoveries */}
        {hasDiscoveries && (
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', marginBottom: 8 }}>Discoveries</div>
            {[
              { label: 'Emails',      icon: 'send',    val: totalDiscoveries.emails },
              { label: 'Subdomains',  icon: 'globe',   val: totalDiscoveries.subdomains },
              { label: 'IPs',         icon: 'network', val: totalDiscoveries.ips },
              { label: 'New Targets', icon: 'plus',    val: totalDiscoveries.new_targets },
            ].map(({ label, icon, val }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-3)' }}>
                  <Icon name={icon} size={11} color="var(--accent)" /> {label}
                </div>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{val}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Tool area header */}
        <div style={{ padding: '10px 16px', borderBottom: rule, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)', fontWeight: 600 }}>{activeTool}</span>
          {activeToolData && (
            <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{activeToolData.description}</span>
          )}
          {!domain && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="flag" size={11} /> Enter a domain to begin
            </span>
          )}
        </div>

        {/* 2-pane: ToolCard + Terminal */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', minHeight: 0, overflow: 'hidden' }}>
          {/* ToolCard area */}
          <div style={{ overflowY: 'auto', padding: 16, borderRight: rule }}>
            {activeToolData ? (
              <>
                <ToolCard
                  tool={activeToolData.tool}
                  description={activeToolData.description}
                  commandTemplate={activeToolData.command_template}
                  install={activeToolData.install}
                  renderedCommand={activeState.renderedCommand}
                  status={activeState.status}
                  output={activeState.output}
                  isToolAvailable={activeToolData.available}
                  onRun={(cmd) => handleRun(activeTool, cmd)}
                  onCommandChange={(cmd) => updateTool(activeTool, { renderedCommand: cmd })}
                />
                {activeState.results && (
                  <div style={{ display: 'flex', gap: 14, marginTop: 10, paddingLeft: 4 }}>
                    {[
                      { val: activeState.results.emails,      label: 'emails' },
                      { val: activeState.results.subdomains,  label: 'subdomains' },
                      { val: activeState.results.ips,         label: 'IPs' },
                      { val: activeState.results.new_targets, label: 'new targets' },
                    ].map(({ val, label }) => (
                      <div key={label} style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{val}</span> {label}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                <p style={{ fontSize: 13, color: 'var(--fg-3)' }}>Select a tool from the sidebar</p>
              </div>
            )}
          </div>

          {/* Terminal */}
          <div style={{ display: 'flex', flexDirection: 'column', padding: 12, gap: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Live Output</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{activeTool}</span>
            </div>
            <div style={{ flex: 1, border: rule, borderRadius: 3, overflow: 'hidden', minHeight: 0 }}>
              <Terminal ref={terminalRef} className="h-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
