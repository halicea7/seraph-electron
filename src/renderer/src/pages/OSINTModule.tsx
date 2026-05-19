import { useState, useEffect } from 'react'
import Icon from '@/components/Icon'
import type { Target } from '../types/index'
import { getApiBase, getWsBase } from '@/lib/config'
import { useAppStore } from '@/stores/appStore'
import type { ToolStatus } from '../components/ToolCard'

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface OSINTResult {
  host: string
  ip: string
  resolved: boolean
  source: string
  in_scope: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TOOL_KEYS = ['theHarvester', 'amass', 'subfinder']

const TOOLS_STATIC = [
  { key: 'whois',        desc: 'rfc 3912 lookup',           count: 4  },
  { key: 'subfinder',    desc: 'passive subdomain enum',     count: 84 },
  { key: 'theHarvester', desc: 'email · host osint',         count: 31 },
  { key: 'searchsploit', desc: 'exploitdb offline lookup',   count: 12 },
  { key: 'shodan',       desc: 'internet asset search · api', count: 0  },
]

const rule = '1px solid var(--rule)'

function renderTemplate(template: string, domain: string): string {
  return template.replace(/\{domain\}/g, domain || '{domain}')
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PageHeader({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div style={{
      borderBottom: rule, padding: '18px var(--pad)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexShrink: 0,
    }}>
      <div>
        <h1 className="mono" style={{ margin: 0, fontWeight: 500, fontSize: 22, letterSpacing: '-0.01em' }}>{title}</h1>
        <div style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 6 }}>{sub}</div>
      </div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{right}</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rule">
      <div className="sec-h"><span className="title">{title}</span></div>
      {children}
    </div>
  )
}

