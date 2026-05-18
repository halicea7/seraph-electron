import { useState, useEffect, useRef } from 'react'
import {
  Bot, Play, Square, SkipForward, CheckCircle, Loader,
  ChevronDown, ChevronRight, GitBranch, AlertTriangle,
  FileSearch, RotateCcw, ChevronUp, Pencil,
} from 'lucide-react'
import Icon from '@/components/Icon'
import { PENTEST_TOOLS, MSF_MODULES, PENTEST_CATEGORIES, MSF_CATEGORIES, MODE_CONFIGS, OperatorMode } from '@/lib/operator'
import { useAIOperator, type OperatorStep, type OperatorPhase } from '@/contexts/AIOperatorContext'

const MODE_ICONS: Record<OperatorMode, React.ReactNode> = {
  attack: <Icon name="swords" size={13} />,
  recon:  <Icon name="search" size={13} />,
  audit:  <FileSearch size={13} />,
}

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

export default function AIOperator() {
  const op = useAIOperator()
  const modeConfig = MODE_CONFIGS[op.mode]
  const sessionActive = op.phase !== 'idle'
  const target = op.targets.find(t => t.id === op.selectedTarget)

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
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left Config Panel ── */}
      <div style={{
        width: 272, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: rule, overflowY: 'auto', background: 'var(--bg)',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: rule }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Bot size={15} color={modeConfig.color} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>AI Operator</span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0 }}>Supervised LLM-driven session</p>
        </div>

        {/* Mode selector */}
        <div style={{ padding: '12px 12px', borderBottom: rule }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', fontWeight: 700, marginBottom: 8, paddingLeft: 2 }}>Mode</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {(Object.values(MODE_CONFIGS) as typeof MODE_CONFIGS[OperatorMode][]).map(cfg => {
              const isActive = op.mode === cfg.id
              return (
                <button
                  key={cfg.id}
                  onClick={() => handleModeClick(cfg.id)}
                  disabled={sessionActive}
                  title={cfg.desc}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '8px 4px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer',
                    transition: 'all 0.15s', opacity: sessionActive ? 0.4 : 1,
                    ...(isActive
                      ? { color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }
                      : { color: 'var(--fg-3)', background: 'transparent', border: ruleStrong }),
                  }}
                >
                  {MODE_ICONS[cfg.id]}
                  {cfg.label}
                </button>
              )
            })}
          </div>
          <p style={{ fontSize: 10, padding: '6px 2px 0', margin: 0, color: `${modeConfig.color}99` }}>
            {modeConfig.desc}
          </p>
        </div>

        <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 18, fontSize: 12 }}>

          {/* Project */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', fontWeight: 700 }}>Project</label>
            <select
              value={op.selectedProject}
              onChange={e => op.setSelectedProject(e.target.value)}
              disabled={sessionActive}
              style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 3, padding: '5px 8px', fontSize: 12, color: 'var(--fg)', outline: 'none', opacity: sessionActive ? 0.5 : 1 }}
            >
              {op.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Target */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', fontWeight: 700 }}>Target</label>
            <select
              value={op.selectedTarget}
              onChange={e => op.setSelectedTarget(e.target.value)}
              disabled={sessionActive}
              style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 3, padding: '5px 8px', fontSize: 12, color: 'var(--fg)', outline: 'none', opacity: sessionActive ? 0.5 : 1 }}
            >
              {op.targets.map(t => <option key={t.id} value={t.id}>{t.hostname_or_ip}</option>)}
            </select>
          </div>

          {/* Model */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', fontWeight: 700 }}>Model</label>
              <button
                onClick={op.loadModelOptions}
                disabled={op.loadingModels}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, display: 'flex' }}
                title="Refresh models"
              >
                <Icon name="refresh" size={11} color={op.loadingModels ? 'var(--accent)' : 'currentColor'} />
              </button>
            </div>
            {op.modelOptions.length > 0 ? (
              <select
                value={op.selectedModelKey}
                onChange={e => op.setSelectedModelKey(e.target.value)}
                disabled={sessionActive}
                style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 3, padding: '5px 8px', fontSize: 12, color: 'var(--fg)', outline: 'none', opacity: sessionActive ? 0.5 : 1 }}
              >
                {op.modelOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            ) : (
              <p style={{ fontSize: 11, color: '#f0a83a', margin: 0, lineHeight: 1.5 }}>
                No tool-capable models found. Pull one (e.g. <code style={{ fontFamily: 'var(--font-mono)' }}>ollama pull qwen3</code>).
              </p>
            )}
          </div>

          <div style={{ borderTop: rule }} />

          {/* Pentest Tools */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', fontWeight: 700 }}>Pentest Tools</label>
            {PENTEST_CATEGORIES.map(cat => (
              <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 10, color: 'var(--fg-3)', fontWeight: 500 }}>{cat}</div>
                {PENTEST_TOOLS.filter(t => t.category === cat).map(tool => (
                  <label key={tool.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer' }} title={tool.desc}>
                    <input
                      type="checkbox"
                      checked={op.enabledTools.has(tool.id)}
                      onChange={() => op.toggleTool(tool.id)}
                      disabled={sessionActive}
                      style={{ accentColor: modeConfig.color }}
                    />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: op.enabledTools.has(tool.id) ? 'var(--fg)' : 'var(--fg-3)' }}>
                      {tool.label}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>

          <div style={{ borderTop: rule }} />

          {/* MSF Modules */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', fontWeight: 700 }}>Metasploit Modules</label>
            {MSF_CATEGORIES.map(cat => (
              <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 10, color: 'var(--fg-3)', fontWeight: 500 }}>{cat}</div>
                {MSF_MODULES.filter(t => t.category === cat).map(mod => (
                  <label key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0', cursor: 'pointer' }} title={mod.desc}>
                    <input
                      type="checkbox"
                      checked={op.enabledMsf.has(mod.id)}
                      onChange={() => op.toggleMsf(mod.id)}
                      disabled={sessionActive}
                      style={{ accentColor: '#e84040' }}
                    />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: op.enabledMsf.has(mod.id) ? 'var(--fg)' : 'var(--fg-3)' }}>
                      {mod.label}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>

          <div style={{ borderTop: rule }} />

          {/* System Prompt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                onClick={() => setPromptOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--fg-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {promptOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                System Prompt
                {!op.promptIsAuto && (
                  <span style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 2, fontSize: 9, fontWeight: 700, background: 'rgba(240,168,58,0.12)', color: '#f0a83a', border: '1px solid rgba(240,168,58,0.3)', textTransform: 'none', letterSpacing: 0 }}>
                    Custom
                  </span>
                )}
              </button>
              {!op.promptIsAuto && (
                <button onClick={op.regeneratePrompt} title="Reset to auto-generated prompt" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--fg-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <RotateCcw size={10} /> Reset
                </button>
              )}
            </div>
            {promptOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--fg-3)' }}>
                  <Pencil size={9} />
                  {op.promptIsAuto ? 'Auto-generated · edits lock this prompt' : 'Custom · session will use this as-is'}
                </div>
                <textarea
                  value={op.promptDraft}
                  onChange={e => { op.setPromptDraft(e.target.value); op.setPromptIsAuto(false) }}
                  disabled={sessionActive}
                  rows={12}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: ruleStrong,
                    borderRadius: 3, padding: '8px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
                    color: 'var(--fg)', resize: 'none', outline: 'none', lineHeight: 1.5,
                    opacity: sessionActive ? 0.5 : 1,
                  }}
                />
              </div>
            )}
          </div>

        </div>

        {/* Start / Stop / New */}
        <div style={{ padding: '14px 16px', borderTop: rule, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* LHOST */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', fontWeight: 700 }}>
              <Icon name="wifi" size={10} /> LHOST (your IP)
            </label>
            <input
              type="text"
              value={op.lhostIp}
              onChange={e => op.setLhostIp(e.target.value)}
              placeholder="e.g. 192.168.1.10"
              style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 3, padding: '5px 8px', fontSize: 11, color: 'var(--fg)', fontFamily: 'var(--font-mono)', outline: 'none' }}
            />
            <p style={{ fontSize: 10, color: 'var(--fg-3)', margin: 0 }}>Auto-substituted into MSF LHOST placeholders</p>
          </div>

          {/* Stream toggle */}
          <button
            onClick={() => op.setShowStream(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 10px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
              transition: 'all 0.15s',
              ...(op.showStream
                ? { color: modeConfig.color, background: modeConfig.bg, border: `1px solid ${modeConfig.border}` }
                : { color: 'var(--fg-3)', background: 'transparent', border: ruleStrong }),
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
              <Icon name={op.showStream ? 'eye' : 'eye_off'} size={12} />
              Live model stream
            </span>
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
              ...(op.showStream
                ? { color: modeConfig.color, background: `${modeConfig.color}22` }
                : { color: 'var(--fg-3)', background: 'rgba(58,53,48,0.4)' }),
            }}>
              {op.showStream ? 'On' : 'Off'}
            </span>
          </button>

          {op.phase === 'idle' ? (
            <button
              onClick={op.startSession}
              disabled={!op.selectedProject || !op.selectedTarget || !op.selectedModelKey}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '9px 12px', borderRadius: 3, border: 'none', cursor: 'pointer',
                background: modeConfig.color, color: '#fff', fontSize: 13, fontWeight: 600,
                opacity: (!op.selectedProject || !op.selectedTarget || !op.selectedModelKey) ? 0.4 : 1,
              }}
            >
              <Play size={14} /> Start {modeConfig.label} Session
            </button>
          ) : op.phase === 'done' ? (
            <button
              onClick={op.resetSession}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '9px 12px', borderRadius: 3, border: ruleStrong, cursor: 'pointer',
                background: 'var(--bg-2)', color: 'var(--fg-2)', fontSize: 13, fontWeight: 600,
              }}
            >
              <Icon name="refresh" size={14} /> New Session
            </button>
          ) : (
            <button
              onClick={op.handleStop}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '9px 12px', borderRadius: 3, border: '1px solid rgba(232,64,64,0.3)', cursor: 'pointer',
                background: 'rgba(232,64,64,0.06)', color: '#e84040', fontSize: 13, fontWeight: 600,
              }}
            >
              <Square size={14} /> Stop Session
            </button>
          )}
        </div>
      </div>

      {/* ── Right Session Panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {op.phase === 'idle' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, textAlign: 'center', padding: '0 40px' }}>
            <div style={{
              width: 60, height: 60, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: modeConfig.bg, border: `1px solid ${modeConfig.border}`,
            }}>
              <Bot size={28} color={`${modeConfig.color}99`} />
            </div>
            <div>
              <h3 style={{ color: modeConfig.color, fontWeight: 600, marginBottom: 6 }}>{modeConfig.label} Mode</h3>
              <p style={{ fontSize: 13, color: 'var(--fg-3)', maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>
                {modeConfig.desc}. Select a project, target, and model. Enable tools, optionally edit the system prompt, then start a supervised session.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 280 }}>
              {[
                'You approve every command before it runs',
                'Findings auto-populate the attack path graph',
                'Sessions resume if you navigate away',
              ].map(msg => (
                <div key={msg} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-3)' }}>
                  <CheckCircle size={12} color="var(--ok)" />
                  {msg}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Context banner */}
            {target && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
                border: rule, borderRadius: 3, fontSize: 12, color: 'var(--fg-3)',
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 2, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: modeConfig.color, background: modeConfig.bg, border: `1px solid ${modeConfig.border}` }}>
                  {MODE_ICONS[op.mode]} {modeConfig.label}
                </div>
                <span style={{ color: 'var(--rule-strong)' }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="terminal" size={12} color="var(--accent)" /> {target.hostname_or_ip}
                </div>
                <span style={{ color: 'var(--rule-strong)' }}>|</span>
                <div>{op.modelOptions.find(o => o.key === op.selectedModelKey)?.label ?? op.selectedModelKey}</div>
                <span style={{ color: 'var(--rule-strong)' }}>|</span>
                <div>{op.enabledTools.size + op.enabledMsf.size} tools</div>
                {!op.promptIsAuto && (
                  <>
                    <span style={{ color: 'var(--rule-strong)' }}>|</span>
                    <div style={{ color: 'var(--accent)', fontSize: 10 }}>Custom prompt</div>
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
                runStartTime={step.result === 'approved' && op.phase === 'running' ? op.runStartTime : null}
                onApprove={() => op.handleApprove(step)}
                onSkip={() => op.handleSkip(step)}
                onStop={op.handleStop}
                onToggleOutput={() => op.toggleStepOutput(step.id)}
              />
            ))}

            {/* Thinking + live stream */}
            {op.phase === 'thinking' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: rule, borderRadius: 3 }}>
                  <Loader size={14} color="var(--accent)" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>Analyzing and planning next action…</span>
                </div>
                {op.showStream && (
                  <div style={{ border: `1px solid ${modeConfig.border}`, borderRadius: 3, overflow: 'hidden', background: 'var(--bg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderBottom: `1px solid ${modeConfig.border}40`, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: modeConfig.color }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: modeConfig.color, animation: 'pulse 1.5s ease-in-out infinite' }} />
                      Model output — live
                    </div>
                    <pre style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-2)', lineHeight: 1.5, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 280, minHeight: 60, margin: 0 }}>
                      {op.llmStream || <span style={{ color: 'var(--fg-3)', fontStyle: 'italic' }}>waiting for first token…</span>}
                      {op.llmStream && <span style={{ animation: 'pulse 1s ease-in-out infinite', color: 'var(--accent)' }}>▌</span>}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {op.errorMsg && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 3, border: '1px solid rgba(232,64,64,0.3)', background: 'rgba(232,64,64,0.06)' }}>
                <AlertTriangle size={14} color="#e84040" style={{ marginTop: 1, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#e84040' }}>{op.errorMsg}</span>
              </div>
            )}

            {/* Done */}
            {op.phase === 'done' && !op.errorMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid rgba(84,175,97,0.3)', borderRadius: 3, background: 'rgba(84,175,97,0.06)' }}>
                <CheckCircle size={14} color="var(--ok)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>
                  Session complete — {op.steps.filter(s => s.result === 'approved').length} steps executed. Check Attack Paths for the updated graph.
                </span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Mode reset dialog ── */}
      {pendingMode && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setPendingMode(null)}
        >
          <div
            style={{ border: `1px solid ${MODE_CONFIGS[pendingMode].border}`, borderRadius: 4, padding: 24, width: 320, display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--bg-2)' }}
            onClick={e => e.stopPropagation()}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: MODE_CONFIGS[pendingMode].color, marginBottom: 4 }}>
                {MODE_ICONS[pendingMode]}
                Switch to {MODE_CONFIGS[pendingMode].label} Mode
              </div>
              <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0 }}>{MODE_CONFIGS[pendingMode].desc}</p>
            </div>
            <p style={{ fontSize: 12, color: 'var(--fg-2)', margin: 0 }}>
              Reset tool selection to <strong style={{ color: MODE_CONFIGS[pendingMode].color }}>{MODE_CONFIGS[pendingMode].label}</strong> defaults?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => confirmModeSwitch(true)}
                style={{ padding: '8px 12px', borderRadius: 3, border: 'none', cursor: 'pointer', background: MODE_CONFIGS[pendingMode].color, color: '#fff', fontSize: 12, fontWeight: 600 }}
              >
                Reset tools to {MODE_CONFIGS[pendingMode].label} defaults
              </button>
              <button
                onClick={() => confirmModeSwitch(false)}
                style={{ padding: '8px 12px', borderRadius: 3, cursor: 'pointer', background: 'var(--bg)', border: rule, color: 'var(--fg-2)', fontSize: 12, fontWeight: 600 }}
              >
                Switch mode, keep current tools
              </button>
              <button
                onClick={() => setPendingMode(null)}
                style={{ padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--fg-3)' }}
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
  runStartTime: number | null
  onApprove: () => void
  onSkip: () => void
  onStop: () => void
  onToggleOutput: () => void
}

