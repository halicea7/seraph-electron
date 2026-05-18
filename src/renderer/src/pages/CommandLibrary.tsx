import { useState, useMemo } from 'react'
import Icon from '@/components/Icon'
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

function highlightVars(command: string): React.ReactNode[] {
  const parts = command.split(/({{[^}]+}})/)
  return parts.map((part, i) =>
    /^{{.+}}$/.test(part)
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>
      : <span key={i}>{part}</span>
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
      style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
        border: 'none', borderRadius: 2, cursor: 'pointer',
        color: copied ? 'var(--ok)' : 'var(--fg-3)',
        background: 'rgba(255,255,255,0.04)',
        fontFamily: 'var(--font-mono)', fontSize: 11,
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={11} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function TemplateCard({ tpl }: { tpl: CommandTemplate }) {
  const [expanded, setExpanded] = useState(false)
  const catColor = CATEGORY_COLORS[tpl.category] ?? 'var(--fg-3)'
  const phaseStyle = PHASE_COLORS[tpl.phase] ?? { bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.3)', text: '#94a3b8' }

  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 4, background: 'var(--bg-2)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px 8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{
              padding: '2px 7px', borderRadius: 2, fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: catColor, background: `${catColor}18`, border: `1px solid ${catColor}33`,
            }}>
              {tpl.category}
            </span>
            <span style={{
              padding: '2px 7px', borderRadius: 2, fontSize: 10, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: phaseStyle.text, background: phaseStyle.bg, border: `1px solid ${phaseStyle.border}`,
            }}>
              {PHASE_LABELS[tpl.phase]}
            </span>
            <span style={{
              padding: '2px 7px', borderRadius: 2, fontSize: 10,
              fontFamily: 'var(--font-mono)', color: 'var(--fg-3)',
              background: 'var(--bg)', border: '1px solid var(--rule-strong)',
            }}>
              {tpl.tool}
            </span>
          </div>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>{tpl.label}</h3>
        </div>
      </div>

      {/* When-to-use callout */}
      <div style={{
        margin: '0 16px 10px', padding: '7px 12px',
        background: 'rgba(240,168,58,0.05)', borderLeft: '2px solid rgba(240,168,58,0.35)',
        borderRadius: '0 3px 3px 0',
      }}>
        <p style={{ fontSize: 12, color: 'var(--fg-2)', margin: 0, lineHeight: 1.55 }}>{tpl.when_to_use}</p>
      </div>

      {/* Command block */}
      <div style={{ margin: '0 16px 10px', border: '1px solid var(--rule)', borderRadius: 3, overflow: 'hidden', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', borderBottom: '1px solid var(--rule)' }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>command</span>
          <CopyButton text={tpl.command} />
        </div>
        <pre style={{ padding: '10px 12px', fontSize: 12, fontFamily: 'var(--font-mono)', lineHeight: 1.5, color: 'var(--fg-2)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
          {highlightVars(tpl.command)}
        </pre>
      </div>

      {/* Expandable description */}
      <div style={{ padding: '0 16px 12px' }}>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <Icon name={expanded ? 'chev_u' : 'chev_d'} size={11} />
          {expanded ? 'Less' : 'Details'}
        </button>
        {expanded && (
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.6 }}>{tpl.description}</p>
        )}
        {expanded && tpl.vars.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tpl.vars.map(v => (
              <span key={v} style={{
                padding: '2px 7px', borderRadius: 2, fontSize: 10,
                fontFamily: 'var(--font-mono)', color: 'var(--accent)',
                background: 'rgba(240,168,58,0.08)', border: '1px solid rgba(240,168,58,0.25)',
              }}>
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Pill({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  const c = color ?? '#94a3b8'
  return (
    <button
      onClick={onClick}
      style={active
        ? { color: c, background: `${c}18`, border: `1px solid ${c}55`, padding: '3px 10px', borderRadius: 2, fontSize: 11, fontWeight: 600, cursor: 'pointer' }
        : { color: 'var(--fg-3)', background: 'transparent', border: '1px solid var(--rule-strong)', padding: '3px 10px', borderRadius: 2, fontSize: 11, fontWeight: 600, cursor: 'pointer' }
      }
    >
      {label}
    </button>
  )
}

export default function CommandLibrary() {
  const [query, setQuery] = useState('')
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(new Set())
  const [activePhases, setActivePhases] = useState<Set<Phase>>(new Set())

  function toggleCategory(c: Category) {
    setActiveCategories(prev => { const next = new Set(prev); next.has(c) ? next.delete(c) : next.add(c); return next })
  }

  function togglePhase(p: Phase) {
    setActivePhases(prev => { const next = new Set(prev); next.has(p) ? next.delete(p) : next.add(p); return next })
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
    <div style={{ minHeight: '100%', padding: '20px 24px', background: 'var(--bg)', overflowY: 'auto', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--rule)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Icon name="book" size={15} color="var(--accent)" />
          <h1 style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Command Library</h1>
        </div>
        <p style={{ fontSize: 12, color: 'var(--fg-3)', margin: 0 }}>
          {TEMPLATES.length} read-only command templates — run them through Pentest Workbench or AI Operator
        </p>
      </div>

      {/* Search + filters */}
      <div style={{ border: '1px solid var(--rule)', borderRadius: 4, padding: 16, marginBottom: 20, background: 'var(--bg-2)' }}>
        {/* Search bar */}
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--fg-3)', display: 'flex' }}>
            <Icon name="search" size={13} />
          </span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tools, keywords, commands…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg)', border: '1px solid var(--rule-strong)',
              borderRadius: 3, paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
              fontSize: 13, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none',
            }}
          />
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', alignSelf: 'center', marginRight: 4 }}>Category</span>
          {ALL_CATEGORIES.map(c => (
            <Pill key={c} label={c} active={activeCategories.has(c)} color={CATEGORY_COLORS[c]} onClick={() => toggleCategory(c)} />
          ))}
        </div>

        {/* Phase pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-3)', alignSelf: 'center', marginRight: 4 }}>Phase</span>
          {ALL_PHASES.map(p => (
            <Pill key={p} label={PHASE_LABELS[p]} active={activePhases.has(p)} color={PHASE_COLORS[p]?.text} onClick={() => togglePhase(p)} />
          ))}
        </div>
      </div>

      {/* Results count */}
      <div style={{ marginBottom: 16, fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
        {filtered.length} template{filtered.length !== 1 ? 's' : ''} shown
        {(activeCategories.size > 0 || activePhases.size > 0 || query) && (
          <button
            onClick={() => { setQuery(''); setActiveCategories(new Set()); setActivePhases(new Set()) }}
            style={{ marginLeft: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Template grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--fg-3)', fontSize: 13 }}>
          No templates match your search.
        </div>
      ) : showGrouped ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {[...groupedByCategory.entries()].map(([cat, templates]) => (
            <div key={cat}>
              <h2 style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                marginBottom: 12, color: CATEGORY_COLORS[cat as Category] ?? 'var(--fg-3)',
              }}>
                {cat}{' '}
                <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  ({templates.length})
                </span>
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 10 }}>
                {templates.map(t => <TemplateCard key={t.id} tpl={t} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 10 }}>
          {filtered.map(t => <TemplateCard key={t.id} tpl={t} />)}
        </div>
      )}
    </div>
  )
}