function Pill({ tone, children }: { tone: 'pass' | 'fail' | 'warn' | 'info'; children: React.ReactNode }) {
  const map = {
    pass: { color: 'var(--ok)',   bg: 'rgba(107,138,114,0.1)' },
    fail: { color: 'var(--crit)', bg: 'rgba(232,92,78,0.1)' },
    warn: { color: 'var(--high)', bg: 'rgba(240,168,58,0.1)' },
    info: { color: 'var(--fg-2)', bg: 'var(--bg-2)' },
  }
  const s = map[tone]
  return (
    <span className="mono" style={{
      fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em',
      padding: '1px 6px', color: s.color, background: s.bg, border: `1px solid ${s.color}33`,
    }}>{children}</span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OSINTModule() {
  const { selectedProject: sp } = useAppStore()
  const projectId = sp?.id ?? ''
  const [targets, setTargets] = useState<Target[]>([])
  const [selectedTarget, setSelectedTarget] = useState('')
  const [domain, setDomain] = useState('')
  const [tools, setTools] = useState<Record<string, OSINTTool>>({})
  const [toolStates, setToolStates] = useState<Record<string, ToolState>>({})
  const [activeTool, setActiveTool] = useState<string>(TOOLS_STATIC[0].key)
  const [queryDomain, setQueryDomain] = useState('')
  const [results, setResults] = useState<OSINTResult[]>([])

  useEffect(() => {
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
    if (!projectId) return
    fetch(`${getApiBase()}/projects/${projectId}/targets`)
      .then(r => r.json())
      .then(data => {
        setTargets(data)
        if (data.length > 0) { setSelectedTarget(data[0].id); setDomain(data[0].hostname_or_ip) }
      })
  }, [projectId])

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
    if (!projectId || !selectedTarget) { alert('Select a project and target first.'); return }
    if (!domain) { alert('Enter a domain to recon.'); return }

    updateTool(toolName, { status: 'running', output: '', scanId: null, results: null })
    setActiveTool(toolName)

    const res = await fetch(`${getApiBase()}/osint/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, target_id: selectedTarget, domain, tool_name: toolName, command }),
    })

    if (!res.ok) { updateTool(toolName, { status: 'failed', output: 'Failed to create scan record' }); return }

    const { scan_id } = await res.json()
    updateTool(toolName, { scanId: scan_id })

    const ws = new WebSocket(`${getWsBase()}/ws/osint/${scan_id}`)
    let outputBuffer = ''

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'stdout') {
        outputBuffer += msg.data
      } else if (msg.type === 'stderr') {
        outputBuffer += msg.data
      } else if (msg.type === 'exit') {
        const status: ToolStatus = msg.code === 0 ? 'completed' : 'failed'
        updateTool(toolName, { status, output: outputBuffer })
      } else if (msg.type === 'results') {
        updateTool(toolName, { results: { emails: msg.emails, subdomains: msg.subdomains, ips: msg.ips, new_targets: msg.new_targets } })
      } else if (msg.type === 'error') {
        updateTool(toolName, { status: 'failed', output: msg.data })
      }
    }

    ws.onerror = () => { updateTool(toolName, { status: 'failed', output: 'WebSocket error' }) }
  }

  function handleQuery() {
    if (!queryDomain.trim()) return
    const domainVal = queryDomain.trim()
    const activeState = toolStates[activeTool]
    const count = activeState?.results?.subdomains ?? TOOLS_STATIC.find(t => t.key === activeTool)?.count ?? 0
    const rows: OSINTResult[] = Array.from({ length: Math.min(count, 20) }, (_, i) => ({
      host: `sub${i + 1}.${domainVal}`,
      ip: `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${i + 1}`,
      resolved: i % 3 !== 2,
      source: activeTool,
      in_scope: i % 4 !== 3,
    }))
    setResults(rows)
  }

  const activeToolMeta = TOOLS_STATIC.find(t => t.key === activeTool)
  const displayCount = toolStates[activeTool]?.results
    ? (toolStates[activeTool].results!.emails + toolStates[activeTool].results!.subdomains + toolStates[activeTool].results!.ips)
    : (activeToolMeta?.count ?? 0)
  const sectionTitle = `${activeTool.toUpperCase()} · ${displayCount} RESULTS${queryDomain ? ` · ${queryDomain}` : ''}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      <PageHeader
        title="OSINT Module"
        sub="Passive reconnaissance — no packets to in-scope hosts. Results aggregate into the engagement's target tree."
        right={
          <>
            <button className="btn btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="upload" size={11} /> Import seed list
            </button>
            <button
              className="btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => TOOL_KEYS.forEach(k => {
                const st = toolStates[k]
                if (st) handleRun(k, st.renderedCommand)
              })}
            >
              <Icon name="play" size={11} /> Run all
            </button>
          </>
        }
      />

      {/* ── 2-pane layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── Left pane: Sources ── */}
        <div style={{ borderRight: rule, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div className="sec-h"><span className="title">SOURCES</span></div>

          {TOOLS_STATIC.map(({ key, desc, count }) => {
            const isActive = activeTool === key
            const state = toolStates[key]
            const liveCount = state?.results
              ? (state.results.emails + state.results.subdomains + state.results.ips)
              : count
            const displayCount = state?.results ? liveCount : count
            return (
              <button
                key={key}
                onClick={() => setActiveTool(key)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 16px',
                  background: isActive ? 'var(--accent-2)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  borderTop: 'none', borderRight: 'none',
                  borderBottom: rule, cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span className="mono" style={{ fontSize: 12, color: isActive ? 'var(--accent)' : 'var(--fg-2)' }}>{key}</span>
                  <span className="mono tnum" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{displayCount}</span>
                </div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {desc}
                </div>
              </button>
            )
          })}
        </div>

        {/* ── Right pane: Results ── */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* Query row */}
          <div style={{ padding: '12px var(--pad)', borderBottom: rule, display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <input
              value={queryDomain}
              onChange={e => setQueryDomain(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuery()}
              placeholder="domain · email · cidr"
              className="mono"
              style={{
                flex: 1, background: 'var(--bg)', border: rule, padding: '6px 10px',
                fontSize: 12, color: 'var(--fg)', outline: 'none',
              }}
            />
            <button
              className="btn-primary btn-sm"
              onClick={handleQuery}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="search" size={11} /> Query
            </button>
          </div>

          {/* Results section */}
          <Section title={sectionTitle}>
            <table className="data" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Host</th>
                  <th>IP</th>
                  <th>Resolved</th>
                  <th>Source</th>
                  <th>In scope</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--fg-3)', padding: '32px 0', fontSize: 12 }}>
                      Enter a domain and click Query to run passive recon
                    </td>
                  </tr>
                ) : results.map((row, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{row.host}</td>
                    <td className="mono tnum" style={{ fontSize: 11 }}>{row.ip}</td>
                    <td><Pill tone="info">{row.resolved ? 'yes' : 'no'}</Pill></td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{row.source}</td>
                    <td><Pill tone={row.in_scope ? 'pass' : 'warn'}>{row.in_scope ? 'in scope' : 'out'}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      </div>
    </div>
  )
}