function StepCard({ step, index, mode, isActive, isRunning, liveOutput, runStartTime, onApprove, onSkip, onStop, onToggleOutput }: StepCardProps) {
  const modeConfig = MODE_CONFIGS[mode]
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isRunning || !runStartTime) { setElapsed(0); return }
    setElapsed(Math.floor((Date.now() - runStartTime) / 1000))
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - runStartTime) / 1000)), 1000)
    return () => clearInterval(t)
  }, [isRunning, runStartTime])

  const fmtElapsed = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`

  const borderColor = step.result === 'approved' ? 'rgba(84,175,97,0.35)'
    : step.result === 'skipped' ? 'var(--rule-strong)'
    : step.result === 'error'   ? 'rgba(232,64,64,0.35)'
    : isActive                  ? modeConfig.border
    : 'var(--rule)'

  const statusColor = step.result === 'approved' ? 'var(--ok)'
    : step.result === 'skipped' ? 'var(--fg-3)'
    : step.result === 'error'   ? 'var(--crit)'
    : 'var(--accent)'

  const statusLabel = step.result === 'approved' ? 'Executed'
    : step.result === 'skipped' ? 'Skipped'
    : step.result === 'error'   ? 'Error'
    : isRunning                 ? 'Running…'
    : 'Awaiting approval'

  const isMsf = step.action && (step.action.tool.includes('/') || step.action.command.startsWith('msfconsole'))

  return (
    <div style={{ border: `1px solid ${borderColor}`, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-2)' }}>
      {/* Step header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>STEP {index}</span>
          {isRunning && <Loader size={11} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />}
          {step.result === 'approved' && !isRunning && <CheckCircle size={11} color="var(--ok)" />}
          {step.result === 'skipped' && <SkipForward size={11} color="var(--fg-3)" />}
        </div>
        <span style={{ fontSize: 11, color: statusColor, fontWeight: 500 }}>{statusLabel}</span>
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {step.analysis && <p style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6, margin: 0 }}>{step.analysis}</p>}

        {step.attackPathNote && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#f0a83a', background: 'rgba(240,168,58,0.05)', borderRadius: 3, padding: '7px 10px', border: '1px solid rgba(240,168,58,0.2)' }}>
            <GitBranch size={11} style={{ flexShrink: 0 }} />
            <span>{step.attackPathNote}</span>
          </div>
        )}

        {step.action && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 2,
                ...(isMsf
                  ? { color: '#a855f7', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.3)' }
                  : { color: 'var(--accent)', background: 'rgba(240,168,58,0.08)', border: '1px solid rgba(240,168,58,0.25)' }),
              }}>
                {isMsf ? 'MSF' : 'TOOL'} · {step.action.tool}
              </span>
            </div>
            <pre style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-2)', background: 'var(--bg)', borderRadius: 3, padding: '9px 12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: '1px solid var(--rule)', margin: 0 }}>
              <span style={{ color: 'var(--fg-3)', userSelect: 'none' }}>$ </span>{step.action.command}
            </pre>
            {step.action.rationale && <p style={{ fontSize: 11, color: 'var(--fg-3)', fontStyle: 'italic', margin: 0 }}>{step.action.rationale}</p>}
          </div>
        )}

        {isActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
            <button
              onClick={onApprove}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 3, border: 'none', cursor: 'pointer', background: modeConfig.color, color: '#fff', fontSize: 12, fontWeight: 600 }}
            >
              <CheckCircle size={12} /> Approve
            </button>
            <button
              onClick={onSkip}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 3, cursor: 'pointer', background: 'var(--bg)', border: '1px solid var(--rule-strong)', color: 'var(--fg-2)', fontSize: 12, fontWeight: 600 }}
            >
              <SkipForward size={12} /> Skip
            </button>
            <button
              onClick={onStop}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 3, cursor: 'pointer', background: 'rgba(232,64,64,0.06)', border: '1px solid rgba(232,64,64,0.3)', color: '#e84040', fontSize: 12, fontWeight: 600, marginLeft: 'auto' }}
            >
              <Icon name="stop" size={12} /> Stop
            </button>
          </div>
        )}

        {isRunning && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> Live output
              </div>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>{fmtElapsed(elapsed)}</span>
            </div>
            <pre style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ok)', background: 'var(--bg)', borderRadius: 3, padding: '8px 12px', maxHeight: 256, overflowY: 'auto', border: '1px solid rgba(84,175,97,0.2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
              {liveOutput ? liveOutput.slice(-6000) : <span style={{ color: 'var(--fg-3)', fontStyle: 'italic' }}>Waiting for process output…</span>}
            </pre>
          </div>
        )}

        {step.result === 'approved' && !isRunning && step.output && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <button
              onClick={onToggleOutput}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {step.outputOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              Output · {step.output.length.toLocaleString()} bytes
            </button>
            {step.outputOpen && (
              <pre style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ok)', background: 'var(--bg)', borderRadius: 3, padding: '8px 12px', maxHeight: 256, overflowY: 'auto', border: '1px solid rgba(84,175,97,0.2)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {step.output.slice(0, 12000)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
