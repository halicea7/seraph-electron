import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import { getApiBase, getWsBase } from '@/lib/config'
import { getProjects, getTargets, getFindings, getPentestScans, createPentestScan } from '@/api/client'
import {
  MODE_CONFIGS, OperatorMode,
  PENTEST_TOOLS, MSF_MODULES,
  buildSystemPrompt, buildPreviewPrompt,
  buildInitialUserMessage, buildOutputUserMessage, buildSkipUserMessage,
  parseOperatorResponse, type PentestScanRecord,
} from '@/lib/operator'
import type { Project, TargetSummary, Finding } from '@/types'

// ── Types (exported so the page can use them) ─────────────────────────────────

export interface ChatMessage { role: string; content: string }

export interface OperatorStep {
  id: number
  analysis: string
  attackPathNote: string | null
  action: { tool: string; command: string; rationale: string } | null
  result: 'pending' | 'approved' | 'skipped' | 'error'
  output: string
  outputOpen: boolean
}

export type OperatorPhase = 'idle' | 'thinking' | 'awaiting' | 'running' | 'done'

export interface ModelOption { key: string; label: string }

// ── Context type ──────────────────────────────────────────────────────────────

export interface AIOperatorContextValue {
  // Config
  mode: OperatorMode
  projects: Project[]
  targets: TargetSummary[]
  selectedProject: string
  selectedTarget: string
  modelOptions: ModelOption[]
  selectedModelKey: string
  loadingModels: boolean
  enabledTools: Set<string>
  enabledMsf: Set<string>
  lhostIp: string

  // Prompt editor
  promptDraft: string
  promptIsAuto: boolean

  // Session
  phase: OperatorPhase
  steps: OperatorStep[]
  liveOutput: string
  llmStream: string
  errorMsg: string
  showStream: boolean
  runStartTime: number | null

  // Config setters
  setSelectedProject: (id: string) => void
  setSelectedTarget: (id: string) => void
  setSelectedModelKey: (key: string) => void
  toggleTool: (id: string) => void
  toggleMsf: (id: string) => void
  setShowStream: (fn: boolean | ((p: boolean) => boolean)) => void
  setPromptDraft: (v: string) => void
  setPromptIsAuto: (v: boolean) => void
  setLhostIp: (ip: string) => void

  // Actions
  loadModelOptions: () => Promise<void>
  applyModeSwitch: (newMode: OperatorMode, resetTools: boolean) => void
  regeneratePrompt: () => void
  startSession: () => Promise<void>
  handleApprove: (step: OperatorStep) => Promise<void>
  handleSkip: (step: OperatorStep) => Promise<void>
  handleStop: () => void
  toggleStepOutput: (stepId: number) => void
  resetSession: () => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const AIOperatorContext = createContext<AIOperatorContextValue | null>(null)

export function useAIOperator(): AIOperatorContextValue {
  const ctx = useContext(AIOperatorContext)
  if (!ctx) throw new Error('useAIOperator must be used inside AIOperatorProvider')
  return ctx
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

// ── Provider ──────────────────────────────────────────────────────────────────

export function AIOperatorProvider({ children }: { children: React.ReactNode }) {
  // ── Config state ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<OperatorMode>('attack')
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [targets, setTargets] = useState<TargetSummary[]>([])
  const [selectedTarget, setSelectedTarget] = useState('')
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [selectedModelKey, setSelectedModelKey] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set(MODE_CONFIGS.attack.defaultTools))
  const [enabledMsf, setEnabledMsf] = useState<Set<string>>(new Set(MODE_CONFIGS.attack.defaultMsf))

  // ── Prompt state ────────────────────────────────────────────────────────────
  const [promptDraft, setPromptDraft] = useState('')
  const [promptIsAuto, setPromptIsAuto] = useState(true)

  // ── Session state ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<OperatorPhase>('idle')
  const [steps, setSteps] = useState<OperatorStep[]>([])
  const [liveOutput, setLiveOutput] = useState('')
  const [llmStream, setLlmStream] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [showStream, setShowStream] = useState(false)
  const [runStartTime, setRunStartTime] = useState<number | null>(null)
  const [lhostIp, setLhostIp] = useState('')

  // ── Refs (survive re-renders, not tied to any mounted component) ─────────────
  const messages = useRef<ChatMessage[]>([])
  const stopped = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)
  const abortRef = useRef<AbortController | null>(null)

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

