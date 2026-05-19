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

// ── Static data shaped for the filter UI ─────────────────────────────────────

const CATS = ALL_CATEGORIES.map(id => ({ id, color: CATEGORY_COLORS[id] }))

const PHASES = ALL_PHASES.map(id => ({
  id,
  label: PHASE_LABELS[id],
  color: PHASE_COLORS[id].text,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function highlightVars(command: string): React.ReactNode[] {
  const parts = command.split(/(\{\{\s*[^}]+\s*\}\})/g)
  return parts.map((part, i) =>
    /^\{\{.+\}\}$/.test(part)
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 500 }}>{part}</span>
      : <span key={i}>{part}</span>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PageHeader({
  breadcrumb, title, sub, right,
}: {
  breadcrumb: string
  title: string
  sub: string
  right?: React.ReactNode
}) {
  return (
    <div style={{
      padding: '18px var(--pad)',
      borderBottom: '1px solid var(--rule)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 16,
      flexShrink: 0,
    }}>
      <div>
        <div className="smcap" style={{ marginBottom: 4 }}>{breadcrumb}</div>
        <h1 className="mono" style={{ margin: 0, fontWeight: 500, fontSize: 22, letterSpacing: '-0.01em' }}>{title}</h1>
        <div style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 6 }}>{sub}</div>
      </div>
      {right && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{right}</div>
      )}
    </div>
  )
}

function FilterPill({
  label, color, active, onClick,
}: {
  label: string
  color: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        border: `1px solid ${active ? color : 'var(--rule-strong)'}`,
        background: active ? `${color}1a` : 'transparent',
        color: active ? color : 'var(--fg-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        fontWeight: 500,
        cursor: 'pointer',
        borderRadius: 0,
      }}
    >
      {label}
    </button>
  )
}

