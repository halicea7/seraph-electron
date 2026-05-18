import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Play, CheckCircle, XCircle, SkipForward,
  Loader, Clock, StepForward,
  Zap, History, Target, Brain,
  Plus, Trash2, ArrowUp, ArrowDown, Layers, PenLine, Save,
} from 'lucide-react'
import Icon from '@/components/Icon'
import type { Project } from '../types'
import { getApiBase, getWsBase } from '@/lib/config'

// ── Interfaces ────────────────────────────────────────────────────────────────

interface PlaybookStep {
  name: string
  scan_type: string
  cmd_template: string
  description: string
  conditional: boolean
  trigger_ports: number[]
  timeout: number
  parallel: boolean
}

interface Playbook {
  id: string
  name: string
  description: string
  is_builtin: boolean
  step_count: number
  steps: PlaybookStep[]
  created_at: string
}

interface PlaybookRun {
  id: string
  playbook_id: string
  playbook_name: string
  project_id: string
  target_id: string
  target_host: string
  mode: string
  status: string
  current_step: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}

interface StepState {
  step: number
  tool: string
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed'
  findings: number
  reason?: string
  parallel: boolean
}

interface PausedState {
  step: number
  tool: string
  description: string
  parallel: boolean
  groupSteps: { tool: string; description: string }[]
}

interface TargetOption {
  id: string
  hostname_or_ip: string
}

interface BuilderStep {
  name: string
  scan_type: string
  cmd_template: string
  description: string
  conditional: boolean
  trigger_ports_raw: string
  timeout: number
  parallel: boolean
}

const BLANK_STEP: BuilderStep = {
  name: '', scan_type: '', cmd_template: '', description: '',
  conditional: false, trigger_ports_raw: '', timeout: 300, parallel: false,
}

// ── Display maps ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { color: string; background: string; border: string }> = {
  completed: { color: 'var(--ok)',    background: 'rgba(84,175,97,0.08)',   border: '1px solid rgba(84,175,97,0.3)' },
  running:   { color: '#60a5fa',      background: 'rgba(96,165,250,0.08)',  border: '1px solid rgba(96,165,250,0.3)' },
  paused:    { color: 'var(--accent)',background: 'rgba(240,168,58,0.08)',  border: '1px solid rgba(240,168,58,0.3)' },
  failed:    { color: 'var(--crit)',  background: 'rgba(232,64,64,0.08)',   border: '1px solid rgba(232,64,64,0.3)' },
  pending:   { color: 'var(--fg-3)', background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.2)' },
  skipped:   { color: 'var(--fg-3)', background: 'rgba(58,53,48,0.2)',     border: '1px solid var(--rule-strong)' },
}

const STEP_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle size={13} color="var(--ok)" />,
  running:   <Loader size={13} color="#60a5fa" style={{ animation: 'spin 1s linear infinite' }} />,
  skipped:   <SkipForward size={13} color="var(--fg-3)" />,
  failed:    <XCircle size={13} color="var(--crit)" />,
  pending:   <Clock size={13} color="var(--fg-3)" />,
}

const GROUP_PALETTE = ['#06b6d4', '#a855f7', '#10b981', '#f59e0b', '#ec4899']

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildGroups<T extends { parallel: boolean }>(steps: T[]): number[][] {
  const groups: number[][] = []
  steps.forEach((s, i) => {
    if (s.parallel && groups.length > 0) groups[groups.length - 1].push(i)
    else groups.push([i])
  })
  return groups
}

function stepGroupMap(groups: number[][]): Record<number, number> {
  const m: Record<number, number> = {}
  groups.forEach((g, gi) => g.forEach(si => (m[si] = gi)))
  return m
}

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

