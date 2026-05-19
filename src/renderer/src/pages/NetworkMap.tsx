import { useState, useEffect, useRef, useCallback } from 'react'
import cytoscape from 'cytoscape'
import Icon from '@/components/Icon'
import { getApiBase } from '@/lib/config'
import { useAppStore } from '@/stores/appStore'

interface GraphNode {
  id: string
  label: string
  type: 'root' | 'target'
  severity: string | null
  finding_count: number
  target_type: string | null
}

interface GraphEdge {
  source: string
  target: string
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const SEVERITY_COLOR: Record<string, { bg: string; border: string; glow: string }> = {
  critical: { bg: '#2a0a0a', border: '#e84040', glow: 'rgba(232,64,64,0.6)' },
  high:     { bg: '#2a1500', border: '#f97316', glow: 'rgba(249,115,22,0.5)' },
  medium:   { bg: '#1f1600', border: '#f0a83a', glow: 'rgba(240,168,58,0.4)' },
  low:      { bg: '#0a2010', border: '#54af61', glow: 'rgba(84,175,97,0.4)' },
  info:     { bg: '#0a1520', border: 'var(--med)', glow: 'rgba(180,130,60,0.4)' },
  none:     { bg: '#1a1714', border: '#3a3530', glow: 'rgba(58,53,48,0.3)' },
}

const SEV_INLINE: Record<string, { color: string; border: string; bg: string }> = {
  critical: { color: 'var(--crit)',   border: 'rgba(232,64,64,0.4)',  bg: 'rgba(232,64,64,0.08)' },
  high:     { color: '#f97316',       border: 'rgba(249,115,22,0.4)', bg: 'rgba(249,115,22,0.08)' },
  medium:   { color: 'var(--accent)', border: 'rgba(240,168,58,0.4)', bg: 'rgba(240,168,58,0.08)' },
  low:      { color: 'var(--ok)',     border: 'rgba(84,175,97,0.4)',  bg: 'rgba(84,175,97,0.08)' },
  info:     { color: 'var(--med)',     border: 'rgba(180,130,60,0.4)',  bg: 'rgba(180,130,60,0.08)' },
  none:     { color: 'var(--fg-3)',   border: 'var(--rule-strong)',   bg: 'transparent' },
}

const TARGET_ICONS: Record<string, string> = {
  linux_host:   '⬡',
  windows_host: '▣',
  web_app:      '◈',
  cloud_aws:    '◉',
  cloud_azure:  '◉',
  cloud_gcp:    '◉',
  network:      '◎',
  api_endpoint: '⊕',
}

const rule = '1px solid var(--rule)'

export default function NetworkMap() {
  const { selectedProject: sp } = useAppStore()
  const projectId = sp?.id ?? ''
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (projectId) loadGraph()
  }, [projectId])

  async function loadGraph() {
    setLoading(true)
    setSelectedNode(null)
    const res = await fetch(`${getApiBase()}/network/graph?project_id=${projectId}`)
    const data = await res.json()
    setGraph(data)
    setLoading(false)
  }

  const initCy = useCallback(() => {
    if (!graph || !containerRef.current) return
    if (cyRef.current) cyRef.current.destroy()

    const elements: cytoscape.ElementDefinition[] = [
      ...graph.nodes.map(n => {
        const col = n.type === 'root'
          ? { bg: '#1a1400', border: '#f0a83a', glow: 'rgba(240,168,58,0.7)' }
          : SEVERITY_COLOR[n.severity || 'none']
        return { data: { ...n, ...col } }
      }),
      ...graph.edges.map((e, i) => ({
        data: { id: `e${i}`, source: e.source, target: e.target },
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
          selector: 'node[type="root"]',
          style: { 'shape': 'diamond', 'width': 48, 'height': 48 },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 2.5, 'border-color': '#f0a83a' },
        },
        {
          selector: 'edge',
          style: {
            'width': 1,
            'line-color': '#2a2520',
            'target-arrow-color': '#2a2520',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'opacity': 0.6,
          },
        },
        {
          selector: 'edge:selected',
          style: { 'line-color': '#f0a83a', 'target-arrow-color': '#f0a83a', 'opacity': 1 },
        },
      ],
      layout: {
        name: 'cose',
        animate: true,
        animationDuration: 500,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 120,
        gravity: 0.8,
        randomize: false,
      } as any,
      minZoom: 0.2,
      maxZoom: 4,
    })

    cy.on('tap', 'node', (evt) => {
      const nodeData = evt.target.data() as GraphNode & { bg: string; border: string; glow: string }
      setSelectedNode(nodeData)
    })
    cy.on('tap', (evt) => { if (evt.target === cy) setSelectedNode(null) })
    cyRef.current = cy
  }, [graph])

  useEffect(() => { initCy() }, [initCy])

  function exportPNG() {
    if (!cyRef.current) return
    const png = cyRef.current.png({ full: true, scale: 2, bg: '#0d0c0a' })
    const a = document.createElement('a')
    a.href = png
    a.download = 'network-map.png'
    a.click()
  }

  const targets = graph?.nodes.filter(n => n.type === 'target') ?? []

  return (
    <div style={{ display: 'flex', height: '100%', gap: 16, padding: '20px 24px', minHeight: 0, boxSizing: 'border-box' }}>

      {/* ── Left panel ── */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ paddingBottom: 12, borderBottom: rule }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Icon name="network" size={15} color="var(--accent)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Network Map</span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0 }}>Target topology visualisation</p>
        </div>

        {/* Refresh */}
        <button
          onClick={loadGraph}
          disabled={!projectId || loading}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '5px 10px', border: '1px solid var(--rule-strong)', borderRadius: 3, background: 'transparent', color: 'var(--fg-2)', fontSize: 11, cursor: 'pointer', opacity: (!projectId || loading) ? 0.5 : 1 }}
        >
          <Icon name="refresh" size={11} color={loading ? 'var(--accent)' : 'currentColor'} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>

        {/* Legend */}
        <div style={{ border: rule, borderRadius: 4, padding: '10px 12px' }}>
          <p style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, margin: '0 0 8px' }}>Legend</p>
          {(['critical','high','medium','low','info','none'] as const).map(sev => {
            const c = SEVERITY_COLOR[sev]
            return (
              <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: c.bg, border: `1.5px solid ${c.border}`, boxShadow: `0 0 5px ${c.glow}` }} />
                <span style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'capitalize' }}>{sev === 'none' ? 'No findings' : sev}</span>
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <div style={{ width: 12, height: 12, flexShrink: 0, background: '#1a1400', border: '1.5px solid #f0a83a', transform: 'rotate(45deg)', boxShadow: '0 0 5px rgba(240,168,58,0.6)' }} />
            <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>Seraph (root)</span>
          </div>
        </div>

        {/* Selected node detail */}
        {selectedNode && selectedNode.type === 'target' && (() => {
          const sev = selectedNode.severity || 'none'
          const ss = SEV_INLINE[sev]
          return (
            <div style={{ border: rule, borderRadius: 4, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, margin: '0 0 8px' }}>Selected</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)', margin: '0 0 8px', wordBreak: 'break-all' }}>{selectedNode.label}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <span style={{ color: 'var(--fg-3)', width: 50, flexShrink: 0 }}>Risk</span>
                  <span style={{ padding: '1px 6px', borderRadius: 2, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: ss.color, border: `1px solid ${ss.border}`, background: ss.bg }}>
                    {sev === 'none' ? 'clean' : sev}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <span style={{ color: 'var(--fg-3)', width: 50, flexShrink: 0 }}>Type</span>
                  <span style={{ color: 'var(--fg-2)' }}>{TARGET_ICONS[selectedNode.target_type || ''] || '○'} {(selectedNode.target_type || '').replace(/_/g, ' ')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <span style={{ color: 'var(--fg-3)', width: 50, flexShrink: 0 }}>Findings</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-2)' }}>{selectedNode.finding_count}</span>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Stats */}
        {graph && (
          <div style={{ border: rule, borderRadius: 4, padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, margin: '0 0 8px' }}>Stats</p>
            {[
              { label: 'Targets', value: targets.length, color: 'var(--fg)' },
              { label: 'Connections', value: graph.edges.length, color: 'var(--fg)' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{row.label}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: row.color }}>{row.value}</span>
              </div>
            ))}
            {(['critical','high','medium'] as const).map(sev => {
              const count = graph.nodes.filter(n => n.severity === sev).length
              if (!count) return null
              return (
                <div key={sev} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'capitalize' }}>{sev}</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: SEV_INLINE[sev].color }}>{count}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Export */}
        {graph && (
          <button
            onClick={exportPNG}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--rule-strong)', borderRadius: 3, background: 'transparent', color: 'var(--fg-2)', fontSize: 11, cursor: 'pointer' }}
          >
            <Icon name="download" size={11} /> Export PNG
          </button>
        )}
      </div>

      {/* ── Graph canvas ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 12, flexShrink: 0 }}>
          {[
            { icon: 'plus',    title: 'Zoom in',  action: () => cyRef.current?.zoom((cyRef.current?.zoom() ?? 1) * 1.2) },
            { icon: 'minus',   title: 'Zoom out', action: () => cyRef.current?.zoom((cyRef.current?.zoom() ?? 1) / 1.2) },
            { icon: 'eye',     title: 'Fit all',  action: () => cyRef.current?.fit(undefined, 40) },
          ].map(btn => (
            <button
              key={btn.icon}
              onClick={btn.action}
              title={btn.title}
              style={{ padding: '5px 7px', border: '1px solid var(--rule-strong)', borderRadius: 3, background: 'transparent', cursor: 'pointer', color: 'var(--fg-3)', display: 'flex' }}
            >
              <Icon name={btn.icon} size={13} />
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, minHeight: 0, border: rule, borderRadius: 4, position: 'relative', overflow: 'hidden', background: '#0d0c0a' }}>
          <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

          {!graph && !loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <Icon name="network" size={36} color="var(--rule-strong)" />
              <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: 0 }}>Select a project to visualize its network</p>
            </div>
          )}

          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Icon name="refresh" size={18} color="var(--accent)" />
              <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>Building graph…</span>
            </div>
          )}

          {graph && targets.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <Icon name="shield" size={36} color="var(--rule-strong)" />
              <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: 0 }}>No targets found in this project</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
