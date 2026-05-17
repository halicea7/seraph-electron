import { useState, useMemo } from 'react'
import { Copy, Check, Search, ChevronDown, ChevronUp } from 'lucide-react'
import {
  TEMPLATES,
  ALL_CATEGORIES,
  ALL_PHASES,
  CATEGORY_COLORS,
  PHASE_COLORS,
  PHASE_LABELS,
  type CommandTemplate,
  type Category,
  type Phase,
} from '@/lib/templates'

// ── Inline helpers ─────────────────────────────────────────────────────────────

function highlightVars(command: string): React.ReactNode[] {
  const parts = command.split(/({{[^}]+}})/)
  return parts.map((part, i) =>
    /^{{.+}}$/.test(part) ? (
      <span key={i} className="text-cyan-300 font-semibold">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button
      onClick={copy}
      title="Copy command"
      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors"
      style={{ color: copied ? '#34d399' : '#94a3b8', background: 'rgba(255,255,255,0.04)' }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function TemplateCard({ tpl }: { tpl: CommandTemplate }) {
  const [expanded, setExpanded] = useState(false)
  const catColor = CATEGORY_COLORS[tpl.category] ?? '#94a3b8'
  const phaseStyle = PHASE_COLORS[tpl.phase] ?? { bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.3)', text: '#94a3b8' }

  return (
    <div
      className="rounded-xl border transition-all duration-150"
      style={{ background: 'var(--bg-surface)', borderColor: 'rgba(6,182,212,0.1)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {/* Category badge */}
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
              style={{ color: catColor, background: `${catColor}18`, border: `1px solid ${catColor}33` }}
            >
              {tpl.category}
            </span>
            {/* Phase badge */}
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: phaseStyle.text, background: phaseStyle.bg, border: `1px solid ${phaseStyle.border}` }}
            >
              {PHASE_LABELS[tpl.phase]}
            </span>
            {/* Tool badge */}
            <span className="px-2 py-0.5 rounded font-mono text-[10px] text-slate-400 bg-slate-800 border border-slate-700">
              {tpl.tool}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-200">{tpl.label}</h3>
        </div>
      </div>

      {/* When-to-use callout */}
      <div className="mx-4 mb-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(6,182,212,0.06)', borderLeft: '2px solid rgba(6,182,212,0.35)' }}>
        <p className="text-xs text-cyan-200/80 leading-relaxed">{tpl.when_to_use}</p>
      </div>

      {/* Command block */}
      <div
        className="mx-4 mb-3 rounded-lg overflow-hidden"
        style={{ background: '#060b10', border: '1px solid rgba(6,182,212,0.12)' }}
      >
        <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor: 'rgba(6,182,212,0.08)' }}>
          <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">command</span>
          <CopyButton text={tpl.command} />
        </div>
        <pre className="px-3 py-2.5 text-xs font-mono leading-relaxed text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
          {highlightVars(tpl.command)}
        </pre>
      </div>

      {/* Expandable description */}
      <div className="px-4 pb-3">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Less' : 'Details'}
        </button>
        {expanded && (
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">{tpl.description}</p>
        )}
        {expanded && tpl.vars.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tpl.vars.map(v => (
              <span key={v} className="px-1.5 py-0.5 rounded text-[10px] font-mono text-cyan-300 bg-cyan-900/20 border border-cyan-800/30">
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Filter pill ───────────────────────────────────────────────────────────────

function Pill({
  label, active, color, onClick,
}: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150 border"
      style={active
        ? { color: color ?? '#67e8f9', background: `${color ?? '#67e8f9'}18`, borderColor: `${color ?? '#67e8f9'}55` }
        : { color: '#64748b', background: 'transparent', borderColor: 'rgba(100,116,139,0.25)' }
      }
    >
      {label}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CommandLibrary() {
  const [query, setQuery] = useState('')
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(new Set())
  const [activePhases, setActivePhases] = useState<Set<Phase>>(new Set())

  function toggleCategory(c: Category) {
    setActiveCategories(prev => {
      const next = new Set(prev)
      next.has(c) ? next.delete(c) : next.add(c)
      return next
    })
  }

  function togglePhase(p: Phase) {
    setActivePhases(prev => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return TEMPLATES.filter(t => {
      if (activeCategories.size > 0 && !activeCategories.has(t.category)) return false
      if (activePhases.size > 0 && !activePhases.has(t.phase)) return false
      if (q) {
        return (
          t.label.toLowerCase().includes(q) ||
          t.tool.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.when_to_use.toLowerCase().includes(q) ||
          t.command.toLowerCase().includes(q) ||
          (t.tags ?? []).some(tag => tag.includes(q))
        )
      }
      return true
    })
  }, [query, activeCategories, activePhases])

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, CommandTemplate[]>()
    for (const t of filtered) {
      const list = map.get(t.category) ?? []
      list.push(t)
      map.set(t.category, list)
    }
    return map
  }, [filtered])

  const showGrouped = activeCategories.size === 0 && activePhases.size === 0 && !query

  return (
    <div className="min-h-screen px-6 py-8" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight gradient-text mb-1">Command Library</h1>
        <p className="text-sm text-slate-500">
          {TEMPLATES.length} read-only command templates. Click a category or phase to filter. All commands are reference-only — run them through the Pentest Workbench or AI Operator.
        </p>
      </div>

      {/* Search + filters */}
      <div className="glass rounded-xl border border-cyan-900/20 p-4 mb-6">
        {/* Search bar */}
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tools, keywords, commands…"
            className="w-full bg-transparent border border-cyan-900/30 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-600/50 transition-colors"
          />
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 self-center mr-1">Category</span>
          {ALL_CATEGORIES.map(c => (
            <Pill
              key={c}
              label={c}
              active={activeCategories.has(c)}
              color={CATEGORY_COLORS[c]}
              onClick={() => toggleCategory(c)}
            />
          ))}
        </div>

        {/* Phase pills */}
        <div className="flex flex-wrap gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 self-center mr-1">Phase</span>
          {ALL_PHASES.map(p => (
            <Pill
              key={p}
              label={PHASE_LABELS[p]}
              active={activePhases.has(p)}
              color={PHASE_COLORS[p]?.text}
              onClick={() => togglePhase(p)}
            />
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="mb-4 text-xs text-slate-600 font-mono">
        {filtered.length} template{filtered.length !== 1 ? 's' : ''} shown
        {(activeCategories.size > 0 || activePhases.size > 0 || query) && (
          <button
            onClick={() => { setQuery(''); setActiveCategories(new Set()); setActivePhases(new Set()) }}
            className="ml-3 text-cyan-600 hover:text-cyan-400 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Template grid — grouped by category when no filters active */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-600 text-sm">No templates match your search.</div>
      ) : showGrouped ? (
        <div className="space-y-8">
          {[...groupedByCategory.entries()].map(([cat, templates]) => (
            <div key={cat}>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: CATEGORY_COLORS[cat as Category] ?? '#94a3b8' }}>
                {cat} <span className="text-slate-700 font-mono font-normal normal-case tracking-normal">({templates.length})</span>
              </h2>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {templates.map(t => <TemplateCard key={t.id} tpl={t} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map(t => <TemplateCard key={t.id} tpl={t} />)}
        </div>
      )}
    </div>
  )
}
