import { useState, useEffect, useRef, useCallback } from 'react'
import cytoscape from 'cytoscape'
import Icon from '@/components/Icon'
import type { Project } from '../types/index'
import { getApiBase } from '@/lib/config'

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

const EDGE_COLORS: Record<string, string> = {
  c2:      'var(--crit)',
  finding: 'var(--accent)',
  lateral: '#a855f7',
}

const EDGE_COLORS_STATIC: Record<string, string> = {
  c2:      '#e84040',
  finding: '#f0a83a',
  lateral: '#a855f7',
}

const TARGET_ICONS: Record<string, string> = {
  linux_host:   '⬡',
  windows_host: '▣',
  web_app:      '◈',
  cloud_aws:    '◉',
  network:      '◎',
}

const EDGE_TYPE_LABEL: Record<string, string> = {
  c2:      'C2 Session',
  finding: 'Exploit Path',
  lateral: 'Lateral Movement',
}

export default function AttackPaths() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedEl, setSelectedEl] = useState<NodeData | EdgeData | null>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${getApiBase()}/projects`).then(r => r.json()).then(data => {
      setProjects(data)
      if (data.length > 0) setSelectedProject(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (selectedProject) loadGraph()
  }, [selectedProject])

  async function loadGraph() {
    setLoading(true)
    setSelectedEl(null)
    try {
      const res = await fetch(`${getApiBase()}/attack-paths/${selectedProject}`)
      if (res.ok) setGraph(await res.json())
    } finally {
      setLoading(false)
    }
  }

  const initCy = useCallback(() => {
    if (!graph || !containerRef.current) return
    if (cyRef.current) cyRef.current.destroy()

    const elements: cytoscape.ElementDefinition[] = [
      ...graph.nodes.map(n => {
        const isAttacker = n.data.type === 'attacker'
        const isCompromised = n.data.compromised
        const bg      = isAttacker ? '#1a1400' : isCompromised ? '#2a0a0a' : '#1a1714'
        const border  = isAttacker ? '#f0a83a' : isCompromised ? '#e84040' : '#3a3530'
        const glow    = isAttacker ? 'rgba(240,168,58,0.5)' : isCompromised ? 'rgba(232,64,64,0.5)' : 'rgba(58,53,48,0.3)'
        return { data: { ...n.data, bg, border, glow } }
      }),
      ...graph.edges.map(e => ({
        data: { ...e.data, lineColor: EDGE_COLORS_STATIC[e.data.type] || '#3a3530' },
      })),
    ]

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(bg)',
            'border-color': 'data(border)',
            'border-width': 1.5,
            'label': 'data(label)',
            'color': '#c8c3b8',
            'font-size': '10px',
            'font-family': '"IBM Plex Mono", monospace',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-max-width': '110px',
            'text-wrap': 'ellipsis',
            'width': 40,
            'height': 40,
            'shadow-blur': 14,
            'shadow-color': 'data(glow)',
            'shadow-opacity': 0.9,
            'shadow-offset-x': 0,
            'shadow-offset-y': 0,
          } as any,
        },
        {
          selector: 'node[type="attacker"]',
          style: { 'shape': 'diamond', 'width': 48, 'height': 48 },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 2.5, 'border-color': '#f0a83a' },
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': 'data(lineColor)',
            'target-arrow-color': 'data(lineColor)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '9px',
            'color': '#7a7268',
            'text-rotation': 'autorotate',
            'opacity': 0.7,
          },
        },
        {
          selector: 'edge:selected',
          style: { 'opacity': 1, 'width': 2.5 },
        },
      ],
      layout: {
        name: 'cose',
        animate: true,
        animationDuration: 500,
        nodeRepulsion: () => 10000,
        idealEdgeLength: () => 130,
        gravity: 0.8,
        randomize: false,
      } as any,
      minZoom: 0.2,
      maxZoom: 4,
    })

    cy.on('tap', 'node', (evt) => setSelectedEl(evt.target.data() as NodeData))
    cy.on('tap', 'edge', (evt) => setSelectedEl(evt.target.data() as EdgeData))
    cy.on('tap', (evt) => { if (evt.target === cy) setSelectedEl(null) })
    cyRef.current = cy
  }, [graph])

  useEffect(() => { initCy() }, [initCy])

  function exportPNG() {
    if (!cyRef.current) return
    const png = cyRef.current.png({ full: true, scale: 2, bg: '#0d0c0a' })
    const a = document.createElement('a')
    a.href = png
    a.download = 'attack-paths.png'
    a.click()
  }

  const nodeCount       = graph?.nodes.length ?? 0
  const edgeCount       = graph?.edges.length ?? 0
  const compromisedCount = graph?.nodes.filter(n => n.data.compromised).length ?? 0

  const selectedNode = selectedEl && 'target_type' in selectedEl ? selectedEl as NodeData : null
  const selectedEdge = selectedEl && 'source' in selectedEl ? selectedEl as EdgeData : null

  return (
    <div style={{ display: 'flex', height: '100%', gap: 16, padding: '20px 24px', minHeight: 0, boxSizing: 'border-box' }}>

      {/* ── Left panel ── */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--rule)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Icon name="target" size={15} color="var(--crit)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', letterSpacing: '0.01em' }}>Attack Paths</span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0 }}>Visualise compromise paths</p>
        </div>

        {/* Project selector */}
        <div style={{ border: '1px solid var(--rule)', borderRadius: 4, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Project</label>
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            style={{
              width: '100%', background: 'var(--bg-2)', border: '1px solid var(--rule-strong)',
              borderRadius: 3, padding: '5px 8px', fontSize: 12, color: 'var(--fg)',
              fontFamily: 'var(--font-sans)', outline: 'none',
            }}
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={loadGraph}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '5px 10px', border: '1px solid var(--rule-strong)', borderRadius: 3,
              background: 'transparent', color: 'var(--fg-2)', fontSize: 11, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <Icon name="refresh" size={11} color={loading ? 'var(--accent)' : 'currentColor'} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* Stats */}
        {graph && (
          <div style={{ border: '1px solid var(--rule)', borderRadius: 4, padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Graph</p>
            {[
              { label: 'Nodes', value: nodeCount, color: 'var(--fg)' },
              { label: 'Edges', value: edgeCount, color: 'var(--fg)' },
              { label: 'Compromised', value: compromisedCount, color: compromisedCount > 0 ? 'var(--crit)' : 'var(--ok)' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{row.label}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: row.color }}>{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div style={{ border: '1px solid var(--rule)', borderRadius: 4, padding: '10px 12px' }}>
          <p style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Legend</p>
          {[
            { color: EDGE_COLORS_STATIC.c2,      label: 'C2 Session' },
            { color: EDGE_COLORS_STATIC.finding,  label: 'Exploit Path' },
            { color: EDGE_COLORS_STATIC.lateral,  label: 'Lateral Movement' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 16, height: 2, background: item.color, borderRadius: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{item.label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ width: 12, height: 12, background: '#2a0a0a', border: '1px solid #e84040', borderRadius: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>Compromised</span>
          </div>
        </div>

        {/* Selection detail */}
        {selectedEl && (
          <div style={{ border: '1px solid var(--rule)', borderRadius: 4, padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Selected</p>

            {selectedNode?.type === 'attacker' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="shield" size={12} color="var(--accent)" />
                <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Attacker node</span>
              </div>
            )}

            {selectedNode?.type === 'target' && (
              <div>
                <p style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 600, margin: '0 0 4px' }}>
                  {TARGET_ICONS[selectedNode.target_type || ''] || '○'} {selectedNode.label}
                </p>
                <p style={{ fontSize: 11, color: selectedNode.compromised ? 'var(--crit)' : 'var(--ok)', margin: '0 0 6px' }}>
                  {selectedNode.compromised ? '⚠ Compromised' : '✓ Clean'}
                </p>
                {selectedNode.finding_counts && Object.keys(selectedNode.finding_counts).length > 0 && (
                  <div>
                    {Object.entries(selectedNode.finding_counts).map(([sev, cnt]) => (
                      <p key={sev} style={{ fontSize: 11, color: 'var(--fg-3)', margin: '2px 0' }}>{cnt}× {sev}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedEdge && (
              <div>
                <span style={{
                  display: 'inline-block', fontSize: 10, padding: '2px 6px',
                  border: `1px solid ${EDGE_COLORS_STATIC[selectedEdge.type] || 'var(--rule-strong)'}`,
                  borderRadius: 2, color: EDGE_COLORS_STATIC[selectedEdge.type] || 'var(--fg-3)',
                  marginBottom: 6,
                }}>
                  {EDGE_TYPE_LABEL[selectedEdge.type] || selectedEdge.type}
                </span>
                {selectedEdge.count != null && (
                  <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: '2px 0' }}>{selectedEdge.count} exploit(s)</p>
                )}
                {selectedEdge.username && (
                  <p style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', margin: '2px 0' }}>
                    user: {selectedEdge.username}
                  </p>
                )}
                {selectedEdge.session_type && (
                  <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: '2px 0' }}>type: {selectedEdge.session_type}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Export */}
        {graph && (
          <button
            onClick={exportPNG}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '6px 10px', border: '1px solid var(--rule-strong)', borderRadius: 3,
              background: 'transparent', color: 'var(--fg-2)', fontSize: 11, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <Icon name="download" size={11} />
            Export PNG
          </button>
        )}
      </div>

      {/* ── Graph canvas ── */}
      <div style={{
        flex: 1, border: '1px solid var(--rule)', borderRadius: 4,
        position: 'relative', overflow: 'hidden', background: 'var(--bg)',
      }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 10, background: 'rgba(13,12,10,0.6)',
          }}>
            <Icon name="refresh" size={22} color="var(--accent)" />
          </div>
        )}

        {graph && graph.nodes.length === 0 && !loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <Icon name="target" size={36} color="var(--rule-strong)" />
            <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: 0 }}>No targets in this project yet.</p>
          </div>
        )}

        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  )
}
