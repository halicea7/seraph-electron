import { useState, useEffect, useRef } from 'react'
import {
  Bot, Play, Square, SkipForward, CheckCircle, Loader,
  ChevronDown, ChevronRight, Terminal, GitBranch, AlertTriangle, RefreshCw,
  Swords, Search, FileSearch, RotateCcw, ChevronUp, Pencil, Eye, EyeOff,
} from 'lucide-react'
import { PENTEST_TOOLS, MSF_MODULES, PENTEST_CATEGORIES, MSF_CATEGORIES, MODE_CONFIGS, OperatorMode } from '@/lib/operator'
import { useAIOperator, type OperatorStep, type OperatorPhase } from '@/contexts/AIOperatorContext'

// ── Mode icon map ─────────────────────────────────────────────────────────────

const MODE_ICONS: Record<OperatorMode, React.ReactNode> = {
  attack: <Swords size={13} />,
  recon:  <Search size={13} />,
  audit:  <FileSearch size={13} />,
}

// ── Page component ────────────────────────────────────────────────────────────

export default function AIOperator() {
  const op = useAIOperator()
  const modeConfig = MODE_CONFIGS[op.mode]
  const sessionActive = op.phase !== 'idle'
  const target = op.targets.find(t => t.id === op.selectedTarget)

  // Local UI state — doesn't need to persist across navigation
  const [pendingMode, setPendingMode] = useState<OperatorMode | null>(null)
  const [promptOpen, setPromptOpen] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [op.steps, op.phase, op.liveOutput])

  function handleModeClick(newMode: OperatorMode) {
    if (newMode === op.mode || sessionActive) return
    setPendingMode(newMode)
  }

  function confirmModeSwitch(resetTools: boolean) {
    if (!pendingMode) return
    op.applyModeSwitch(pendingMode, resetTools)
    setPendingMode(null)
  }

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
              const isActive = op.mode === cfg.id
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
          <p className="text-[10px] px-1" style={{ color: `${modeConfig.color}99` }}>
            {modeConfig.desc}
          </p>
        </div>

        <div className="flex-1 p-4 space-y-5 text-xs">

          {/* Project */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Project</label>
            <select
              value={op.selectedProject}
              onChange={e => op.setSelectedProject(e.target.value)}
              disabled={sessionActive}
              className="w-full rounded-lg px-2.5 py-1.5 text-slate-200 border border-cyan-900/20 focus:outline-none disabled:opacity-50"
              style={{ background: '#05080d', fontSize: '12px' }}
            >
              {op.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Target */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Target</label>
            <select
              value={op.selectedTarget}
              onChange={e => op.setSelectedTarget(e.target.value)}
              disabled={sessionActive}
              className="w-full rounded-lg px-2.5 py-1.5 text-slate-200 border border-cyan-900/20 focus:outline-none disabled:opacity-50"
              style={{ background: '#05080d', fontSize: '12px' }}
            >
              {op.targets.map(t => <option key={t.id} value={t.id}>{t.hostname_or_ip}</option>)}
            </select>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Model</label>
              <button onClick={op.loadModelOptions} disabled={op.loadingModels} className="text-slate-500 hover:text-cyan-400 transition-colors" title="Refresh models">
                <RefreshCw size={11} className={op.loadingModels ? 'animate-spin' : ''} />
              </button>
            </div>
            {op.modelOptions.length > 0 ? (
              <select
                value={op.selectedModelKey}
                onChange={e => op.setSelectedModelKey(e.target.value)}
                disabled={sessionActive}
                className="w-full rounded-lg px-2.5 py-1.5 text-slate-200 border border-cyan-900/20 focus:outline-none disabled:opacity-50"
                style={{ background: '#05080d', fontSize: '12px' }}
              >
                {op.modelOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
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
                      checked={op.enabledTools.has(tool.id)}
                      onChange={() => op.toggleTool(tool.id)}
                      disabled={sessionActive}
                      className="rounded"
                      style={{ accentColor: modeConfig.color }}
                    />
                    <span className={`font-mono text-[11px] transition-colors ${op.enabledTools.has(tool.id) ? 'text-slate-200' : 'text-slate-600'}`}>
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
                      checked={op.enabledMsf.has(mod.id)}
                      onChange={() => op.toggleMsf(mod.id)}
                      disabled={sessionActive}
                      className="rounded accent-red-500"
                    />
                    <span className={`font-mono text-[11px] transition-colors ${op.enabledMsf.has(mod.id) ? 'text-slate-200' : 'text-slate-600'}`}>
                      {mod.label}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>

          <div className="border-t border-cyan-900/20" />

          {/* System Prompt (collapsible) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setPromptOpen(o => !o)}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-500 hover:text-slate-300 transition-colors"
              >
                {promptOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                System Prompt
                {!op.promptIsAuto && (
                  <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 normal-case tracking-normal">
                    Custom
                  </span>
                )}
              </button>
              {!op.promptIsAuto && (
                <button onClick={op.regeneratePrompt} title="Reset to auto-generated prompt" className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-cyan-400 transition-colors">
                  <RotateCcw size={10} /> Reset
                </button>
              )}
            </div>
            {promptOpen && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 text-[10px] text-slate-600">
                  <Pencil size={9} />
                  {op.promptIsAuto ? 'Auto-generated · edits lock this prompt' : 'Custom · session will use this as-is'}
                </div>
                <textarea
                  value={op.promptDraft}
                  onChange={e => { op.setPromptDraft(e.target.value); op.setPromptIsAuto(false) }}
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
            onClick={() => op.setShowStream(s => !s)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all"
            style={op.showStream
              ? { color: modeConfig.color, background: modeConfig.bg, border: `1px solid ${modeConfig.border}` }
              : { color: '#475569', background: 'transparent', border: '1px solid rgba(71,85,105,0.2)' }
            }
          >
            <span className="flex items-center gap-1.5 font-semibold">
              {op.showStream ? <Eye size={12} /> : <EyeOff size={12} />}
              Live model stream
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
              style={op.showStream
                ? { color: modeConfig.color, background: `${modeConfig.color}22` }
                : { color: '#475569', background: 'rgba(71,85,105,0.15)' }
              }
            >
              {op.showStream ? 'On' : 'Off'}
            </span>
          </button>

          {op.phase === 'idle' ? (
            <button
              onClick={op.startSession}
              disabled={!op.selectedProject || !op.selectedTarget || !op.selectedModelKey}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg disabled:opacity-40 text-sm text-white font-semibold transition-all"
              style={{ background: modeConfig.color, opacity: (!op.selectedProject || !op.selectedTarget || !op.selectedModelKey) ? 0.4 : 1 }}
            >
              <Play size={14} /> Start {modeConfig.label} Session
            </button>
          ) : op.phase === 'done' ? (
            <button
              onClick={op.resetSession}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 font-semibold transition-all"
            >
              <RefreshCw size={14} /> New Session
            </button>
          ) : (
            <button
              onClick={op.handleStop}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-700 hover:bg-red-900/60 border border-red-900/30 text-sm text-red-400 font-semibold transition-all"
            >
              <Square size={14} /> Stop Session
            </button>
          )}
        </div>
      </div>

      {/* ── Right Session Panel ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {op.phase === 'idle' ? (
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
              <p className="text-sm text-slate-500 max-w-sm">
                {modeConfig.desc}. Select a project, target, and model. Enable tools, optionally edit the system prompt, then start a supervised session.
              </p>
            </div>
            <div className="flex flex-col gap-2 text-xs text-slate-600 max-w-xs">
              <div className="flex items-center gap-2"><CheckCircle size={12} className="text-green-600" /> You approve every command before it runs</div>
              <div className="flex items-center gap-2"><CheckCircle size={12} className="text-green-600" /> Findings auto-populate the attack path graph</div>
              <div className="flex items-center gap-2"><CheckCircle size={12} className="text-green-600" /> Sessions resume if you navigate away</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">

            {/* Context banner */}
            {target && (
              <div className="glass rounded-xl px-4 py-3 flex items-center gap-4 text-xs text-slate-400 border border-cyan-900/20">
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: modeConfig.color, background: modeConfig.bg, border: `1px solid ${modeConfig.border}` }}
                >
                  {MODE_ICONS[op.mode]} {modeConfig.label}
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">|</div>
                <div className="flex items-center gap-1.5"><Terminal size={12} className="text-cyan-400" /> {target.hostname_or_ip}</div>
                <div className="flex items-center gap-1.5 text-slate-600">|</div>
                <div>{op.modelOptions.find(o => o.key === op.selectedModelKey)?.label ?? op.selectedModelKey}</div>
                <div className="flex items-center gap-1.5 text-slate-600">|</div>
                <div>{op.enabledTools.size + op.enabledMsf.size} tools</div>
                {!op.promptIsAuto && (
                  <>
                    <div className="flex items-center gap-1.5 text-slate-600">|</div>
                    <div className="text-amber-400/70 text-[10px]">Custom prompt</div>
                  </>
                )}
              </div>
            )}

            {/* Steps */}
            {op.steps.map((step, idx) => (
              <StepCard
                key={step.id}
                step={step}
                index={idx + 1}
                mode={op.mode}
                isActive={step.result === 'pending' && op.phase === 'awaiting'}
                isRunning={step.result === 'approved' && op.phase === 'running'}
                liveOutput={step.result === 'approved' && op.phase === 'running' ? op.liveOutput : ''}
                onApprove={() => op.handleApprove(step)}
                onSkip={() => op.handleSkip(step)}
                onStop={op.handleStop}
                onToggleOutput={() => op.toggleStepOutput(step.id)}
              />
            ))}

            {/* Thinking + live stream */}
            {op.phase === 'thinking' && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 px-4 py-3 glass rounded-xl border border-cyan-900/20">
                  <Loader size={14} className="animate-spin text-cyan-400 shrink-0" />
                  <span className="text-sm text-slate-400">Analyzing and planning next action…</span>
                </div>
                {op.showStream && (
                  <div className="rounded-xl border overflow-hidden" style={{ background: '#060b10', borderColor: modeConfig.border }}>
                    <div
                      className="flex items-center gap-2 px-3 py-2 border-b text-[10px] font-semibold uppercase tracking-widest"
                      style={{ borderColor: 'rgba(6,182,212,0.08)', color: modeConfig.color }}
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: modeConfig.color }} />
                      Model output — live
                    </div>
                    <pre
                      className="px-4 py-3 text-[11px] font-mono text-slate-300 leading-relaxed overflow-y-auto whitespace-pre-wrap break-all"
                      style={{ maxHeight: '280px', minHeight: '60px' }}
                    >
                      {op.llmStream || <span className="text-slate-600 italic">waiting for first token…</span>}
                      {op.llmStream && <span className="animate-pulse text-cyan-400">▌</span>}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {op.errorMsg && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-900/30 bg-red-900/10">
                <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <span className="text-sm text-red-400">{op.errorMsg}</span>
              </div>
            )}

            {/* Done */}
            {op.phase === 'done' && !op.errorMsg && (
              <div className="flex items-center gap-3 px-4 py-3 glass rounded-xl border border-green-900/30">
                <CheckCircle size={14} className="text-green-400 shrink-0" />
                <span className="text-sm text-slate-300">
                  Session complete — {op.steps.filter(s => s.result === 'approved').length} steps executed.
                  Check Attack Paths for the updated graph.
                </span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Mode reset dialog ──────────────────────────────────────────────── */}
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
              <div className="flex items-center gap-2 text-sm font-bold" style={{ color: MODE_CONFIGS[pendingMode].color }}>
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
              <button onClick={() => setPendingMode(null)} className="w-full py-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors">
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

  const statusColor = step.result === 'approved' ? 'text-green-400 border-green-900/30'
    : step.result === 'skipped'                  ? 'text-slate-500 border-slate-800'
    : step.result === 'error'                    ? 'text-red-400 border-red-900/30'
    : 'text-cyan-400 border-cyan-900/30'

  const statusLabel = step.result === 'approved' ? 'Executed'
    : step.result === 'skipped' ? 'Skipped'
    : step.result === 'error'   ? 'Error'
    : isRunning                 ? 'Running…'
    : 'Awaiting approval'

  const isMsf = step.action && (step.action.tool.includes('/') || step.action.command.startsWith('msfconsole'))

  return (
    <div
      className={`glass rounded-xl border overflow-hidden transition-all ${statusColor}`}
      style={isActive ? { borderColor: modeConfig.border } : undefined}
    >
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
        {step.analysis && <p className="text-sm text-slate-300 leading-relaxed">{step.analysis}</p>}

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
            {step.action.rationale && <p className="text-xs text-slate-500 italic">{step.action.rationale}</p>}
          </div>
        )}

        {isActive && (
          <div className="flex items-center gap-2 pt-1">
            <button onClick={onApprove} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs text-white font-semibold transition-colors" style={{ background: modeConfig.color }}>
              <CheckCircle size={12} /> Approve
            </button>
            <button onClick={onSkip} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg glass glass-hover text-xs text-slate-300 font-semibold transition-colors">
              <SkipForward size={12} /> Skip
            </button>
            <button onClick={onStop} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg glass glass-hover text-xs text-red-400 font-semibold transition-colors ml-auto">
              <Square size={12} /> Stop
            </button>
          </div>
        )}

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

        {step.result === 'approved' && !isRunning && step.output && (
          <div className="space-y-1">
            <button onClick={onToggleOutput} className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 uppercase tracking-wider transition-colors">
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