  // Auto-regenerate preview prompt when anything changes (unless user has customised it)
  useEffect(() => {
    if (!promptIsAuto) return
    const t = targets.find(x => x.id === selectedTarget)
    if (!t) return
    setPromptDraft(buildPreviewPrompt(mode, t, [...enabledTools], [...enabledMsf]))
  }, [mode, enabledTools, enabledMsf, selectedTarget, targets, promptIsAuto])

  // ── Model loading ────────────────────────────────────────────────────────────

  async function loadModelOptions() {
    setLoadingModels(true)
    const opts: ModelOption[] = []
    try {
      const localModels = await window.electronAPI.ollamaModels()
      localModels.forEach(m => opts.push({ key: `local:${m}`, label: `[Local] ${m}` }))
    } catch { /* Ollama not running */ }
    try {
      const cfg = await fetch(`${getApiBase()}/ai/config`).then(r => r.json())
      if (cfg.model) opts.push({ key: `server:${cfg.model}`, label: `[Server] ${cfg.model}` })
    } catch { /* server offline */ }
    setModelOptions(opts)
    if (opts.length) setSelectedModelKey(opts[0].key)
    setLoadingModels(false)
  }

  // ── Mode switch ──────────────────────────────────────────────────────────────

  function applyModeSwitch(newMode: OperatorMode, resetTools: boolean) {
    const cfg = MODE_CONFIGS[newMode]
    setMode(newMode)
    if (resetTools) {
      setEnabledTools(new Set(cfg.defaultTools))
      setEnabledMsf(new Set(cfg.defaultMsf))
    }
    if (promptIsAuto) {
      const t = targets.find(x => x.id === selectedTarget)
      if (t) {
        const tools = resetTools ? cfg.defaultTools : [...enabledTools]
        const msf   = resetTools ? cfg.defaultMsf   : [...enabledMsf]
        setPromptDraft(buildPreviewPrompt(newMode, t, tools, msf))
      }
    }
  }

  // ── Tool toggles ─────────────────────────────────────────────────────────────

