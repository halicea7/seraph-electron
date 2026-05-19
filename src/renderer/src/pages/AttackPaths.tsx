import { useState, useEffect } from 'react'
import Icon from '@/components/Icon'
import { getApiBase } from '@/lib/config'
import { useAppStore } from '@/stores/appStore'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NodeData {
  id: string
  label: string
  type: 'attacker' | 'target'
  target_type?: string
  compromised?: boolean
  finding_counts?: Record<string, number>
}

interface EdgeData {
  id: string
  source: string
  target: string
  label: string
  type: 'c2' | 'finding' | 'lateral'
  count?: number
  username?: string
  session_type?: string
  status?: string
}

interface GraphData {
  nodes: { data: NodeData }[]
  edges: { data: EdgeData }[]
}

interface PathStep {
  tool: string
  title: string
  sev: string
}

interface AttackChain {
  id: string
  impact: string
  cvss: number
  steps: PathStep[]
  time: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const rule = '1px solid var(--rule)'

const SORT_OPTIONS = ['by impact', 'by complexity', 'shortest']

const EDGE_TYPE_TOOL: Record<string, string> = {
  c2:      'C2 implant',
  finding: 'exploit',
  lateral: 'cred-reuse',
}

const EDGE_TYPE_IMPACT: Record<string, string> = {
  c2:      'Critical',
  finding: 'High',
  lateral: 'Medium',
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

function SevBadge({ sev }: { sev: string }) {
  const c = sev === 'Critical' ? 'var(--crit)' : sev === 'High' ? 'var(--high)' : sev === 'Medium' ? 'var(--med)' : 'var(--low)'
  return (
    <span className="mono" style={{ fontSize: 10, color: c, padding: '2px 6px', border: `1px solid ${c}`, background: `${c}18` }}>{sev}</span>
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

// ── Build chains from graph data ───────────────────────────────────────────────

function buildChains(graph: GraphData): AttackChain[] {
  const edges = graph.edges.map(e => e.data)
  const nodeMap = new Map(graph.nodes.map(n => [n.data.id, n.data]))

  // Each edge from attacker is an entry point; lateral edges extend chains
  const attackerEdges = edges.filter(e => e.source === 'attacker')
  const lateralEdges  = edges.filter(e => e.type === 'lateral')

  const chains: AttackChain[] = []

  attackerEdges.forEach((entry, idx) => {
    const target = nodeMap.get(entry.target)
    if (!target) return

    const findingCounts = target.finding_counts ?? {}
    const topSev = ['Critical', 'High', 'Medium', 'Low'].find(s => findingCounts[s.toLowerCase()] || findingCounts[s])
    const impact = topSev ?? EDGE_TYPE_IMPACT[entry.type] ?? 'Medium'
    const cvss = impact === 'Critical' ? 9.8 : impact === 'High' ? 7.5 : impact === 'Medium' ? 5.0 : 3.0

    const baseSteps: PathStep[] = [
      { tool: 'recon', title: 'Initial recon', sev: 'Info' },
      { tool: EDGE_TYPE_TOOL[entry.type] ?? 'access', title: target.label, sev: impact },
    ]

    // Check for lateral movement from this target
    const laterals = lateralEdges.filter(e => e.source === entry.target)
    laterals.forEach(lat => {
      const latTarget = nodeMap.get(lat.target)
      if (latTarget) {
        baseSteps.push({ tool: 'cred-reuse', title: latTarget.label, sev: 'Medium' })
      }
    })

    chains.push({
      id: String(idx + 1).padStart(2, '0'),
      impact,
      cvss,
      steps: baseSteps,
      time: `${3 + baseSteps.length * 2}m`,
    })
  })

  // If no data, show placeholder chain
  if (chains.length === 0) {
    chains.push({
      id: '01',
      impact: 'High',
      cvss: 7.5,
      steps: [
        { tool: 'recon', title: 'External recon', sev: 'Info' },
        { tool: 'exploit', title: 'Initial access', sev: 'High' },
        { tool: 'pivot', title: 'Lateral movement', sev: 'Medium' },
        { tool: 'exfil', title: 'Data exfiltration', sev: 'Critical' },
      ],
      time: '12m',
    })
  }

  return chains
}

function sortChains(chains: AttackChain[], sort: string): AttackChain[] {
  if (sort === 'by impact') {
    const rank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Info: 0 }
    return [...chains].sort((a, b) => (rank[b.impact] ?? 0) - (rank[a.impact] ?? 0))
  }
  if (sort === 'by complexity') {
    return [...chains].sort((a, b) => b.steps.length - a.steps.length)
  }
  if (sort === 'shortest') {
    return [...chains].sort((a, b) => a.steps.length - b.steps.length)
  }
  return chains
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AttackPaths() {
  const { selectedProject: sp } = useAppStore()
  const projectId = sp?.id ?? ''
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [sort, setSort] = useState(SORT_OPTIONS[0])

  useEffect(() => {
    if (projectId) loadGraph()
  }, [projectId])

  async function loadGraph() {
    setLoading(true)
    try {
      const res = await fetch(`${getApiBase()}/attack-paths/${projectId}`)
      if (res.ok) setGraph(await res.json())
    } finally {
      setLoading(false)
    }
  }

  function exportPaths() {
    if (!graph) return
    const chains = buildChains(graph)
    const blob = new Blob([JSON.stringify(chains, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'attack-paths.json'
    a.click()
  }

  const chains = graph ? sortChains(buildChains(graph), sort) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      <PageHeader
        title="Attack Paths"
        sub="Ranked sequences from initial-access foothold to high-value asset."
        right={
          <>
            <SegBtns options={SORT_OPTIONS} value={sort} onChange={setSort} />
            <button
              className="btn btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={exportPaths}
            >
              <Icon name="download" size={11} /> Export
            </button>
          </>
        }
      />

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-3)', fontSize: 12, padding: '32px 0' }}>
            <Icon name="refresh" size={14} color="var(--accent)" /> Loading attack paths…
          </div>
        )}

        {!loading && !projectId && (
          <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--fg-3)', fontSize: 13 }}>
            Select a project to view attack paths.
          </div>
        )}

        {!loading && projectId && chains.map((chain, ci) => {
          const last = chain.steps.length - 1
          return (
            <div key={chain.id} className="rule">
              {/* sec-h */}
              <div className="sec-h">
                <span className="title">CHAIN {chain.id} · {chain.impact.toUpperCase()}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
                  <span className="badge badge-accent">CVSS {chain.cvss.toFixed(1)}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>
                    {chain.steps.length} steps · {chain.time}
                  </span>
                </div>
              </div>

              {/* Chain body */}
              <div style={{
                padding: 'var(--pad)',
                display: 'grid',
                gridTemplateColumns: `repeat(${chain.steps.length}, 1fr)`,
                gap: 0,
              }}>
                {chain.steps.map((step, si) => (
                  <div
                    key={si}
                    style={{
                      padding: '0 14px',
                      borderRight: si < last ? '1px dashed var(--rule)' : 'none',
                      position: 'relative',
                    }}
                  >
                    <div className="mono" style={{ fontSize: 9, color: 'var(--fg-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      step {si + 1} · {step.tool}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', marginBottom: 6, lineHeight: 1.3 }}>
                      {step.title}
                    </div>
                    <SevBadge sev={step.sev} />

                    {/* Arrow connector */}
                    {si < last && (
                      <span style={{
                        position: 'absolute', right: -7, top: 12,
                        color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 14,
                        lineHeight: 1,
                      }}>›</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {!loading && projectId && graph && graph.nodes.length === 0 && (
          <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--fg-3)', fontSize: 13 }}>
            No targets in this project yet. Add targets and run scans to generate attack paths.
          </div>
        )}
      </div>
    </div>
  )
}
