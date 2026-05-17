import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bot, Play, Square, SkipForward, CheckCircle, Loader,
  ChevronDown, ChevronRight, Terminal, GitBranch, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { getApiBase, getWsBase } from '@/lib/config'
import { getProjects, getTargets, getFindings, createPentestScan } from '@/api/client'
import {
  PENTEST_TOOLS, MSF_MODULES, PENTEST_CATEGORIES, MSF_CATEGORIES,
  buildSystemPrompt, buildInitialUserMessage, buildOutputUserMessage, buildSkipUserMessage,
  parseOperatorResponse,
} from '@/lib/operator'
import type { Project, TargetSummary, Finding } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage { role: string; content: string }

interface OperatorStep {
  id: number
  analysis: string
  attackPathNote: string | null
  action: { tool: string; command: string; rationale: string } | null
  result: 'pending' | 'approved' | 'skipped' | 'error'
  output: string
  outputOpen: boolean
}

type Phase = 'idle' | 'thinking' | 'awaiting' | 'running' | 'done'

interface ModelOption { key: string; label: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function isMsfTool(toolId: string): boolean {
  return toolId.includes('/') || toolId.startsWith('auxiliary') || toolId.startsWith('exploit') || toolId.startsWith('post')
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AIOperator() {
  // Config
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [targets, setTargets] = useState<TargetSummary[]>([])
  const [selectedTarget, setSelectedTarget] = useState('')
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [selectedModelKey, setSelectedModelKey] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)

  // Tool toggles
  const [enabledTools, setEnabledTools] = useState<Set<string>>(
    new Set(['nmap', 'gobuster', 'nikto', 'searchsploit'])
  )
  const [enabledMsf, setEnabledMsf] = useState<Set<string>>(new Set())