  function toggleTool(id: string) {
    setEnabledTools(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleMsf(id: string) {
    setEnabledMsf(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── Prompt helpers ────────────────────────────────────────────────────────────

  function regeneratePrompt() {
    const t = targets.find(x => x.id === selectedTarget)
    if (!t) return
    setPromptDraft(buildPreviewPrompt(mode, t, [...enabledTools], [...enabledMsf]))
    setPromptIsAuto(true)
  }

  // ── LLM call (streaming) ──────────────────────────────────────────────────────

  async function callLLM(msgs: ChatMessage[], onToken: (t: string) => void): Promise<string> {
    abortRef.current = new AbortController()
    const { signal } = abortRef.current
    const [source, ...parts] = selectedModelKey.split(':')
    const model = parts.join(':')

    if (source === 'local') {
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
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue
            try {
              const data = JSON.parse(trimmed.slice(6))
              const token: string = data.choices?.[0]?.delta?.content ?? ''
              if (token) { full += token; onToken(token) }
            } catch { /* malformed SSE */ }
          }
        }
      } finally {
        reader.releaseLock()
      }
      return full
    }

    const res = await fetch(`${getApiBase()}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs, model }),
      signal,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'AI chat failed')
    onToken(data.content)
    return data.content
  }

  // ── Command sanitizer ─────────────────────────────────────────────────────────

  const SUDO_ALLOWED = new Set(['nmap', 'masscan', 'tcpdump'])

  function sanitizeCommand(cmd: string): string {
    // Walk every token in the command and strip "sudo" unless it precedes an allowed binary.
    // Handles sudo in pipelines, xargs chains, etc.
    return cmd.replace(/sudo\s+(\S+)/g, (_match, nextToken) => {
      const binary = nextToken.split('/').pop() ?? ''
      return SUDO_ALLOWED.has(binary) ? `sudo ${nextToken}` : nextToken
    })
  }

  const KNOWN_TOOL_IDS = new Set([
    ...PENTEST_TOOLS.map(t => t.id),
    ...MSF_MODULES.map(t => t.id),
  ])

  // ── WebSocket execution ───────────────────────────────────────────────────────

  async function executeViaWS(scanId: string, command: string): Promise<string> {
    const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${getWsBase()}/ws/execute/${scanId}`)
      wsRef.current = ws
      let output = ''
      let settled = false

      const finish = (result: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        ws.close()
        resolve(result)
      }

      const timer = setTimeout(() => {
        finish(output + '\n[operator] Command timed out after 5 minutes and was killed.')
      }, TIMEOUT_MS)

      ws.onopen = () => ws.send(JSON.stringify({ action: 'run', script: command }))

      ws.onmessage = (e) => {
        if (stopped.current) { finish(output); return }
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'stdout' || msg.type === 'stderr') {
            output += msg.data
            setLiveOutput(o => o + msg.data)
          }
          if (msg.type === 'exit') finish(output)
        } catch { /* non-JSON */ }
      }

      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('WebSocket connection failed')) } }
      ws.onclose = () => finish(output)
    })
  }

  // ── Advance LLM ───────────────────────────────────────────────────────────────

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
  }, [selectedModelKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Session start ─────────────────────────────────────────────────────────────

  async function startSession() {
    const target = targets.find(t => t.id === selectedTarget)
    if (!selectedProject || !target || !selectedModelKey) return

    stopped.current = false
    messages.current = []
    setSteps([])
    setLiveOutput('')
    setErrorMsg('')
    setLlmStream('')
    setPhase('thinking')

    try {
      const [findings, allScans] = await Promise.all([
        getFindings(selectedProject),
        getPentestScans(selectedProject),
      ])

      // Normalise pentest scan records — the API returns more fields than the
      // TypeScript type models, so we cast and defensively extract what we need.
      const priorScans: PentestScanRecord[] = (allScans as any[])
        .filter((s: any) => s.target_id === selectedTarget)
        .map((s: any) => {
          let tool = s.tool_name || ''
          let command = s.command || ''
          if (!tool && s.config_json) {
            try { const c = JSON.parse(s.config_json); tool = c.tool_name || c.tool || ''; command = command || c.command || '' } catch { /* ignore */ }
          }
          if (!tool) tool = s.scan_type || ''
          return { tool_name: tool, command, status: s.status || '', raw_output: s.raw_output || null }
        })
        .filter((s: PentestScanRecord) => !!s.tool_name)
        .slice(-40)   // last 40 runs, most recent context

      const systemPrompt = promptIsAuto
        ? buildSystemPrompt(mode, target, findings, [...enabledTools], [...enabledMsf], priorScans)
        : promptDraft

      const initMsgs: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildInitialUserMessage(priorScans.length > 0) },
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

      setSteps([{
        id: Date.now(),
        analysis: parsed.analysis,
        attackPathNote: parsed.attack_path_note,
        action: parsed.next_action,
        result: 'pending',
        output: '',
        outputOpen: false,
      }])
      setPhase('awaiting')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start session')
      setPhase('idle')
    }
  }

  // ── Approve ───────────────────────────────────────────────────────────────────

  async function handleApprove(step: OperatorStep) {
    if (!step.action) return

    // Resolve the tool ID — the model sometimes writes generic labels like "msf-exploit"
    // instead of the exact module path. Try to recover the real ID from the command.
    let resolvedTool = step.action.tool
    if (!KNOWN_TOOL_IDS.has(resolvedTool)) {
      const msfMatch = step.action.command.match(/use\s+([\w/]+)/)
      if (msfMatch) {
        const candidate = msfMatch[1]
        if (KNOWN_TOOL_IDS.has(candidate)) resolvedTool = candidate
      }
    }

    if (!KNOWN_TOOL_IDS.has(resolvedTool)) {
      const errMsg = `[operator] Rejected: unknown tool "${step.action.tool}". Use the exact tool ID from the enabled list (e.g. "exploit/unix/ftp/vsftpd_234_backdoor"), not a generic label.`
      setSteps(prev => prev.map(s => s.id === step.id ? { ...s, result: 'approved', output: errMsg, outputOpen: true } : s))
      const rawAssistant = JSON.stringify({ analysis: step.analysis, attack_path_note: step.attackPathNote, next_action: step.action })
      await advanceLLM(buildOutputUserMessage(step.action.command, errMsg), rawAssistant)
      return
    }

    setPhase('running')
    setLiveOutput('')
    setRunStartTime(Date.now())
    setSteps(prev => prev.map(s => s.id === step.id ? { ...s, result: 'approved' } : s))

    // Substitute common LHOST placeholders with configured IP
    const LHOST_PATTERNS = [/<PENTESTER_IP>/gi, /<LHOST>/gi, /<YOUR_IP>/gi, /<ATTACKER_IP>/gi, /<LOCAL_IP>/gi, /<KALI_IP>/gi]
    let rawCommand = step.action!.command
    if (lhostIp) {
      LHOST_PATTERNS.forEach(p => { rawCommand = rawCommand.replace(p, lhostIp) })
    }

    // Detect any remaining unfilled placeholders
    const unfilled = rawCommand.match(/<[A-Z][A-Z0-9_]*>/g)
    if (unfilled) {
      const errMsg = `[operator] Command has unfilled placeholder(s): ${unfilled.join(', ')}. Set your LHOST IP in the left panel, or the model must replace all template variables with real values.`
      setRunStartTime(null)
      setSteps(prev => prev.map(s => s.id === step.id ? { ...s, output: errMsg, outputOpen: true } : s))
      const rawAssistant = JSON.stringify({ analysis: step.analysis, attack_path_note: step.attackPathNote, next_action: step.action })
      await advanceLLM(buildOutputUserMessage(step.action!.command, errMsg), rawAssistant)
      return
    }

    const safeCommand = sanitizeCommand(rawCommand)
    let output = ''
    try {
      const scan = await createPentestScan({
        project_id: selectedProject,
        target_id: selectedTarget,
        engagement_type: 'ai_operator',
        phase_id: phaseIdFor(mode, resolvedTool),
        tool_name: resolvedTool,
        command: safeCommand,
        notes: `AI Operator [${mode}]: ${step.action!.rationale}`,
      })
      output = await executeViaWS(scan.scan_id, safeCommand)
    } catch (err: any) {
      output = `Error: ${err.message}`
    }

    setRunStartTime(null)
    if (stopped.current) { setPhase('done'); return }

    setSteps(prev => prev.map(s => s.id === step.id ? { ...s, output, outputOpen: true } : s))

    const rawAssistant = JSON.stringify({
      analysis: step.analysis,
      attack_path_note: step.attackPathNote,
      next_action: step.action,
    })
    await advanceLLM(buildOutputUserMessage(safeCommand, output), rawAssistant)
  }

  // ── Skip / Stop / Reset ───────────────────────────────────────────────────────

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

  function resetSession() {
    setPhase('idle')
    setSteps([])
    setLlmStream('')
    messages.current = []
  }

  function toggleStepOutput(stepId: number) {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, outputOpen: !s.outputOpen } : s))
  }

  // ── Context value ─────────────────────────────────────────────────────────────

  const value: AIOperatorContextValue = {
    mode, projects, targets, selectedProject, selectedTarget,
    modelOptions, selectedModelKey, loadingModels,
    enabledTools, enabledMsf, lhostIp,
    promptDraft, promptIsAuto,
    phase, steps, liveOutput, llmStream, errorMsg, showStream, runStartTime,

    setSelectedProject, setSelectedTarget, setSelectedModelKey,
    toggleTool, toggleMsf,
    setShowStream: (fn) => setShowStream(fn as any),
    setPromptDraft, setPromptIsAuto, setLhostIp,

    loadModelOptions, applyModeSwitch, regeneratePrompt,
    startSession, handleApprove, handleSkip, handleStop,
    toggleStepOutput, resetSession,
  }

  return (
    <AIOperatorContext.Provider value={value}>
      {children}
    </AIOperatorContext.Provider>
  )
}
