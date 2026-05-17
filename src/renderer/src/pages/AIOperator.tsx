import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bot, Play, Square, SkipForward, CheckCircle, Loader,
  ChevronDown, ChevronRight, Terminal, GitBranch, AlertTriangle, RefreshCw,
  Swords, Search, FileSearch, RotateCcw, ChevronUp, Pencil, Eye, EyeOff,
} from 'lucide-react'
import { getApiBase, getWsBase } from '@/lib/config'
import { getProjects, getTargets, getFindings, createPentestScan } from '@/api/client'
import {
  PENTEST_TOOLS, MSF_MODULES, PENTEST_CATEGORIES, MSF_CATEGORIES,
  MODE_CONFIGS, OperatorMode,
  buildSystemPrompt, buildPreviewPrompt,
  buildInitialUserMessage, buildOutputUserMessage, buildSkipUserMessage,
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

// ── Mode icon map ─────────────────────────────────────────────────────────────

const MODE_ICONS: Record<OperatorMode, React.ReactNode> = {
  attack: <Swords size={13} />,
  recon:  <Search size={13} />,
  audit:  <FileSearch size={13} />,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isMsfTool(toolId: string): boolean {
  return toolId.includes('/') || toolId.startsWith('auxiliary') || toolId.startsWith('exploit') || toolId.startsWith('post')
}

function phaseIdFor(mode: OperatorMode, toolId: string): string {
  if (mode === 'recon') return 'recon'
  if (mode === 'audit') return 'scanning'
  return isMsfTool(toolId) ? 'exploitation' : 'scanning'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AIOperator() {
  // Mode
  const [mode, setMode] = useState<OperatorMode>('attack')
  const [pendingMode, setPendingMode] = useState<OperatorMode | null>(null)

  // Config
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [targets, setTargets] = useState<TargetSummary[]>([])
  const [selectedTarget, setSelectedTarget] = useState('')
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [selectedModelKey, setSelectedModelKey] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)

  // Tool toggles — seeded from Attack defaults
  const [enabledTools, setEnabledTools] = useState<Set<string>>(
    new Set(MODE_CONFIGS.attack.defaultTools)
  )
  const [enabledMsf, setEnabledMsf] = useState<Set<string>>(
    new Set(MODE_CONFIGS.attack.defaultMsf)
  )

  // System prompt editor
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const [promptIsAuto, setPromptIsAuto] = useState(true)   // false = user has edited it

  // Session
  const [phase, setPhase] = useState<Phase>('idle')
  const [steps, setSteps] = useState<OperatorStep[]>([])
  const [liveOutput, setLiveOutput] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [llmStream, setLlmStream] = useState('')       // live token feed
  const [showStream, setShowStream] = useState(false)  // user toggle
  const messages = useRef<ChatMessage[]>([])
  const stopped = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const modeConfig = MODE_CONFIGS[mode]
  const sessionActive = phase !== 'idle'
  const target = targets.find(t => t.id === selectedTarget)

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

  // Auto-regenerate preview prompt when mode / tools / target change
  useEffect(() => {
    if (!promptIsAuto) return
    const t = targets.find(x => x.id === selectedTarget)
    if (!t) return
    setPromptDraft(buildPreviewPrompt(mode, t, [...enabledTools], [...enabledMsf]))
  }, [mode, enabledTools, enabledMsf, selectedTarget, targets, promptIsAuto])

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

  // ── Mode switching ──────────────────────────────────────────────────────────

  function handleModeClick(newMode: OperatorMode) {
    if (newMode === mode || sessionActive) return
    setPendingMode(newMode)
  }

  function confirmModeSwitch(resetTools: boolean) {
    if (!pendingMode) return
    const cfg = MODE_CONFIGS[pendingMode]
    setMode(pendingMode)
    if (resetTools) {
      setEnabledTools(new Set(cfg.defaultTools))
      setEnabledMsf(new Set(cfg.defaultMsf))
    }
    // Regenerate prompt for new mode (tools may have changed too)
    if (promptIsAuto) {
      const t = targets.find(x => x.id === selectedTarget)
      if (t) {
        const tools = resetTools ? cfg.defaultTools : [...enabledTools]
        const msf   = resetTools ? cfg.defaultMsf   : [...enabledMsf]
        setPromptDraft(buildPreviewPrompt(pendingMode, t, tools, msf))
      }
    }
    setPendingMode(null)
  }

  // ── Tool toggles ─────────────────────────────────────────────────────────────

  function toggleTool(id: string) {
    setEnabledTools(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function toggleMsf(id: string) {
    setEnabledMsf(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  // ── Prompt editor helpers ────────────────────────────────────────────────────

  function regeneratePrompt() {
    const t = targets.find(x => x.id === selectedTarget)
    if (!t) return
    setPromptDraft(buildPreviewPrompt(mode, t, [...enabledTools], [...enabledMsf]))
    setPromptIsAuto(true)
  }

  // ── LLM call (streaming) ────────────────────────────────────────────────────

  async function callLLM(msgs: ChatMessage[], onToken: (t: string) => void): Promise<string> {
    abortRef.current = new AbortController()
    const { signal } = abortRef.current
    const [source, ...parts] = selectedModelKey.split(':')
    const model = parts.join(':')

    if (source === 'local') {
      // Stream directly from Ollama — bypass IPC so we can read SSE chunks
      const settings = await window.electronAPI.ollamaGetSettings()
      const baseUrl = settings.localOllamaUrl.replace(/\/$/, '')
      const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: msgs, stream: true }),
        signal,
      })
      if (!resp.ok || !resp.body) throw new Error(`Ollama error: ${resp.status}`)

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let full = ''
      let buf = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done || stopped.current) break
          buf += decoder.decode(value, { stream: true })
          // Process complete SSE lines from the buffer
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''  // keep incomplete last line in buffer
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue
            try {
              const data = JSON.parse(trimmed.slice(6))
              const token: string = data.choices?.[0]?.delta?.content ?? ''
              if (token) { full += token; onToken(token) }
            } catch { /* malformed SSE line */ }
          }
        }
      } finally {
        reader.releaseLock()
      }
      return full
    }

    // Server model — non-streaming fallback (server endpoint doesn't stream yet)
    const res = await fetch(`${getApiBase()}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs, model }),
      signal,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'AI chat failed')
    onToken(data.content)  // deliver all at once
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
        } catch { /* non-JSON */ }
      }

      ws.onerror = () => reject(new Error('WebSocket connection failed'))
      ws.onclose = () => resolve(output)
    })
  }

  // ── Advance LLM ─────────────────────────────────────────────────────────────

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
    setLlmStream('')

    try {
      const rawResp = await callLLM(newMsgs, t => setLlmStream(prev => prev + t))
      if (stopped.current) { setPhase('done'); return }

      const parsed = parseOperatorResponse(rawResp)
      messages.current = [...newMsgs, { role: 'assistant', content: rawResp }]

      if (!parsed) {
        setErrorMsg('Model returned non-JSON. Try again or switch to a more capable model.')
        setPhase('done')
        return
      }

      if (!parsed.next_action) {
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
    if (!selectedProject || !selectedTarget || !selectedModelKey || !target) return

    stopped.current = false
    messages.current = []
    setSteps([])
    setLiveOutput('')
    setErrorMsg('')
    setLlmStream('')
    setPhase('thinking')

    try {
      const findings: Finding[] = await getFindings(selectedProject)

      // Use custom prompt as-is, or build fresh with real findings
      const systemPrompt = promptIsAuto
        ? buildSystemPrompt(mode, target, findings, [...enabledTools], [...enabledMsf])
        : promptDraft

      const initMsg = buildInitialUserMessage()
      const initMsgs: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: initMsg },
      ]
      messages.current = initMsgs

      const rawResp = await callLLM(initMsgs, t => setLlmStream(prev => prev + t))
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
        phase_id: phaseIdFor(mode, step.action.tool),
        tool_name: step.action.tool,
        command: step.action.command,
        notes: `AI Operator [${mode}]: ${step.action.rationale}`,
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

  // ── Skip / Stop ───────────────────────────────────────────────────────────────

  async function handleSkip(step: OperatorStep) {
    setSteps(prev => prev.map(s => s.id === step.id ? { ...s, result: 'skipped' } : s))
    const rawAssistant = JSON.stringify({
      analysis: step.analysis,
      attack_path_note: step.attackPathNote,
      next_action: step.action,
    })
    await advanceLLM(buildSkipUserMessage(), rawAssistant)
  }

  function handleStop() {
    stopped.current = true
    wsRef.current?.close()
    abortRef.current?.abort()
    setPhase('done')
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left Config Panel ──────────────────────────────────────────────── */}
      <div
        className="w-72 shrink-0 flex flex-col border-r border-cyan-900/20 overflow-y-auto"
        style={{ background: '#090d14' }}
      >
        {/* Header */}
        <div className="p-4 border-b border-cyan-900/20">
          <div className="flex items-center gap-2" style={{ color: modeConfig.color }}>
            <Bot size={16} />
            <h2 className="text-sm font-semibold text-slate-200">AI Operator</h2>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Supervised LLM-driven session</p>
        </div>

        {/* ── Mode selector ────────────────────────────────────────────────── */}
        <div className="p-3 border-b border-cyan-900/20 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold px-1">Mode</div>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.values(MODE_CONFIGS) as typeof MODE_CONFIGS[OperatorMode][]).map(cfg => {
              const isActive = mode === cfg.id
              return (
                <button
                  key={cfg.id}
                  onClick={() => handleModeClick(cfg.id)}
                  disabled={sessionActive}
                  title={cfg.desc}
                  className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all duration-150 disabled:opacity-40"
                  style={isActive
                    ? { color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }
                    : { color: '#475569', background: 'transparent', border: '1px solid rgba(71,85,105,0.2)' }
                  }
                >
                  {MODE_ICONS[cfg.id]}
                  {cfg.label}
                </button>
              )
            })}
          </div>
          {/* Mode description */}
          <p className="text-[10px] px-1" style={{ color: `${modeConfig.color}99` }}>
            {modeConfig.desc}
          </p>
        </div>

        <div className="flex-1 p-4 space-y-5 text-xs">

          {/* Project */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Project</label>
            <select
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
              disabled={sessionActive}
              className="w-full rounded-lg px-2.5 py-1.5 text-slate-200 border border-cyan-900/20 focus:outline-none disabled:opacity-50"
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
              className="w-full rounded-lg px-2.5 py-1.5 text-slate-200 border border-cyan-900/20 focus:outline-none disabled:opacity-50"
              style={{ background: '#05080d', fontSize: '12px' }}
            >
              {targets.map(t => <option key={t.id} value={t.id}>{t.hostname_or_ip}</option>)}
            </select>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Model</label>
              <button onClick={loadModelOptions} disabled={loadingModels} className="text-slate-500 hover:text-cyan-400 transition-colors" title="Refresh models">
                <RefreshCw size={11} className={loadingModels ? 'animate-spin' : ''} />
              </button>
            </div>
            {modelOptions.length > 0 ? (
              <select
                value={selectedModelKey}
                onChange={e => setSelectedModelKey(e.target.value)}
                disabled={sessionActive}
                className="w-full rounded-lg px-2.5 py-1.5 text-slate-200 border border-cyan-900/20 focus:outline-none disabled:opacity-50"
                style={{ background: '#05080d', fontSize: '12px' }}
              >
                {modelOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            ) : (
              <p className="text-[11px] text-amber-400/80">No models found. Configure in Settings.</p>
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
                  <label key={tool.id} className="flex items-center gap-2 py-0.5 cursor-pointer" title={tool.desc}>
                    <input
                      type="checkbox"
                      checked={enabledTools.has(tool.id)}
                      onChange={() => toggleTool(tool.id)}
                      disabled={sessionActive}
                      className="rounded"
                      style={{ accentColor: modeConfig.color }}
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
                  <label key={mod.id} className="flex items-center gap-2 py-0.5 cursor-pointer" title={mod.desc}>
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

          <div className="border-t border-cyan-900/20" />

          {/* ── System Prompt (collapsible) ─────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setPromptOpen(o => !o)}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-500 hover:text-slate-300 transition-colors"
              >
                {promptOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                System Prompt
                {!promptIsAuto && (
                  <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 normal-case tracking-normal">
                    Custom
                  </span>
                )}
              </button>
              {!promptIsAuto && (
                <button
                  onClick={regeneratePrompt}
                  title="Reset to auto-generated prompt"
                  className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-cyan-400 transition-colors"
                >
                  <RotateCcw size={10} /> Reset
                </button>
              )}
            </div>

            {promptOpen && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 text-[10px] text-slate-600">
                  <Pencil size={9} />
                  {promptIsAuto ? 'Auto-generated · edits lock this prompt' : 'Custom · session will use this prompt as-is'}
                </div>
                <textarea
                  value={promptDraft}
                  onChange={e => { setPromptDraft(e.target.value); setPromptIsAuto(false) }}
                  disabled={sessionActive}
                  rows={12}
                  className="w-full rounded-lg px-3 py-2 text-[11px] font-mono text-slate-300 border border-cyan-900/20 focus:border-cyan-600/40 focus:outline-none resize-none leading-relaxed disabled:opacity-50"
                  style={{ background: '#060b10' }}
                />
              </div>
            )}
          </div>

        </div>

        {/* Start / Stop / New */}
        <div className="p-4 border-t border-cyan-900/20 space-y-3">

          {/* Stream toggle */}
          <button
            onClick={() => setShowStream(s => !s)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all"
            style={showStream
              ? { color: modeConfig.color, background: modeConfig.bg, border: `1px solid ${modeConfig.border}` }
              : { color: '#475569', background: 'transparent', border: '1px solid rgba(71,85,105,0.2)' }
            }
          >
            <span className="flex items-center gap-1.5 font-semibold">
              {showStream ? <Eye size={12} /> : <EyeOff size={12} />}
              Live model stream
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
              style={showStream
                ? { color: modeConfig.color, background: `${modeConfig.color}22` }
                : { color: '#475569', background: 'rgba(71,85,105,0.15)' }
              }
            >
              {showStream ? 'On' : 'Off'}
            </span>
          </button>
          {phase === 'idle' ? (
            <button
              onClick={startSession}
              disabled={!selectedProject || !selectedTarget || !selectedModelKey}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg disabled:opacity-40 text-sm text-white font-semibold transition-all"
              style={{ background: modeConfig.color, opacity: (!selectedProject || !selectedTarget || !selectedModelKey) ? 0.4 : 1 }}
            >
              <Play size={14} /> Start {modeConfig.label} Session
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
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: modeConfig.bg, border: `1px solid ${modeConfig.border}` }}
            >
              <Bot size={32} style={{ color: `${modeConfig.color}99` }} />
            </div>
            <div>
              <h3 className="text-slate-300 font-semibold mb-1" style={{ color: modeConfig.color }}>
                {modeConfig.label} Mode
              </h3>
              <p className="text-sm text-slate-500 max-w-sm">{modeConfig.desc}. Select a project, target, and model. Enable tools, optionally edit the system prompt, then start a supervised session.</p>
            </div>
            <div className="flex flex-col gap-2 text-xs text-slate-600 max-w-xs">
              <div className="flex items-center gap-2"><CheckCircle size={12} className="text-green-600" /> You approve every command before it runs</div>
              <div className="flex items-center gap-2"><CheckCircle size={12} className="text-green-600" /> Findings auto-populate the attack path graph</div>
              <div className="flex items-center gap-2"><CheckCircle size={12} className="text-green-600" /> System prompt is fully editable before starting</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">

            {/* Context banner */}
            {target && (
              <div className="glass rounded-xl px-4 py-3 flex items-center gap-4 text-xs text-slate-400 border border-cyan-900/20">
                {/* Mode chip */}
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: modeConfig.color, background: modeConfig.bg, border: `1px solid ${modeConfig.border}` }}
                >
                  {MODE_ICONS[mode]} {modeConfig.label}
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">|</div>
                <div className="flex items-center gap-1.5"><Terminal size={12} className="text-cyan-400" /> {target.hostname_or_ip}</div>
                <div className="flex items-center gap-1.5 text-slate-600">|</div>
                <div>{modelOptions.find(o => o.key === selectedModelKey)?.label ?? selectedModelKey}</div>
                <div className="flex items-center gap-1.5 text-slate-600">|</div>
                <div>{enabledTools.size + enabledMsf.size} tools</div>
                {!promptIsAuto && (
                  <>
                    <div className="flex items-center gap-1.5 text-slate-600">|</div>
                    <div className="text-amber-400/70 text-[10px]">Custom prompt</div>
                  </>
                )}
              </div>
            )}

            {/* Steps */}
            {steps.map((step, idx) => (
              <StepCard
                key={step.id}
                step={step}
                index={idx + 1}
                mode={mode}
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

            {/* Thinking */}
            {phase === 'thinking' && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 px-4 py-3 glass rounded-xl border border-cyan-900/20">
                  <Loader size={14} className="animate-spin text-cyan-400 shrink-0" />
                  <span className="text-sm text-slate-400">Analyzing and planning next action…</span>
                </div>

                {/* Live token stream pane */}
                {showStream && (
                  <div
                    className="rounded-xl border overflow-hidden"
                    style={{ background: '#060b10', borderColor: `${modeConfig.border}` }}
                  >
                    <div
                      className="flex items-center gap-2 px-3 py-2 border-b text-[10px] font-semibold uppercase tracking-widest"
                      style={{ borderColor: 'rgba(6,182,212,0.08)', color: modeConfig.color }}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                        style={{ background: modeConfig.color }}
                      />
                      Model output — live
                    </div>
                    <pre
                      className="px-4 py-3 text-[11px] font-mono text-slate-300 leading-relaxed overflow-y-auto whitespace-pre-wrap break-all"
                      style={{ maxHeight: '280px', minHeight: '60px' }}
                    >
                      {llmStream || <span className="text-slate-600 italic">waiting for first token…</span>}
                      {llmStream && <span className="animate-pulse text-cyan-400">▌</span>}
                    </pre>
                  </div>
                )}
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
                  Check Attack Paths for the updated graph.
                </span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Mode reset dialog (overlay) ───────────────────────────────────── */}
      {pendingMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setPendingMode(null)}
        >
          <div
            className="rounded-2xl border p-6 w-80 space-y-4"
            style={{ background: '#0d1520', borderColor: MODE_CONFIGS[pendingMode].border }}
            onClick={e => e.stopPropagation()}
          >
            <div className="space-y-1">
              <div
                className="flex items-center gap-2 text-sm font-bold"
                style={{ color: MODE_CONFIGS[pendingMode].color }}
              >
                {MODE_ICONS[pendingMode]}
                Switch to {MODE_CONFIGS[pendingMode].label} Mode
              </div>
              <p className="text-xs text-slate-500">{MODE_CONFIGS[pendingMode].desc}</p>
            </div>

            <p className="text-xs text-slate-400">
              Reset tool selection to <strong style={{ color: MODE_CONFIGS[pendingMode].color }}>{MODE_CONFIGS[pendingMode].label}</strong> defaults?
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => confirmModeSwitch(true)}
                className="w-full py-2 rounded-lg text-xs font-semibold text-white transition-all"
                style={{ background: MODE_CONFIGS[pendingMode].color }}
              >
                Reset tools to {MODE_CONFIGS[pendingMode].label} defaults
              </button>
              <button
                onClick={() => confirmModeSwitch(false)}
                className="w-full py-2 rounded-lg text-xs font-semibold text-slate-300 glass glass-hover transition-all"
              >
                Switch mode, keep current tools
              </button>
              <button
                onClick={() => setPendingMode(null)}
                className="w-full py-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Step Card ─────────────────────────────────────────────────────────────────

interface StepCardProps {
  step: OperatorStep
  index: number
  mode: OperatorMode
  isActive: boolean
  isRunning: boolean
  liveOutput: string
  onApprove: () => void
  onSkip: () => void
  onStop: () => void
  onToggleOutput: () => void
}

function StepCard({ step, index, mode, isActive, isRunning, liveOutput, onApprove, onSkip, onStop, onToggleOutput }: StepCardProps) {
  const modeConfig = MODE_CONFIGS[mode]

  const statusColor = step.result === 'approved'
    ? 'text-green-400 border-green-900/30'
    : step.result === 'skipped'
    ? 'text-slate-500 border-slate-800'
    : step.result === 'error'
    ? 'text-red-400 border-red-900/30'
    : 'text-cyan-400 border-cyan-900/30'

  const statusLabel = step.result === 'approved' ? 'Executed'
    : step.result === 'skipped' ? 'Skipped'
    : step.result === 'error'   ? 'Error'
    : isRunning                 ? 'Running…'
    : 'Awaiting approval'

  const isMsf = step.action && (step.action.tool.includes('/') || step.action.command.startsWith('msfconsole'))

  return (
    <div
      className={`glass rounded-xl border overflow-hidden transition-all ${isActive ? 'shadow-glow-cyan' : ''} ${statusColor}`}
      style={isActive ? { borderColor: modeConfig.border } : undefined}
    >
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
        {step.analysis && (
          <p className="text-sm text-slate-300 leading-relaxed">{step.analysis}</p>
        )}

        {step.attackPathNote && (
          <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-500/5 rounded-lg px-3 py-2 border border-amber-900/20">
            <GitBranch size={11} className="shrink-0" />
            <span>{step.attackPathNote}</span>
          </div>
        )}

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

        {/* Action buttons */}
        {isActive && (
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onApprove}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs text-white font-semibold transition-colors"
              style={{ background: modeConfig.color }}
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

        {/* Live output */}
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

        {/* Collapsible output */}
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