  // Session
  const [phase, setPhase] = useState<Phase>('idle')
  const [steps, setSteps] = useState<OperatorStep[]>([])
  const [liveOutput, setLiveOutput] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const messages = useRef<ChatMessage[]>([])
  const stopped = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    getProjects().then(ps => {
      setProjects(ps)
      if (ps.length) setSelectedProject(ps[0].id)
    })
    loadModelOptions()
  }, [])

  useEffect(() => {
    if (!selectedProject) return
    getTargets(selectedProject).then(ts => {
      setTargets(ts)
      setSelectedTarget(ts[0]?.id ?? '')
    })
  }, [selectedProject])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps, phase, liveOutput])

  async function loadModelOptions() {
    setLoadingModels(true)
    const opts: ModelOption[] = []
    try {
      const localModels = await window.electronAPI.ollamaModels()
      localModels.forEach(m => opts.push({ key: `local:${m}`, label: `[Local] ${m}` }))
    } catch { /* Ollama not running locally */ }
    try {
      const cfg = await fetch(`${getApiBase()}/ai/config`).then(r => r.json())
      if (cfg.model) opts.push({ key: `server:${cfg.model}`, label: `[Server] ${cfg.model}` })
    } catch { /* server offline */ }
    setModelOptions(opts)
    if (opts.length) setSelectedModelKey(opts[0].key)
    setLoadingModels(false)
  }

  // ── Tool toggle ─────────────────────────────────────────────────────────────

  function toggleTool(id: string) {
    setEnabledTools(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleMsf(id: string) {
    setEnabledMsf(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── LLM call ────────────────────────────────────────────────────────────────

  async function callLLM(msgs: ChatMessage[]): Promise<string> {
    const [source, ...parts] = selectedModelKey.split(':')
    const model = parts.join(':')
    if (source === 'local') {
      return window.electronAPI.ollamaChat(msgs, model)
    }
    const res = await fetch(`${getApiBase()}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs, model }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'AI chat failed')
    return data.content
  }

  // ── WS execution ────────────────────────────────────────────────────────────

  async function executeViaWS(scanId: string, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${getWsBase()}/ws/execute/${scanId}`)
      wsRef.current = ws
      let output = ''

      ws.onopen = () => ws.send(JSON.stringify({ action: 'run', script: command }))

      ws.onmessage = (e) => {
        if (stopped.current) { ws.close(); resolve(output); return }
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'stdout' || msg.type === 'stderr') {
            output += msg.data
            setLiveOutput(o => o + msg.data)
          }
          if (msg.type === 'exit') { ws.close(); resolve(output) }
        } catch { /* non-JSON line */ }
      }

      ws.onerror = () => reject(new Error('WebSocket connection failed'))
      ws.onclose = () => resolve(output)
    })
  }

  // ── Advance LLM after a step ────────────────────────────────────────────────

  const advanceLLM = useCallback(async (userMsg: string, rawAssistant: string) => {
    if (stopped.current) { setPhase('done'); return }

    const newMsgs: ChatMessage[] = [
      ...messages.current,
      { role: 'assistant', content: rawAssistant },
      { role: 'user', content: userMsg },
    ]
    messages.current = newMsgs

    setPhase('thinking')
    setErrorMsg('')

    try {
      const rawResp = await callLLM(newMsgs)
      if (stopped.current) { setPhase('done'); return }

      const parsed = parseOperatorResponse(rawResp)
      messages.current = [...newMsgs, { role: 'assistant', content: rawResp }]

      if (!parsed) {
        setErrorMsg('Model returned non-JSON response. Try again or switch to a more capable model.')
        setPhase('done')
        return
      }

      if (!parsed.next_action) {
        setSteps(prev => {
          const last = prev[prev.length - 1]
          if (last && parsed.analysis && !last.attackPathNote) {
            return [...prev.slice(0, -1), { ...last, attackPathNote: parsed.attack_path_note }]
          }
          return prev
        })
        setPhase('done')
        return
      }

      const step: OperatorStep = {
        id: Date.now(),
        analysis: parsed.analysis,
        attackPathNote: parsed.attack_path_note,
        action: parsed.next_action,
        result: 'pending',
        output: '',
        outputOpen: false,
      }
      setSteps(prev => [...prev, step])
      setPhase('awaiting')
    } catch (err: any) {
      if (!stopped.current) {
        setErrorMsg(err.message || 'LLM call failed')
        setPhase('done')
      }
    }
  }, [selectedModelKey])

  // ── Session start ────────────────────────────────────────────────────────────

  async function startSession() {
    if (!selectedProject || !selectedTarget || !selectedModelKey) return

    const target = targets.find(t => t.id === selectedTarget)
    if (!target) return

    stopped.current = false
    messages.current = []
    setSteps([])
    setLiveOutput('')
    setErrorMsg('')
    setPhase('thinking')

    try {
      const findings: Finding[] = await getFindings(selectedProject)
      const systemPrompt = buildSystemPrompt(
        target, findings,
        [...enabledTools], [...enabledMsf]
      )
      const initMsg = buildInitialUserMessage()
      const initMsgs: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: initMsg },
      ]
      messages.current = initMsgs

      const rawResp = await callLLM(initMsgs)
      if (stopped.current) { setPhase('done'); return }

      const parsed = parseOperatorResponse(rawResp)
      messages.current = [...initMsgs, { role: 'assistant', content: rawResp }]

      if (!parsed || !parsed.next_action) {
        setErrorMsg(parsed ? 'Model returned no action.' : 'Model returned non-JSON. Try a more capable model.')
        setPhase('done')
        return
      }

      const step: OperatorStep = {
        id: Date.now(),
        analysis: parsed.analysis,
        attackPathNote: parsed.attack_path_note,
        action: parsed.next_action,
        result: 'pending',
        output: '',
        outputOpen: false,
      }
      setSteps([step])
      setPhase('awaiting')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start session')
      setPhase('idle')
    }
  }

  // ── Approve ──────────────────────────────────────────────────────────────────

  async function handleApprove(step: OperatorStep) {
    if (!step.action) return
    setPhase('running')
    setLiveOutput('')
    setSteps(prev => prev.map(s => s.id === step.id ? { ...s, result: 'approved' } : s))

    let output = ''
    try {
      const scan = await createPentestScan({
        project_id: selectedProject,
        target_id: selectedTarget,
        engagement_type: 'ai_operator',
        phase_id: isMsfTool(step.action.tool) ? 'exploitation' : 'scanning',
        tool_name: step.action.tool,
        command: step.action.command,
        notes: `AI Operator: ${step.action.rationale}`,
      })
      output = await executeViaWS(scan.scan_id, step.action.command)
    } catch (err: any) {
      output = `Error: ${err.message}`
    }

    if (stopped.current) { setPhase('done'); return }

    setSteps(prev => prev.map(s =>
      s.id === step.id ? { ...s, output, outputOpen: true } : s
    ))

    const rawAssistant = JSON.stringify({
      analysis: step.analysis,
      attack_path_note: step.attackPathNote,
      next_action: step.action,
    })

    await advanceLLM(buildOutputUserMessage(step.action.command, output), rawAssistant)
  }

  // ── Skip ──────────────────────────────────────────────────────────────────────

  async function handleSkip(step: OperatorStep) {
    setSteps(prev => prev.map(s => s.id === step.id ? { ...s, result: 'skipped' } : s))
    const rawAssistant = JSON.stringify({
      analysis: step.analysis,
      attack_path_note: step.attackPathNote,
      next_action: step.action,
    })
    await advanceLLM(buildSkipUserMessage(), rawAssistant)
  }

  // ── Stop ──────────────────────────────────────────────────────────────────────

  function handleStop() {
    stopped.current = true
    wsRef.current?.close()
    setPhase('done')
  }

  // ── UI helpers ────────────────────────────────────────────────────────────────

  const sessionActive = phase !== 'idle'
  const target = targets.find(t => t.id === selectedTarget)

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left Config Panel ─────────────────────────────────────────────── */}
      <div
        className="w-72 shrink-0 flex flex-col border-r border-cyan-900/20 overflow-y-auto"
        style={{ background: '#090d14' }}
      >
        <div className="p-4 border-b border-cyan-900/20">
          <div className="flex items-center gap-2 text-slate-200">
            <Bot size={16} className="text-red-400" />
            <h2 className="text-sm font-semibold">AI Operator</h2>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Supervised LLM-driven exploitation</p>
        </div>

        <div className="flex-1 p-4 space-y-5 text-xs">

          {/* Project */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Project</label>
            <select
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
              disabled={sessionActive}
              className="w-full rounded-lg px-2.5 py-1.5 text-slate-200 border border-cyan-900/20 focus:border-cyan-500/50 focus:outline-none disabled:opacity-50"
              style={{ background: '#05080d', fontSize: '12px' }}
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Target */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Target</label>
            <select
              value={selectedTarget}
              onChange={e => setSelectedTarget(e.target.value)}
              disabled={sessionActive}
              className="w-full rounded-lg px-2.5 py-1.5 text-slate-200 border border-cyan-900/20 focus:border-cyan-500/50 focus:outline-none disabled:opacity-50"
              style={{ background: '#05080d', fontSize: '12px' }}
            >
              {targets.map(t => <option key={t.id} value={t.id}>{t.hostname_or_ip}</option>)}
            </select>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Model</label>
              <button
                onClick={loadModelOptions}
                disabled={loadingModels}
                className="text-slate-500 hover:text-cyan-400 transition-colors"
                title="Refresh models"
              >
                <RefreshCw size={11} className={loadingModels ? 'animate-spin' : ''} />
              </button>
            </div>
            {modelOptions.length > 0 ? (
              <select
                value={selectedModelKey}
                onChange={e => setSelectedModelKey(e.target.value)}
                disabled={sessionActive}
                className="w-full rounded-lg px-2.5 py-1.5 text-slate-200 border border-cyan-900/20 focus:border-cyan-500/50 focus:outline-none disabled:opacity-50"
                style={{ background: '#05080d', fontSize: '12px' }}
              >
                {modelOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            ) : (
              <p className="text-[11px] text-amber-400/80">
                No models found. Configure local Ollama or server AI in Settings.
              </p>
            )}
          </div>

          <div className="border-t border-cyan-900/20" />

          {/* Pentest Tools */}
          <div className="space-y-3">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Pentest Tools</label>
            {PENTEST_CATEGORIES.map(cat => (
              <div key={cat} className="space-y-1">
                <div className="text-[10px] text-slate-600 font-medium">{cat}</div>
                {PENTEST_TOOLS.filter(t => t.category === cat).map(tool => (
                  <label key={tool.id} className="flex items-center gap-2 py-0.5 cursor-pointer group" title={tool.desc}>
                    <input
                      type="checkbox"
                      checked={enabledTools.has(tool.id)}
                      onChange={() => toggleTool(tool.id)}
                      disabled={sessionActive}
                      className="rounded accent-cyan-500"
                    />
                    <span className={`font-mono text-[11px] transition-colors ${enabledTools.has(tool.id) ? 'text-slate-200' : 'text-slate-600'}`}>
                      {tool.label}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>

          <div className="border-t border-cyan-900/20" />

          {/* MSF Modules */}
          <div className="space-y-3">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Metasploit Modules</label>
            {MSF_CATEGORIES.map(cat => (
              <div key={cat} className="space-y-1">
                <div className="text-[10px] text-slate-600 font-medium">{cat}</div>
                {MSF_MODULES.filter(t => t.category === cat).map(mod => (
                  <label key={mod.id} className="flex items-center gap-2 py-0.5 cursor-pointer group" title={mod.desc}>
                    <input
                      type="checkbox"
                      checked={enabledMsf.has(mod.id)}
                      onChange={() => toggleMsf(mod.id)}
                      disabled={sessionActive}
                      className="rounded accent-red-500"
                    />
                    <span className={`font-mono text-[11px] transition-colors ${enabledMsf.has(mod.id) ? 'text-slate-200' : 'text-slate-600'}`}>
                      {mod.label}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Start / Stop button */}
        <div className="p-4 border-t border-cyan-900/20">
          {phase === 'idle' ? (
            <button
              onClick={startSession}
              disabled={!selectedProject || !selectedTarget || !selectedModelKey}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-sm text-white font-semibold transition-all"
            >
              <Play size={14} /> Start Session
            </button>
          ) : phase === 'done' ? (
            <button
              onClick={() => { setPhase('idle'); setSteps([]); messages.current = [] }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 font-semibold transition-all"
            >
              <RefreshCw size={14} /> New Session
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-700 hover:bg-red-900/60 border border-red-900/30 text-sm text-red-400 font-semibold transition-all"
            >
              <Square size={14} /> Stop Session
            </button>
          )}
        </div>
      </div>

      {/* ── Right Session Panel ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {phase === 'idle' ? (
          /* Idle placeholder */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Bot size={32} className="text-red-400/60" />
            </div>
            <div>
              <h3 className="text-slate-300 font-semibold mb-1">AI-Assisted Exploitation</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                Select a project, target, and model. Enable the tools you want the AI to use,
                then start a supervised session. The AI proposes each step — you approve or skip.
              </p>
            </div>
            <div className="flex flex-col gap-2 text-xs text-slate-600 max-w-xs">
              <div className="flex items-center gap-2"><CheckCircle size={12} className="text-green-600" /> Findings auto-populate the attack path graph</div>
              <div className="flex items-center gap-2"><CheckCircle size={12} className="text-green-600" /> You approve every command before it runs</div>
              <div className="flex items-center gap-2"><CheckCircle size={12} className="text-green-600" /> Full terminal output visible after each step</div>
            </div>
          </div>
        ) : (
          /* Session stream */
          <div className="flex-1 overflow-y-auto p-6 space-y-4">

            {/* Context banner */}
            {target && (
              <div className="glass rounded-xl px-4 py-3 flex items-center gap-4 text-xs text-slate-400 border border-cyan-900/20">
                <div className="flex items-center gap-1.5"><Terminal size={12} className="text-cyan-400" /> {target.hostname_or_ip}</div>
                <div className="flex items-center gap-1.5 text-slate-600">|</div>
                <div className="flex items-center gap-1.5">{modelOptions.find(o => o.key === selectedModelKey)?.label ?? selectedModelKey}</div>
                <div className="flex items-center gap-1.5 text-slate-600">|</div>
                <div className="flex items-center gap-1.5">
                  {enabledTools.size + enabledMsf.size} tools enabled
                </div>
              </div>
            )}

            {/* Steps */}
            {steps.map((step, idx) => (
              <StepCard
                key={step.id}
                step={step}
                index={idx + 1}
                isActive={step.result === 'pending' && phase === 'awaiting'}
                isRunning={step.result === 'approved' && phase === 'running'}
                liveOutput={step.result === 'approved' && phase === 'running' ? liveOutput : ''}
                onApprove={() => handleApprove(step)}
                onSkip={() => handleSkip(step)}
                onStop={handleStop}
                onToggleOutput={() => setSteps(prev => prev.map(s =>
                  s.id === step.id ? { ...s, outputOpen: !s.outputOpen } : s
                ))}
              />
            ))}

            {/* Thinking indicator */}
            {phase === 'thinking' && (
              <div className="flex items-center gap-3 px-4 py-3 glass rounded-xl border border-cyan-900/20">
                <Loader size={14} className="animate-spin text-cyan-400 shrink-0" />
                <span className="text-sm text-slate-400">Analyzing and planning next action…</span>
              </div>
            )}

            {/* Error */}
            {errorMsg && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-900/30 bg-red-900/10">
                <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <span className="text-sm text-red-400">{errorMsg}</span>
              </div>
            )}

            {/* Done */}
            {phase === 'done' && !errorMsg && (
              <div className="flex items-center gap-3 px-4 py-3 glass rounded-xl border border-green-900/30">
                <CheckCircle size={14} className="text-green-400 shrink-0" />
                <span className="text-sm text-slate-300">
                  Session complete — {steps.filter(s => s.result === 'approved').length} steps executed.
                  Check Attack Paths for updated graph.
                </span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Step Card ─────────────────────────────────────────────────────────────────

interface StepCardProps {
  step: OperatorStep
  index: number
  isActive: boolean
  isRunning: boolean
  liveOutput: string
  onApprove: () => void
  onSkip: () => void
  onStop: () => void
  onToggleOutput: () => void
}

function StepCard({ step, index, isActive, isRunning, liveOutput, onApprove, onSkip, onStop, onToggleOutput }: StepCardProps) {
  const statusColor = step.result === 'approved'
    ? 'text-green-400 border-green-900/30'
    : step.result === 'skipped'
    ? 'text-slate-500 border-slate-800'
    : step.result === 'error'
    ? 'text-red-400 border-red-900/30'
    : 'text-cyan-400 border-cyan-900/30'

  const statusLabel = step.result === 'approved' ? 'Executed'
    : step.result === 'skipped' ? 'Skipped'
    : step.result === 'error' ? 'Error'
    : isRunning ? 'Running…'
    : 'Awaiting approval'

  const isMsf = step.action && (step.action.tool.includes('/') || step.action.command.startsWith('msfconsole'))

  return (
    <div className={`glass rounded-xl border overflow-hidden transition-all ${isActive ? 'border-cyan-500/30 shadow-glow-cyan' : statusColor}`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-cyan-900/10">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-600">STEP {index}</span>
          {isRunning && <Loader size={11} className="animate-spin text-cyan-400" />}
          {step.result === 'approved' && !isRunning && <CheckCircle size={11} className="text-green-400" />}
          {step.result === 'skipped' && <SkipForward size={11} className="text-slate-500" />}
        </div>
        <span className={`text-[10px] font-medium ${statusColor.split(' ')[0]}`}>{statusLabel}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Analysis */}
        {step.analysis && (
          <p className="text-sm text-slate-300 leading-relaxed">{step.analysis}</p>
        )}

        {/* Attack path note */}
        {step.attackPathNote && (
          <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-500/5 rounded-lg px-3 py-2 border border-amber-900/20">
            <GitBranch size={11} className="shrink-0" />
            <span>{step.attackPathNote}</span>
          </div>
        )}

        {/* Proposed action */}
        {step.action && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${isMsf ? 'bg-purple-500/10 text-purple-400 border border-purple-900/30' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-900/30'}`}>
                {isMsf ? 'MSF' : 'TOOL'} · {step.action.tool}
              </span>
            </div>
            <pre className="text-xs font-mono text-slate-200 bg-black/40 rounded-lg px-3 py-2.5 overflow-x-auto whitespace-pre-wrap break-all border border-cyan-900/10">
              <span className="text-slate-500 select-none">$ </span>{step.action.command}
            </pre>
            {step.action.rationale && (
              <p className="text-xs text-slate-500 italic">{step.action.rationale}</p>
            )}
          </div>
        )}

        {/* Action buttons — only when pending & awaiting */}
        {isActive && (
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onApprove}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-xs text-white font-semibold transition-colors"
            >
              <CheckCircle size={12} /> Approve
            </button>
            <button
              onClick={onSkip}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg glass glass-hover text-xs text-slate-300 font-semibold transition-colors"
            >
              <SkipForward size={12} /> Skip
            </button>
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg glass glass-hover text-xs text-red-400 font-semibold transition-colors ml-auto"
            >
              <Square size={12} /> Stop
            </button>
          </div>
        )}

        {/* Running: live output */}
        {isRunning && liveOutput && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider">
              <Loader size={10} className="animate-spin" /> Live output
            </div>
            <pre className="text-[11px] font-mono text-green-300 bg-black/60 rounded-lg px-3 py-2 max-h-48 overflow-y-auto border border-green-900/20">
              {liveOutput.slice(-4000)}
            </pre>
          </div>
        )}

        {/* Completed: output (collapsible) */}
        {step.result === 'approved' && !isRunning && step.output && (
          <div className="space-y-1">
            <button
              onClick={onToggleOutput}
              className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 uppercase tracking-wider transition-colors"
            >
              {step.outputOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              Output · {step.output.length.toLocaleString()} bytes
            </button>
            {step.outputOpen && (
              <pre className="text-[11px] font-mono text-green-300 bg-black/60 rounded-lg px-3 py-2 max-h-64 overflow-y-auto border border-green-900/20 whitespace-pre-wrap">
                {step.output.slice(0, 12000)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