// ── Reusable input style ──────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg)', border: ruleStrong, borderRadius: 3,
  padding: '6px 10px', fontSize: 12, color: 'var(--fg)',
  fontFamily: 'var(--font-sans)', outline: 'none',
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, accentColor = 'var(--accent)' }: { checked: boolean; onChange: () => void; accentColor?: string }) {
  return (
    <button
      onClick={onChange}
      style={{ position: 'relative', width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: checked ? accentColor : 'var(--rule-strong)', transition: 'background 0.2s', flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Playbooks() {
  const [view, setView] = useState<'library' | 'run' | 'history' | 'builder'>('library')
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [runs, setRuns] = useState<PlaybookRun[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [targets, setTargets] = useState<TargetOption[]>([])

  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null)
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedTarget, setSelectedTarget] = useState('')
  const [mode, setMode] = useState<'auto' | 'step_through'>('auto')
  const [useAi, setUseAi] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [starting, setStarting] = useState(false)

  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<string>('pending')
  const [steps, setSteps] = useState<StepState[]>([])
  const [totalFindings, setTotalFindings] = useState(0)
  const [currentTool, setCurrentTool] = useState('')
  const [paused, setPaused] = useState(false)
  const [pausedState, setPausedState] = useState<PausedState | null>(null)
  const [stepInsights, setStepInsights] = useState<Record<number, string>>({})
  const [lastInsight, setLastInsight] = useState('')
  const termRef = useRef<HTMLDivElement>(null)
  const [termLines, setTermLines] = useState<string[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  const [builderName, setBuilderName] = useState('')
  const [builderDesc, setBuilderDesc] = useState('')
  const [builderSteps, setBuilderSteps] = useState<BuilderStep[]>([])
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingPlaybookId, setEditingPlaybookId] = useState<string | null>(null)
  const [builderError, setBuilderError] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [showFlowPreview, setShowFlowPreview] = useState(false)

  const runGroups = useMemo(() => buildGroups(steps), [steps])
  const builderGroups = useMemo(() => buildGroups(builderSteps), [builderSteps])

  useEffect(() => { loadPlaybooks(); loadRuns(); loadProjects() }, [])
  useEffect(() => { if (selectedProject) loadTargets(selectedProject); else setTargets([]) }, [selectedProject])
  useEffect(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight }, [termLines])

  async function loadPlaybooks() {
    const res = await fetch(`${getApiBase()}/playbooks`)
    if (res.ok) setPlaybooks(await res.json())
  }
  async function loadRuns() {
    const res = await fetch(`${getApiBase()}/playbooks/runs`)
    if (res.ok) setRuns(await res.json())
  }
  async function loadProjects() {
    const res = await fetch(`${getApiBase()}/projects`)
    if (res.ok) setProjects(await res.json())
  }
  async function loadTargets(projectId: string) {
    const res = await fetch(`${getApiBase()}/projects/${projectId}/targets`)
    if (res.ok) setTargets(await res.json())
  }

  function openWizard(pb: Playbook) {
    setSelectedPlaybook(pb)
    setSelectedProject('')
    setSelectedTarget('')
    setMode('auto')
    setUseAi(false)
    setShowWizard(true)
  }

  async function handleStartRun() {
    if (!selectedPlaybook || !selectedProject || !selectedTarget) return
    setStarting(true)
    try {
      const res = await fetch(`${getApiBase()}/playbooks/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playbook_id: selectedPlaybook.id, project_id: selectedProject, target_id: selectedTarget, mode }),
      })
      if (!res.ok) throw new Error('Failed to start run')
      const data = await res.json()
      setShowWizard(false)
      beginRun(data.run_id, selectedPlaybook, mode, useAi)
    } catch (err) {
      console.error(err)
    } finally {
      setStarting(false)
    }
  }

  function beginRun(runId: string, pb: Playbook, _runMode: string, aiEnabled = false) {
    setActiveRunId(runId)
    setRunStatus('running')
    setTermLines([])
    setTotalFindings(0)
    setPaused(false)
    setPausedState(null)
    setCurrentTool('')
    setStepInsights({})
    setLastInsight('')
    setSteps(pb.steps.map((s, i) => ({ step: i, tool: s.name, status: 'pending', findings: 0, parallel: s.parallel ?? false })))
    setView('run')

    const ws = new WebSocket(`${getWsBase()}/ws/playbooks/${runId}${aiEnabled ? '?use_ai=true' : ''}`)
    wsRef.current = ws
    ws.onmessage = (evt) => handleWsMessage(JSON.parse(evt.data))
    ws.onerror = () => appendLine('\x1b[31m[WebSocket error]\x1b[0m')
    ws.onclose = () => appendLine('\x1b[90m[connection closed]\x1b[0m')
  }

  function appendLine(text: string) { setTermLines(prev => [...prev, text]) }

  function handleWsMessage(msg: any) {
    switch (msg.type) {
      case 'run_start':
        appendLine(`\x1b[36m[▶] Playbook started — ${msg.total_steps} steps\x1b[0m`)
        break
      case 'step_start':
        setCurrentTool(msg.tool)
        setSteps(prev => prev.map(s => s.step === msg.step ? { ...s, status: 'running' } : s))
        appendLine(`\n\x1b[33m[${msg.step + 1}] ${msg.tool}\x1b[0m — ${msg.description}`)
        appendLine(`\x1b[90m$ ${msg.cmd}\x1b[0m`)
        break
      case 'step_done':
        setSteps(prev => prev.map(s => s.step === msg.step ? { ...s, status: 'completed', findings: msg.findings } : s))
        setTotalFindings(prev => prev + (msg.findings || 0))
        appendLine(`\x1b[32m[✓] ${msg.tool} done — ${msg.findings} finding(s)\x1b[0m`)
        break
      case 'step_skip':
        setSteps(prev => prev.map(s => s.step === msg.step ? { ...s, status: 'skipped', reason: msg.reason } : s))
        appendLine(`\x1b[90m[⤳] ${msg.tool} skipped: ${msg.reason}\x1b[0m`)
        break
      case 'paused': {
        const gs: { tool: string; description: string }[] = msg.group_steps ?? [{ tool: msg.tool, description: msg.description }]
        setPaused(true)
        setPausedState({ step: msg.step, tool: msg.tool, description: msg.description, parallel: msg.parallel ?? false, groupSteps: gs })
        setRunStatus('paused')
        const label = msg.parallel ? `parallel group (${gs.length} tools)` : msg.tool
        appendLine(`\n\x1b[33m[⏸] Paused before: ${label}\x1b[0m`)
        break
      }
      case 'stdout': appendLine(msg.data.replace(/\n$/, '')); break
      case 'step_ai':
        setStepInsights(prev => ({ ...prev, [msg.step]: msg.insight }))
        setLastInsight(msg.insight)
        appendLine(`\x1b[35m[AI] ${msg.insight}\x1b[0m`)
        break
      case 'complete':
        setRunStatus('completed')
        setCurrentTool('')
        setTotalFindings(msg.total_findings)
        appendLine(`\n\x1b[32m[✓] Playbook complete — ${msg.total_findings} total findings\x1b[0m`)
        loadRuns()
        break
      case 'error':
        setRunStatus('failed')
        appendLine(`\x1b[31m[✗] ${msg.data}\x1b[0m`)
        break
    }
  }

  function handleContinue() {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'continue' }))
      setPaused(false)
      setPausedState(null)
      setRunStatus('running')
    }
  }

  function resetBuilder() {
    setBuilderName('')
    setBuilderDesc('')
    setBuilderSteps([])
    setEditingIdx(null)
    setEditingPlaybookId(null)
    setBuilderError('')
  }

  function loadPlaybookForEdit(pb: Playbook) {
    setBuilderName(pb.name)
    setBuilderDesc(pb.description)
    setBuilderSteps(pb.steps.map(s => ({
      name: s.name, scan_type: s.scan_type, cmd_template: s.cmd_template,
      description: s.description, conditional: s.conditional,
      trigger_ports_raw: s.trigger_ports.join(','), timeout: s.timeout, parallel: s.parallel ?? false,
    })))
    setEditingIdx(null)
    setEditingPlaybookId(pb.id)
    setBuilderError('')
    setView('builder')
  }

  function addStep() {
    setBuilderSteps(prev => [...prev, { ...BLANK_STEP }])
    setEditingIdx(builderSteps.length)
  }

  function removeStep(i: number) {
    setBuilderSteps(prev => {
      const next = prev.filter((_, idx) => idx !== i)
      if (next[i]?.parallel && (i === 0 || !next[i - 1])) next[i] = { ...next[i], parallel: false }
      return next
    })
    if (editingIdx === i) setEditingIdx(null)
    else if (editingIdx !== null && editingIdx > i) setEditingIdx(editingIdx - 1)
  }

  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= builderSteps.length) return
    setBuilderSteps(prev => { const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next })
    if (editingIdx === i) setEditingIdx(j)
    else if (editingIdx === j) setEditingIdx(i)
  }

  function updateStep(i: number, patch: Partial<BuilderStep>) {
    setBuilderSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }

  function handleDragStart(i: number) { setDragIdx(i) }

  function handleDragOver(e: React.DragEvent, i: number) { e.preventDefault(); setDragOverIdx(i) }

  function handleDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDragOverIdx(null); return }
    setBuilderSteps(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIdx, 1)
      next.splice(targetIdx, 0, moved)
      return next
    })
    if (editingIdx === dragIdx) setEditingIdx(targetIdx)
    setDragIdx(null); setDragOverIdx(null)
  }

  function handleDragEnd() { setDragIdx(null); setDragOverIdx(null) }

  function toApiStep(s: BuilderStep) {
    return {
      name: s.name.trim(), scan_type: s.scan_type.trim() || s.name.trim(),
      cmd_template: s.cmd_template.trim(), description: s.description.trim(),
      conditional: s.conditional, trigger_ports: s.trigger_ports_raw.split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p)),
      timeout: s.timeout, parallel: s.parallel,
    }
  }

  async function handleSavePlaybook() {
    setBuilderError('')
    if (!builderName.trim()) { setBuilderError('Playbook name is required.'); return }
    if (builderSteps.length === 0) { setBuilderError('Add at least one step.'); return }
    for (const s of builderSteps) {
      if (!s.name.trim() || !s.cmd_template.trim()) { setBuilderError('Each step needs a tool name and command template.'); return }
    }
    setSaving(true)
    try {
      const body = { name: builderName.trim(), description: builderDesc.trim(), steps: builderSteps.map(toApiStep) }
      const url = editingPlaybookId ? `${getApiBase()}/playbooks/${editingPlaybookId}` : `${getApiBase()}/playbooks`
      const res = await fetch(url, { method: editingPlaybookId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      await loadPlaybooks()
      resetBuilder()
      setView('library')
    } catch (err: any) {
      setBuilderError(err.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePlaybook(id: string) {
    if (!confirm('Delete this playbook?')) return
    await fetch(`${getApiBase()}/playbooks/${id}`, { method: 'DELETE' })
    loadPlaybooks()
  }

  function formatDate(s: string | null) {
    if (!s || s === 'None') return '—'
    try { return new Date(s).toLocaleString() } catch { return s }
  }

  const statusStyle = STATUS_STYLE[runStatus] ?? STATUS_STYLE.pending

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Icon name="book" size={15} color="var(--accent)" />
            <h1 style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Playbooks</h1>
          </div>
          <p style={{ fontSize: 12, color: 'var(--fg-3)', margin: 0 }}>Pre-defined and custom tool chains with parallel execution support</p>
        </div>
        {view === 'library' && (
          <button
            onClick={() => { resetBuilder(); setView('builder') }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 3, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: 'var(--bg)', fontSize: 12, fontWeight: 700 }}
          >
            <Plus size={13} /> New Playbook
          </button>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 2, borderBottom: rule, flexShrink: 0 }}>
        {([
          { id: 'library', label: 'Library',     icon: 'book' },
          { id: 'run',     label: 'Active Run',  icon: 'terminal' },
          { id: 'history', label: 'History',     icon: 'history' },
          { id: 'builder', label: 'Builder',     icon: 'edit' },
        ] as const).map(tab => {
          const isActive = view === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600,
                background: 'none', border: 'none', cursor: 'pointer',
                color: isActive ? 'var(--fg)' : 'var(--fg-3)',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              <Icon name={tab.icon} size={12} />
              {tab.label}
              {tab.id === 'run' && activeRunId && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', marginLeft: 2,
                  background: runStatus === 'running' ? 'var(--accent)' : runStatus === 'paused' ? '#f59e0b' : runStatus === 'completed' ? 'var(--ok)' : 'var(--fg-3)',
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>

        {/* ── Library ── */}
        {view === 'library' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {playbooks.map(pb => {
              const pbGroups = buildGroups(pb.steps)
              const parallelCount = pbGroups.filter(g => g.length > 1).length
              return (
                <div key={pb.id} style={{ border: rule, borderRadius: 4, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                        <Icon name="shield" size={13} color="var(--accent)" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{pb.name}</span>
                        {pb.is_builtin && (
                          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 2, color: 'var(--accent)', border: '1px solid rgba(240,168,58,0.3)', background: 'rgba(240,168,58,0.08)' }}>
                            built-in
                          </span>
                        )}
                        {parallelCount > 0 && (
                          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 2, color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Layers size={9} /> {parallelCount} parallel
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--fg-3)', margin: 0 }}>{pb.description}</p>
                    </div>
                    {!pb.is_builtin && (
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button onClick={() => loadPlaybookForEdit(pb)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 4 }}>
                          <Icon name="edit" size={13} />
                        </button>
                        <button onClick={() => handleDeletePlaybook(pb.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 4 }}>
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Step list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                    {(() => {
                      const gs = buildGroups(pb.steps)
                      const gm = stepGroupMap(gs)
                      return pb.steps.map((step, i) => {
                        const gi = gm[i]
                        const isParGroup = gs[gi].length > 1
                        const groupColor = GROUP_PALETTE[gi % GROUP_PALETTE.length]
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-3)', paddingLeft: isParGroup ? 6 : 4, borderLeft: isParGroup ? `2px solid ${groupColor}40` : 'none' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                            {step.parallel
                              ? <span style={{ color: '#a855f7', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>∥</span>
                              : <Icon name="chev_r" size={10} color="var(--fg-3)" />}
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-2)' }}>{step.name}</span>
                            {step.conditional && <span style={{ fontSize: 10, color: 'var(--fg-3)', fontStyle: 'italic' }}>cond.</span>}
                          </div>
                        )
                      })
                    })()}
                  </div>

                  <button
                    onClick={() => openWizard(pb)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 0', borderRadius: 3, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: 'var(--bg)', fontSize: 12, fontWeight: 700 }}
                  >
                    <Play size={12} /> Run Playbook
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Active Run ── */}
        {view === 'run' && (
          <div style={{ height: '100%' }}>
            {!activeRunId ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, height: 240, border: rule, borderRadius: 4 }}>
                <Icon name="terminal" size={36} color="var(--rule-strong)" />
                <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: 0 }}>No active run. Select a playbook from the Library tab and click Run.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12, height: 'calc(100vh - 240px)' }}>
                {/* Step progress panel */}
                <div style={{ border: rule, borderRadius: 4, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>Steps</span>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 2, fontWeight: 600, textTransform: 'capitalize', ...statusStyle }}>
                      {runStatus}
                    </span>
                  </div>

                  {runGroups.map((group, gi) => {
                    const isParGroup = group.length > 1
                    const groupColor = GROUP_PALETTE[gi % GROUP_PALETTE.length]
                    return (
                      <div key={gi} style={{ borderLeft: isParGroup ? `2px solid ${groupColor}40` : 'none', paddingLeft: isParGroup ? 6 : 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {isParGroup && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            <Layers size={9} color="#a855f7" />
                            <span style={{ fontSize: 9, color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>parallel</span>
                          </div>
                        )}
                        {group.map(si => {
                          const s = steps[si]
                          if (!s) return null
                          const stepStatus = STATUS_STYLE[s.status] ?? STATUS_STYLE.pending
                          return (
                            <div key={si} style={{ borderRadius: 3, padding: '7px 10px', border: stepStatus.border, background: stepStatus.background, transition: 'all 0.2s' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                {STEP_ICON[s.status] ?? STEP_ICON.pending}
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: stepStatus.color, flex: 1 }}>{s.tool}</span>
                                {s.findings > 0 && <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{s.findings}f</span>}
                              </div>
                              {s.reason && <p style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 3, paddingLeft: 20 }}>{s.reason}</p>}
                              {stepInsights[s.step] && s.status === 'completed' && (
                                <div style={{ marginTop: 5, marginLeft: 20, borderLeft: '2px solid rgba(168,85,247,0.4)', paddingLeft: 6, display: 'flex', gap: 5 }}>
                                  <Brain size={9} color="#a855f7" style={{ marginTop: 1, flexShrink: 0 }} />
                                  <p style={{ fontSize: 10, color: '#c4b5fd', lineHeight: 1.5, margin: 0 }}>{stepInsights[s.step]}</p>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}

                  {runStatus === 'completed' && (
                    <div style={{ borderRadius: 3, padding: '8px 12px', border: '1px solid rgba(84,175,97,0.3)', background: 'rgba(84,175,97,0.06)', textAlign: 'center', marginTop: 4 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ok)', fontFamily: 'var(--font-mono)' }}>{totalFindings}</div>
                      <div style={{ fontSize: 10, color: 'var(--ok)', opacity: 0.7 }}>total findings</div>
                    </div>
                  )}

                  {paused && pausedState && (
                    <div style={{ borderRadius: 3, padding: '10px 12px', border: '1px solid rgba(240,168,58,0.3)', background: 'rgba(240,168,58,0.05)', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      {lastInsight && (
                        <div style={{ borderRadius: 3, border: '1px solid rgba(168,85,247,0.2)', padding: '8px 10px', background: 'rgba(168,85,247,0.06)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                            <Brain size={10} color="#a855f7" />
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI Analysis</span>
                          </div>
                          <p style={{ fontSize: 11, color: '#ddd6fe', lineHeight: 1.5, margin: 0 }}>{lastInsight}</p>
                        </div>
                      )}
                      {pausedState.parallel ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                            <Layers size={11} /> Next: parallel group ({pausedState.groupSteps.length} tools)
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 4 }}>
                            {pausedState.groupSteps.map((gs, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--fg-3)' }}>
                                <span style={{ color: '#a855f7', fontFamily: 'var(--font-mono)' }}>∥</span>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-2)' }}>{gs.tool}</span>
                                <span style={{ color: 'var(--fg-3)' }}>{gs.description}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Next: {pausedState.tool}</div>
                          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{pausedState.description}</div>
                        </>
                      )}
                      <button
                        onClick={handleContinue}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 0', borderRadius: 3, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: 'var(--bg)', fontSize: 12, fontWeight: 700 }}
                      >
                        <StepForward size={12} /> Continue
                      </button>
                    </div>
                  )}
                </div>

                {/* Terminal */}
                <div
                  ref={termRef}
                  style={{ border: rule, borderRadius: 4, padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)', overflowY: 'auto', lineHeight: 1.6, background: 'var(--bg)' }}
                >
                  {termLines.map((line, i) => (
                    <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                      dangerouslySetInnerHTML={{ __html: ansiToHtml(line) }}
                    />
                  ))}
                  {runStatus === 'running' && currentTool && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#60a5fa', marginTop: 4 }}>
                      <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>{currentTool} running…</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── History ── */}
        {view === 'history' && (
          <div>
            {runs.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '64px 0', border: rule, borderRadius: 4 }}>
                <Icon name="history" size={36} color="var(--rule-strong)" />
                <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: 0 }}>No runs yet.</p>
              </div>
            ) : (
              <div style={{ border: rule, borderRadius: 4, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: rule, background: 'var(--bg-2)' }}>
                      {['Playbook', 'Target', 'Mode', 'Status', 'Started', 'Completed'].map(h => (
                        <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map(run => {
                      const ss = STATUS_STYLE[run.status] ?? STATUS_STYLE.pending
                      return (
                        <tr key={run.id} style={{ borderBottom: rule }}>
                          <td style={{ padding: '9px 14px', color: 'var(--fg)', fontWeight: 500 }}>{run.playbook_name}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', color: 'var(--fg-2)', fontSize: 11 }}>{run.target_host}</td>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fg-3)' }}>
                              {run.mode === 'step_through' ? <StepForward size={11} /> : <Zap size={11} />}
                              {run.mode === 'step_through' ? 'Step-through' : 'Auto'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 2, fontWeight: 600, textTransform: 'capitalize', ...ss }}>
                              {run.status}
                            </span>
                          </td>
                          <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--fg-3)' }}>{formatDate(run.started_at)}</td>
                          <td style={{ padding: '9px 14px', fontSize: 11, color: 'var(--fg-3)' }}>{formatDate(run.completed_at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Builder ── */}
        {view === 'builder' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Metadata */}
            <div style={{ border: rule, borderRadius: 4, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <PenLine size={14} color="var(--accent)" />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
                  {editingPlaybookId ? 'Edit Playbook' : 'New Playbook'}
                </span>
                {editingPlaybookId && (
                  <button onClick={resetBuilder} style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="x" size={11} /> Clear
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>Name *</label>
                  <input value={builderName} onChange={e => setBuilderName(e.target.value)} placeholder="e.g. Custom Web Audit" style={{ ...INPUT_STYLE, marginTop: 5 }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>Description</label>
                  <input value={builderDesc} onChange={e => setBuilderDesc(e.target.value)} placeholder="What does this playbook do?" style={{ ...INPUT_STYLE, marginTop: 5 }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: editingIdx !== null ? '1fr 360px' : '1fr', gap: 12 }}>
              {/* Step list */}
              <div style={{ border: rule, borderRadius: 4, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>
                    Steps ({builderSteps.length})
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>Drag to reorder</span>
                    <button
                      onClick={() => setShowFlowPreview(p => !p)}
                      style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 2, cursor: 'pointer',
                        ...(showFlowPreview
                          ? { color: 'var(--accent)', border: '1px solid rgba(240,168,58,0.4)', background: 'rgba(240,168,58,0.08)' }
                          : { color: 'var(--fg-3)', border: ruleStrong, background: 'transparent' }),
                      }}
                    >
                      {showFlowPreview ? 'Hide' : 'Flow'} preview
                    </button>
                  </div>
                </div>

                {builderSteps.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--fg-3)', fontSize: 13 }}>
                    No steps yet. Click "Add Step" to begin.
                  </div>
                )}

                {builderGroups.map((group, gi) => {
                  const isParGroup = group.length > 1
                  const groupColor = GROUP_PALETTE[gi % GROUP_PALETTE.length]
                  return (
                    <div key={gi} style={{ borderLeft: isParGroup ? `2px solid ${groupColor}40` : 'none', paddingLeft: isParGroup ? 8 : 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {isParGroup && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <Layers size={9} color="#a855f7" />
                          <span style={{ fontSize: 9, color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            parallel group — runs simultaneously
                          </span>
                        </div>
                      )}
                      {group.map(si => {
                        const s = builderSteps[si]
                        const isEditing = editingIdx === si
                        const isDragging = dragIdx === si
                        const isDragOver = dragOverIdx === si && dragIdx !== si
                        return (
                          <div
                            key={si}
                            draggable
                            onDragStart={() => handleDragStart(si)}
                            onDragOver={e => handleDragOver(e, si)}
                            onDrop={e => handleDrop(e, si)}
                            onDragEnd={handleDragEnd}
                            onClick={() => setEditingIdx(si)}
                            style={{
                              borderRadius: 3, padding: '8px 10px', cursor: 'grab', transition: 'all 0.15s',
                              border: isDragOver ? '1px solid var(--accent)' : isEditing ? '1px solid rgba(240,168,58,0.4)' : ruleStrong,
                              background: isDragOver ? 'rgba(240,168,58,0.08)' : isEditing ? 'rgba(240,168,58,0.04)' : 'transparent',
                              opacity: isDragging ? 0.4 : 1,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                <button onClick={() => moveStep(si, -1)} disabled={si === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, opacity: si === 0 ? 0.2 : 1 }}>
                                  <ArrowUp size={11} />
                                </button>
                                <button onClick={() => moveStep(si, 1)} disabled={si === builderSteps.length - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, opacity: si === builderSteps.length - 1 ? 0.2 : 1 }}>
                                  <ArrowDown size={11} />
                                </button>
                              </div>

                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', width: 18, textAlign: 'right', flexShrink: 0 }}>{si + 1}</span>

                              {s.parallel
                                ? <span style={{ color: '#a855f7', fontSize: 12, fontFamily: 'var(--font-mono)', flexShrink: 0 }} title="Runs in parallel">∥</span>
                                : <Icon name="chev_r" size={10} color="var(--fg-3)" />}

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 500, color: s.name ? 'var(--fg-2)' : 'var(--fg-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {s.name || 'unnamed'}
                                  {s.conditional && <span style={{ fontSize: 10, color: 'var(--fg-3)', fontStyle: 'italic', fontFamily: 'var(--font-sans)' }}>cond.</span>}
                                </div>
                                {s.description && <p style={{ fontSize: 10, color: 'var(--fg-3)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.description}</p>}
                              </div>

                              {si > 0 && (
                                <button
                                  onClick={e => { e.stopPropagation(); updateStep(si, { parallel: !s.parallel }) }}
                                  style={{
                                    flexShrink: 0, padding: '2px 7px', borderRadius: 2, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                    ...(s.parallel
                                      ? { border: '1px solid rgba(168,85,247,0.5)', color: '#c4b5fd', background: 'rgba(168,85,247,0.1)' }
                                      : { border: ruleStrong, color: 'var(--fg-3)', background: 'transparent' }),
                                  }}
                                  title={s.parallel ? 'Running in parallel — click to make sequential' : 'Click to run in parallel'}
                                >
                                  {s.parallel ? '∥ parallel' : '→ seq'}
                                </button>
                              )}

                              <button
                                onClick={e => { e.stopPropagation(); removeStep(si) }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 2, flexShrink: 0 }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}

                <button
                  onClick={addStep}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 3, border: '1px dashed var(--rule-strong)', cursor: 'pointer', background: 'transparent', color: 'var(--fg-3)', fontSize: 12, marginTop: 4 }}
                >
                  <Plus size={13} /> Add Step
                </button>

                {/* Flow diagram preview */}
                {showFlowPreview && builderSteps.length > 0 && (
                  <div style={{ marginTop: 8, border: ruleStrong, borderRadius: 3, padding: '12px 14px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Execution flow</div>
                    {builderGroups.map((group, gi) => (
                      <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {gi > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                              <div style={{ width: 1, height: 12, background: 'var(--rule-strong)' }} />
                              <div style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '5px solid var(--rule-strong)' }} />
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, ...(group.length > 1 ? { border: '1px solid rgba(168,85,247,0.2)', borderRadius: 3, padding: '6px', background: 'rgba(168,85,247,0.04)' } : {}) }}>
                          {group.length > 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', paddingRight: 4 }}>
                              <span style={{ fontSize: 9, color: '#a855f7', fontFamily: 'var(--font-mono)', writingMode: 'vertical-rl', transform: 'rotate(-180deg)' }}>∥ parallel</span>
                            </div>
                          )}
                          {group.map((si, i) => {
                            const s = builderSteps[si]
                            const isEd = editingIdx === si
                            return (
                              <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
                                {i > 0 && <div style={{ width: 16, height: 1, background: 'rgba(168,85,247,0.4)', flexShrink: 0 }} />}
                                <div
                                  onClick={() => setEditingIdx(si)}
                                  style={{ flex: 1, minWidth: 0, borderRadius: 3, border: isEd ? '1px solid rgba(240,168,58,0.5)' : ruleStrong, padding: '6px 8px', textAlign: 'center', cursor: 'pointer', background: isEd ? 'rgba(240,168,58,0.06)' : 'var(--bg-2)' }}
                                >
                                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name || `Step ${si + 1}`}</div>
                                  {s.conditional && <div style={{ fontSize: 8, color: 'var(--accent)' }}>◆ cond.</div>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step editor */}
              {editingIdx !== null && builderSteps[editingIdx] && (() => {
                const s = builderSteps[editingIdx]
                return (
                  <div style={{ border: rule, borderRadius: 4, padding: '14px 16px', alignSelf: 'start', position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>Edit Step {editingIdx + 1}</span>
                      <button onClick={() => setEditingIdx(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0 }}>
                        <Icon name="x" size={13} />
                      </button>
                    </div>

                    {[
                      { label: 'Tool Name *', key: 'name', placeholder: 'e.g. nmap', hint: 'Must match the executable name' },
                      { label: 'Scan Type', key: 'scan_type', placeholder: 'e.g. nmap (defaults to tool name)' },
                      { label: 'Description', key: 'description', placeholder: 'Human-readable step description' },
                    ].map(({ label, key, placeholder, hint }) => (
                      <div key={key}>
                        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>{label}</label>
                        {hint && <p style={{ fontSize: 9, color: 'var(--fg-3)', margin: '2px 0 0' }}>{hint}</p>}
                        <input value={(s as any)[key]} onChange={e => updateStep(editingIdx, { [key]: e.target.value })} placeholder={placeholder} style={{ ...INPUT_STYLE, marginTop: 5 }} />
                      </div>
                    ))}

                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>Command Template *</label>
                      <p style={{ fontSize: 9, color: 'var(--fg-3)', margin: '2px 0 0' }}>Use <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{'{{target}}'}</code> as placeholder</p>
                      <textarea
                        value={s.cmd_template}
                        onChange={e => updateStep(editingIdx, { cmd_template: e.target.value })}
                        placeholder="nmap -sV {target}"
                        rows={2}
                        style={{ ...INPUT_STYLE, marginTop: 5, fontFamily: 'var(--font-mono)', resize: 'none', lineHeight: 1.5 }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>Timeout (s)</label>
                        <input type="number" value={s.timeout} onChange={e => updateStep(editingIdx, { timeout: parseInt(e.target.value, 10) || 300 })} style={{ ...INPUT_STYLE, marginTop: 5 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>Trigger Ports</label>
                        <input value={s.trigger_ports_raw} onChange={e => updateStep(editingIdx, { trigger_ports_raw: e.target.value })} placeholder="80,443 (blank = always)" style={{ ...INPUT_STYLE, marginTop: 5 }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: ruleStrong, borderRadius: 3, padding: '9px 12px' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-2)' }}>Conditional</div>
                        <div style={{ fontSize: 10, color: 'var(--fg-3)' }}>Only run if trigger ports are open</div>
                      </div>
                      <Toggle checked={s.conditional} onChange={() => updateStep(editingIdx, { conditional: !s.conditional })} />
                    </div>

                    {editingIdx > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: ruleStrong, borderRadius: 3, padding: '9px 12px' }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Layers size={11} color="#a855f7" /> Run in parallel
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--fg-3)' }}>Execute alongside the previous step's group</div>
                        </div>
                        <Toggle checked={s.parallel} onChange={() => updateStep(editingIdx, { parallel: !s.parallel })} accentColor="#a855f7" />
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Save bar */}
            {builderError && (
              <div style={{ borderRadius: 3, padding: '8px 14px', border: '1px solid rgba(232,64,64,0.3)', background: 'rgba(232,64,64,0.06)', fontSize: 12, color: 'var(--crit)' }}>
                {builderError}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => { resetBuilder(); setView('library') }}
                style={{ padding: '7px 16px', borderRadius: 3, cursor: 'pointer', background: 'transparent', border: ruleStrong, color: 'var(--fg-3)', fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePlaybook}
                disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 20px', borderRadius: 3, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: 'var(--bg)', fontSize: 12, fontWeight: 700, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
                {editingPlaybookId ? 'Save Changes' : 'Create Playbook'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Run Wizard Modal ── */}
      {showWizard && selectedPlaybook && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.75)' }}>
          <div style={{ border: rule, borderRadius: 4, padding: 24, width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 18, background: 'var(--bg-2)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Icon name="play" size={15} color="var(--accent)" />
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Run: {selectedPlaybook.name}</h2>
              </div>
              <p style={{ fontSize: 12, color: 'var(--fg-3)', margin: 0 }}>{selectedPlaybook.description}</p>
            </div>

            {/* Steps preview */}
            <div style={{ border: ruleStrong, borderRadius: 3, padding: '10px 12px', maxHeight: 160, overflowY: 'auto', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(() => {
                const gs = buildGroups(selectedPlaybook.steps)
                const gm = stepGroupMap(gs)
                return selectedPlaybook.steps.map((s, i) => {
                  const isParGroup = gs[gm[i]].length > 1
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-3)', paddingLeft: isParGroup ? 8 : 4, borderLeft: isParGroup ? '1px solid rgba(168,85,247,0.3)' : 'none' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                      {s.parallel ? <span style={{ color: '#a855f7' }}>∥</span> : <Icon name="chev_r" size={10} color="var(--fg-3)" />}
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-2)' }}>{s.name}</span>
                      <span style={{ color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.description}</span>
                      {s.conditional && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-3)', fontStyle: 'italic', flexShrink: 0 }}>if ports</span>}
                    </div>
                  )
                })
              })()}
            </div>

            {/* Project */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>Project</label>
              <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={INPUT_STYLE}>
                <option value="">Select project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Target */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Target size={11} /> Target
              </label>
              <select value={selectedTarget} onChange={e => setSelectedTarget(e.target.value)} disabled={!selectedProject} style={{ ...INPUT_STYLE, opacity: !selectedProject ? 0.5 : 1 }}>
                <option value="">Select target…</option>
                {targets.map(t => <option key={t.id} value={t.id}>{t.hostname_or_ip}</option>)}
              </select>
            </div>

            {/* Execution mode */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)' }}>Execution Mode</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {([
                  { value: 'auto',         label: 'Auto',         icon: <Zap size={13} />,         desc: 'All steps run automatically' },
                  { value: 'step_through', label: 'Step-through', icon: <StepForward size={13} />, desc: 'Pause before each group' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setMode(opt.value)}
                    style={{
                      padding: '10px 12px', textAlign: 'left', borderRadius: 3, cursor: 'pointer',
                      border: mode === opt.value ? '1px solid rgba(240,168,58,0.4)' : ruleStrong,
                      background: mode === opt.value ? 'rgba(240,168,58,0.06)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, marginBottom: 3, color: mode === opt.value ? 'var(--accent)' : 'var(--fg-2)' }}>
                      {opt.icon} {opt.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--fg-3)' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* AI toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: ruleStrong, borderRadius: 3, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Brain size={15} color={useAi ? '#a855f7' : 'var(--fg-3)'} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-2)' }}>AI Assistance</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-3)' }}>Analyze each step's output (requires AI model in Settings)</div>
                </div>
              </div>
              <Toggle checked={useAi} onChange={() => setUseAi(v => !v)} accentColor="#a855f7" />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowWizard(false)} style={{ flex: 1, padding: '8px 0', borderRadius: 3, cursor: 'pointer', background: 'transparent', border: ruleStrong, color: 'var(--fg-3)', fontSize: 12 }}>
                Cancel
              </button>
              <button
                onClick={handleStartRun}
                disabled={starting || !selectedProject || !selectedTarget}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 3, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: 'var(--bg)', fontSize: 12, fontWeight: 700, opacity: (starting || !selectedProject || !selectedTarget) ? 0.5 : 1 }}
              >
                {starting ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={13} />}
                Start Run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Minimal ANSI → HTML for the terminal ─────────────────────────────────────
function ansiToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\x1b\[0m/g, '</span>')
    .replace(/\x1b\[(\d+)m/g, (_: string, code: string) => {
      const colorMap: Record<string, string> = {
        '30': '#475569', '31': '#e84040', '32': '#54af61', '33': '#f0a83a',
        '34': '#3b82f6', '35': '#a855f7', '36': '#06b6d4', '37': '#e8e3d8',
        '90': '#5a5550',
      }
      const color = colorMap[code]
      return color ? `<span style="color:${color}">` : ''
    })
}
