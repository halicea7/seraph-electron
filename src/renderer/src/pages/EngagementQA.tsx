import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAppStore } from '@/stores/appStore'
import { getApiBase } from '@/lib/config'
import Icon from '@/components/Icon'
import EmptyState from '@/components/EmptyState'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Citation {
  n: number
  type: string
  id: string
  title: string
}

interface Answer {
  question: string
  answer: string
  citations: Citation[]
  model: string
}

// Map a citation source type to the page that shows it.
const CITE_ROUTE: Record<string, (id: string) => string> = {
  finding: () => '/findings',
  vuln: () => '/findings',
  scan: (id) => `/scans?open=${id}`,
  loot: () => '/c2',
  credential: () => '/vault',
}

const SUGGESTIONS = [
  'What are the critical findings?',
  'Which credentials have we collected?',
  'Summarize the attack surface for this engagement.',
  'What should we prioritize for remediation?',
]

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EngagementQA() {
  const { selectedProject } = useAppStore()
  const navigate = useNavigate()
  const api = getApiBase()

  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<Answer[]>([])

  // Available models + the one to use. Defaults to the global Settings → AI model.
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [defaultModel, setDefaultModel] = useState('')

  useEffect(() => {
    fetch(`${api}/ai/config`)
      .then(r => r.json())
      .then(cfg => { setDefaultModel(cfg.model || ''); setModel(m => m || cfg.model || '') })
      .catch(() => {})
    fetch(`${api}/ai/models`)
      .then(r => r.json())
      .then(d => setModels(d.models || []))
      .catch(() => {})
  }, [])

  async function ask(q: string) {
    if (!selectedProject || !q.trim()) return
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`${api}/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: selectedProject.id, question: q.trim(), model: model || undefined }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.detail || 'Request failed')
      }
      const data = await r.json()
      setHistory(prev => [{ question: q.trim(), answer: data.answer, citations: data.citations || [], model: model || defaultModel }, ...prev])
      setQuestion('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  function goToCitation(c: Citation) {
    const route = CITE_ROUTE[c.type]?.(c.id)
    if (route) navigate(route)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto', width: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <div className="smcap" style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>Analysis</div>
          <h1 className="sec-h" style={{ margin: 0 }}>Ask Seraph</h1>
          <p style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 4 }}>
            Ask questions about this engagement. Answers are grounded in your findings, loot, scans, and credentials — with citations.
          </p>
        </div>

        {/* Model selector — defaults to the Settings → AI model */}
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div className="smcap" style={{ fontSize: 9, color: 'var(--fg-3)', marginBottom: 4 }}>Model</div>
          {models.length > 0 ? (
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              style={{
                background: 'var(--bg)', border: '1px solid var(--rule)', color: 'var(--fg)',
                fontFamily: 'var(--font-mono)', fontSize: 11, padding: '5px 8px', borderRadius: 3, maxWidth: 220,
              }}
            >
              {models.map(m => (
                <option key={m} value={m}>{m}{m === defaultModel ? '  (default)' : ''}</option>
              ))}
            </select>
          ) : (
            <span className="mono" style={{ fontSize: 11, color: model ? 'var(--fg-2)' : 'var(--crit)' }}>
              {model || 'none — set one in Settings → AI'}
            </span>
          )}
          <div className="mono" style={{ fontSize: 9, color: 'var(--fg-4)', marginTop: 3 }}>via Ollama</div>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--rule)', marginBottom: 20 }} />

      {!selectedProject ? (
        <EmptyState icon="cube" title="No project selected" hint="Pick an engagement to ask questions about its data." />
      ) : (
        <>
          {/* Ask box */}
          <form onSubmit={e => { e.preventDefault(); ask(question) }} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="e.g. What are the critical findings?"
              style={{
                flex: 1, background: 'var(--bg)', border: '1px solid var(--rule)',
                color: 'var(--fg)', fontFamily: 'var(--font-sans)', fontSize: 13,
                padding: '9px 12px', borderRadius: 3,
              }}
            />
            <button type="submit" className="btn btn-primary" disabled={loading || !question.trim()} style={{ height: 36, padding: '0 16px', fontSize: 12 }}>
              <Icon name={loading ? 'refresh' : 'send'} size={12} style={{ marginRight: 6 }} />
              {loading ? 'Thinking…' : 'Ask'}
            </button>
          </form>

          {/* Suggestions (only before first question) */}
          {history.length === 0 && !loading && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => ask(s)} className="btn btn-sm" style={{ fontSize: 11 }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {error && <div style={{ fontSize: 12, color: 'var(--crit)', marginBottom: 16 }}>{error}</div>}

          {/* Answers */}
          {history.map((item, i) => (
            <div key={i} style={{ marginBottom: 18, border: '1px solid var(--rule)', borderRadius: 3 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--rule)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="help" size={13} color="var(--accent)" />
                <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 600, flex: 1 }}>{item.question}</span>
                {item.model && (
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-4)', flexShrink: 0 }} title="Model that produced this answer">
                    {item.model}
                  </span>
                )}
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div className="qa-markdown" style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.answer}</ReactMarkdown>
                </div>
                {item.citations.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--rule)' }}>
                    <div className="smcap" style={{ fontSize: 9, color: 'var(--fg-3)', marginBottom: 6 }}>Sources</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {item.citations.map(c => (
                        <button
                          key={c.n}
                          onClick={() => goToCitation(c)}
                          title={`${c.type}: ${c.title}`}
                          className="mono"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                            fontSize: 10.5, color: 'var(--fg-2)', background: 'var(--bg)',
                            border: '1px solid var(--rule)', padding: '2px 8px', borderRadius: 10,
                          }}
                        >
                          <span style={{ color: 'var(--accent)' }}>[{c.n}]</span>
                          <span style={{ color: 'var(--fg-4)' }}>{c.type}</span>
                          <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