function TemplateCard({
  tpl, copied, onCopy,
}: {
  tpl: CommandTemplate
  copied: boolean
  onCopy: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const cat = CATS.find(c => c.id === tpl.category)
  const ph = PHASES.find(p => p.id === tpl.phase)

  return (
    <div style={{
      border: '1px solid var(--rule)',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span
            className="badge"
            style={{
              color: cat?.color ?? 'var(--fg-2)',
              borderColor: cat?.color ?? 'var(--rule-strong)',
              background: `${cat?.color ?? '#888'}14`,
            }}
          >
            {tpl.category}
          </span>
          <span
            className="badge"
            style={{
              color: ph?.color ?? 'var(--fg-3)',
              borderColor: ph?.color ?? 'var(--rule-strong)',
            }}
          >
            {ph?.label ?? tpl.phase}
          </span>
          <span className="badge mono" style={{ fontFamily: 'var(--font-mono)' }}>{tpl.tool}</span>
        </div>
        <h3 style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--fg)',
        }}>
          {tpl.label}
        </h3>
      </div>

      {/* When-to-use */}
      <div style={{
        margin: '0 14px 12px',
        padding: '8px 11px',
        borderLeft: `2px solid ${cat?.color ?? 'var(--accent)'}`,
        background: 'var(--bg-2)',
      }}>
        <div className="smcap smcap-2" style={{ marginBottom: 4 }}>When to use</div>
        <div style={{ fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.5 }}>{tpl.when_to_use}</div>
      </div>

      {/* Command block */}
      <div style={{
        margin: '0 14px 12px',
        border: '1px solid var(--rule)',
        background: 'var(--bg-term)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderBottom: '1px solid var(--rule)',
        }}>
          <span className="mono" style={{
            fontSize: 9,
            color: 'var(--fg-4)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}>
            command
          </span>
          <button
            onClick={onCopy}
            className="btn btn-sm btn-ghost"
            style={{ color: copied ? 'var(--ok)' : 'var(--fg-3)' }}
          >
            <Icon name={copied ? 'check' : 'file'} size={9} color={copied ? 'var(--ok)' : 'currentColor'} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre style={{
          margin: 0,
          padding: '10px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--fg)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.6,
        }}>
          {highlightVars(tpl.command)}
        </pre>
      </div>

      {/* Details toggle */}
      <div style={{ padding: '0 14px 14px' }}>
        <button
          onClick={() => setExpanded(e => !e)}
          className="btn btn-ghost btn-sm"
          style={{ padding: '2px 0', height: 18 }}
        >
          <Icon name={expanded ? 'chev_d' : 'chev_r'} size={9} />
          {expanded ? 'Less' : 'Details'}
        </button>
        {expanded && (
          <>
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--fg-2)', lineHeight: 1.55 }}>
              {tpl.description}
            </div>
            {tpl.vars.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {tpl.vars.map(v => (
                  <span
                    key={v}
                    className="badge mono"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent)',
                      borderColor: 'var(--accent)',
                      background: 'rgba(240,168,58,0.08)',
                    }}
                  >
                    {`{{ ${v} }}`}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CommandLibrary() {
  const [query, setQuery] = useState('')
  const [activeCats, setActiveCats] = useState<Set<Category>>(new Set())
  const [activePhases, setActivePhases] = useState<Set<Phase>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function toggleCat(id: Category) {
    setActiveCats(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function togglePhase(id: Phase) {
    setActivePhases(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function clearFilters() {
    setQuery('')
    setActiveCats(new Set())
    setActivePhases(new Set())
  }

  function copyCommand(id: string, command: string) {
    try { navigator.clipboard?.writeText(command) } catch (_) { /* ignore */ }
    setCopiedId(id)
    setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1800)
  }

  const hasFilters = query !== '' || activeCats.size > 0 || activePhases.size > 0

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return TEMPLATES.filter(t => {
      if (activeCats.size > 0 && !activeCats.has(t.category)) return false
      if (activePhases.size > 0 && !activePhases.has(t.phase)) return false
      if (!q) return true
      return (
        t.label.toLowerCase().includes(q) ||
        t.tool.toLowerCase().includes(q) ||
        t.command.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.when_to_use.toLowerCase().includes(q) ||
        (t.tags ?? []).some(tag => tag.toLowerCase().includes(q))
      )
    })
  }, [query, activeCats, activePhases])

  const grouped = useMemo(() => {
    const map = new Map<string, CommandTemplate[]>()
    for (const t of filtered) {
      if (!map.has(t.category)) map.set(t.category, [])
      map.get(t.category)!.push(t)
    }
    return map
  }, [filtered])

  const showGrouped = !hasFilters

  const rule = '1px solid var(--rule)'

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Page header */}
      <PageHeader
        breadcrumb="Knowledge Base"
        title="Command Library"
        sub={`${TEMPLATES.length} read-only command templates · click a category or phase to filter. All commands are reference-only — run them through the Pentest Workbench or AI Operator.`}
        right={
          <>
            <button className="btn">
              <Icon name="download" size={11} /> Export
            </button>
            <button className="btn">
              <Icon name="plus" size={11} /> New template
            </button>
          </>
        }
      />

      {/* Filter strip */}
      <div style={{
        padding: '14px var(--pad)',
        borderBottom: rule,
        background: 'var(--bg-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        flexShrink: 0,
      }}>

        {/* Row 1 — search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="search" size={13} color="var(--fg-3)" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search tools · keywords · commands · variables…"
            style={{ flex: 1, height: 32, fontSize: 12 }}
          />
          {hasFilters && (
            <button onClick={clearFilters} className="btn btn-ghost">
              <Icon name="x" size={10} /> Clear
            </button>
          )}
        </div>

        {/* Row 2 — categories */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="smcap smcap-2" style={{ marginRight: 4 }}>Category</span>
          {CATS.map(c => (
            <FilterPill
              key={c.id}
              label={c.id}
              color={c.color}
              active={activeCats.has(c.id as Category)}
              onClick={() => toggleCat(c.id as Category)}
            />
          ))}
        </div>

        {/* Row 3 — phases + count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="smcap smcap-2" style={{ marginRight: 4 }}>Phase</span>
          {PHASES.map(p => (
            <FilterPill
              key={p.id}
              label={p.label}
              color={p.color}
              active={activePhases.has(p.id as Phase)}
              onClick={() => togglePhase(p.id as Phase)}
            />
          ))}
          <span style={{ marginLeft: 'auto' }} className="mono">
            <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
              {filtered.length} of {TEMPLATES.length} templates
            </span>
          </span>
        </div>
      </div>

      {/* Results area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px var(--pad) 40px' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fg-3)' }}>
            <Icon name="search" size={20} color="var(--fg-4)" />
            <div className="mono" style={{ fontSize: 12, marginTop: 12 }}>No templates match your search.</div>
          </div>
        ) : showGrouped ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {Array.from(grouped.entries()).map(([catId, list]) => {
              const cat = CATS.find(c => c.id === catId)
              return (
                <div key={catId}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                    <span className="mono" style={{
                      fontSize: 11,
                      color: cat?.color ?? 'var(--fg)',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                    }}>
                      {catId}
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--fg-4)' }}>
                      ({list.length})
                    </span>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
                    gap: 14,
                  }}>
                    {list.map(t => (
                      <TemplateCard
                        key={t.id}
                        tpl={t}
                        copied={copiedId === t.id}
                        onCopy={() => copyCommand(t.id, t.command)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
            gap: 14,
          }}>
            {filtered.map(t => (
              <TemplateCard
                key={t.id}
                tpl={t}
                copied={copiedId === t.id}
                onCopy={() => copyCommand(t.id, t.command)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
