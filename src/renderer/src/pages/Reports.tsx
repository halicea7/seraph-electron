import { useState, useEffect } from 'react'
import { Brain, Loader, BookmarkCheck } from 'lucide-react'
import Icon from '../components/Icon'
import ReactMarkdown from 'react-markdown'
import FindingsTable from '../components/FindingsTable'
import type { Project, Finding } from '../types'
import { getProjects, getFindings, generateReport, getStats, type PlatformStats } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useAINarrative } from '../contexts/AINarrativeContext'
import { getApiBase } from '@/lib/config'

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'var(--crit)',
  high:     '#f97316',
  medium:   'var(--accent)',
  low:      'var(--ok)',
  info:     '#60a5fa',
}

const SEVERITY_BORDER_TOP: Record<string, string> = {
  critical: 'rgba(232,64,64,0.6)',
  high:     'rgba(249,115,22,0.6)',
  medium:   'rgba(240,168,58,0.6)',
  low:      'rgba(84,175,97,0.6)',
  info:     'rgba(96,165,250,0.6)',
}

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

export default function Reports() {
  const { user } = useAuth()
  const { generating: generatingNarrative, progress: narrativeProgress, generate } = useAINarrative()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [findings, setFindings] = useState<Finding[]>([])
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'findings' | 'report' | 'narrative'>('findings')
  const [reportPreview, setReportPreview] = useState<string>('')
  const [narrative, setNarrative] = useState<string>('')
  const [narrativeSavedAt, setNarrativeSavedAt] = useState<string>('')
  const [narrativeStyle, setNarrativeStyle] = useState<'executive' | 'technical'>('executive')
  const [template, setTemplate] = useState<'executive_summary' | 'technical_detail' | 'compliance_mapped'>('technical_detail')
  const [narrativeError, setNarrativeError] = useState<string>('')
  const [auditor, setAuditor] = useState<string>(user?.full_name || user?.username || '')

  useEffect(() => {
    loadProjects()
    loadStats()
  }, [])

  useEffect(() => {
    if (user && !auditor) setAuditor(user.full_name || user.username)
  }, [user])

  useEffect(() => {
    if (selectedProject) {
      loadFindings(selectedProject)
      loadSavedNarrative(selectedProject, narrativeStyle)
    }
  }, [selectedProject])

  useEffect(() => {
    if (selectedProject) loadSavedNarrative(selectedProject, narrativeStyle)
  }, [narrativeStyle])

  async function loadProjects() {
    try {
      const data = await getProjects()
      setProjects(data)
      if (data.length > 0) setSelectedProject(data[0].id)
    } catch { /* backend may not be running */ }
  }

  async function loadStats() {
    try { setStats(await getStats()) } catch { /* ignore */ }
  }

  async function loadSavedNarrative(projectId: string, style: string) {
    try {
      const res = await fetch(`${getApiBase()}/ai/narrate/${projectId}`)
      if (!res.ok) return
      const data = await res.json()
      const saved = data[style]
      if (saved) { setNarrative(saved.content); setNarrativeSavedAt(saved.generated_at) }
      else { setNarrative(''); setNarrativeSavedAt('') }
    } catch { /* ignore */ }
  }

  async function loadFindings(_projectId: string) {
    setLoading(true)
    try { setFindings(await getFindings()) } catch { setFindings([]) } finally { setLoading(false) }
  }

  async function handleGenerateNarrative() {
    if (!selectedProject) return
    setNarrativeError('')
    try {
      const result = await generate(selectedProject, narrativeStyle)
      if (result) { setNarrative(result.narrative); setNarrativeSavedAt(result.savedAt); setActiveTab('narrative') }
    } catch (err: any) { setNarrativeError(err.message || 'Unknown error') }
  }

  async function handleExportPDF() {
    if (!selectedProject) return
    setGenerating(true)
    try {
      const res = await fetch(`${getApiBase()}/audit/reports/pdf/${selectedProject}`)
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.detail || `HTTP ${res.status}`) }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `seraph_report_${selectedProject.slice(0, 8)}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) { alert(`PDF export failed: ${err.message}`) } finally { setGenerating(false) }
  }

  async function handleGenerateReport(format: 'html' | 'markdown') {
    if (!selectedProject) return
    setGenerating(true)
    try {
      const isHtmlNative = template === 'executive_summary' || template === 'technical_detail' || template === 'compliance_mapped'
      let blob: Blob
      if (isHtmlNative && format === 'html') {
        const res = await fetch(`${getApiBase()}/audit/reports/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: selectedProject, report_type: template, auditor: auditor || 'Seraph (Automated)' }) })
        const data = await res.json()
        blob = new Blob([data.html || ''], { type: 'text/html' })
      } else {
        const params = new URLSearchParams({ format, auditor: auditor || 'Seraph (Automated)' })
        blob = await (await fetch(`${getApiBase()}/audit/reports/download/${selectedProject}?${params}`)).blob()
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `seraph_${template}_${selectedProject.slice(0, 8)}.${format === 'markdown' ? 'md' : 'html'}`; a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ } finally { setGenerating(false) }
  }

  async function handlePreviewReport() {
    if (!selectedProject) return
    setGenerating(true)
    try {
      const data = await generateReport(selectedProject, template, auditor || 'Seraph (Automated)')
      setReportPreview(data.html || data.markdown || '')
      setActiveTab('report')
    } catch { /* ignore */ } finally { setGenerating(false) }
  }

  const severityCounts = stats?.severity_counts || {}
  const displayFindings = template === 'executive_summary' ? findings.filter(f => f.severity === 'critical' || f.severity === 'high') : findings
  const selectedProj = projects.find(p => p.id === selectedProject)
  const hasNewFindings = !!(selectedProj?.latest_finding_at && (!narrativeSavedAt || new Date(selectedProj.latest_finding_at) > new Date(narrativeSavedAt)))

  const selStyle: React.CSSProperties = {
    background: 'var(--bg-2)', border: ruleStrong, borderRadius: 3,
    padding: '5px 10px', fontSize: 12, color: 'var(--fg)',
    fontFamily: 'var(--font-sans)', outline: 'none',
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-2)', border: ruleStrong, borderRadius: 3,
    padding: '5px 10px', fontSize: 12, color: 'var(--fg)',
    fontFamily: 'var(--font-sans)', outline: 'none',
  }

  const TABS = [
    { key: 'findings', label: `Findings (${displayFindings.length}${template === 'executive_summary' ? `/${findings.length}` : ''})` },
    { key: 'report', label: 'Report Preview' },
    { key: 'narrative', label: 'AI Narrative' },
  ] as const

  const TEMPLATES = [
    { key: 'executive_summary', label: 'Executive Summary', color: '#60a5fa', title: 'Risk overview, key findings, no technical detail' },
    { key: 'technical_detail', label: 'Technical Detail', color: '#22d3ee', title: 'All findings with evidence and remediation' },
    { key: 'compliance_mapped', label: 'Compliance Mapped', color: '#a855f7', title: 'Findings organized by NIST/CIS/PCI control' },
  ] as const

  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg)', color: 'var(--fg)' }}>

      {/* AI Narrative progress bar */}
      {narrativeProgress !== null && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50, width: 280, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(10,5,20,0.92)', boxShadow: '0 0 24px rgba(168,85,247,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
            <Brain size={12} style={{ color: '#a855f7', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#c084fc', fontWeight: 500, flex: 1, fontFamily: 'var(--font-sans)' }}>Generating narrative…</span>
            {narrativeProgress >= 0 && (
              <span style={{ fontSize: 10, color: '#a855f7', fontFamily: 'var(--font-mono)' }}>{Math.round(narrativeProgress)}%</span>
            )}
          </div>
          <div style={{ height: 5, width: '100%', background: 'rgba(168,85,247,0.15)' }}>
            {narrativeProgress === -1 ? (
              <div style={{ height: '100%', width: '100%', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', height: '100%', width: '40%', background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.9), transparent)', animation: 'seraph-shimmer 1.4s ease-in-out infinite' }} />
              </div>
            ) : (
              <div style={{ height: '100%', width: `${narrativeProgress}%`, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', transition: 'width 0.2s' }} />
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-sans)' }}>
          <Icon name="file" size={20} color="#60a5fa" /> Reports
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
          Generate and export audit and pentest findings reports
        </p>
      </div>

      {/* Stats Row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {(['critical', 'high', 'medium', 'low', 'info'] as const).map(sev => (
            <div key={sev} style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: '12px 14px', borderTop: `2px solid ${SEVERITY_BORDER_TOP[sev]}` }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: SEVERITY_COLORS[sev] }}>{severityCounts[sev] || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 3, textTransform: 'capitalize', fontFamily: 'var(--font-sans)' }}>{sev}</div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={selStyle}>
          <option value="">Select project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <input type="text" value={auditor} onChange={e => setAuditor(e.target.value)} placeholder="Auditor name" style={{ ...inputStyle, width: 160 }} />

        {/* Template picker */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 4 }}>
          {TEMPLATES.map(t => {
            const isActive = template === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTemplate(t.key)}
                title={t.title}
                style={{ padding: '4px 10px', borderRadius: 3, fontSize: 11, fontWeight: isActive ? 600 : 400, cursor: 'pointer', background: isActive ? `${t.color}22` : 'none', color: isActive ? t.color : 'var(--fg-3)', border: isActive ? `1px solid ${t.color}40` : 'none', fontFamily: 'var(--font-sans)' }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {/* AI Narrative controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: '2px 6px' }}>
            <select value={narrativeStyle} onChange={e => setNarrativeStyle(e.target.value as 'executive' | 'technical')} style={{ background: 'transparent', fontSize: 11, color: 'var(--fg-3)', border: 'none', outline: 'none', padding: '3px 4px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              <option value="executive">Executive</option>
              <option value="technical">Technical</option>
            </select>
            <button
              onClick={handleGenerateNarrative}
              disabled={generatingNarrative || !selectedProject}
              title={hasNewFindings ? 'New findings since last narrative — regenerate' : 'Generate AI narrative using local LLM'}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'none', border: 'none', fontSize: 12, color: '#a855f7', cursor: generatingNarrative || !selectedProject ? 'not-allowed' : 'pointer', opacity: generatingNarrative || !selectedProject ? 0.5 : 1, fontFamily: 'var(--font-sans)' }}
            >
              {generatingNarrative ? <Loader size={12} style={{ display: 'block' }} /> : <Brain size={12} />}
              AI Narrative
              {hasNewFindings && !generatingNarrative && (
                <span style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: 'var(--crit)', boxShadow: '0 0 6px rgba(232,64,64,0.8)' }} />
              )}
            </button>
          </div>

          <button onClick={handlePreviewReport} disabled={generating || !selectedProject} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 4, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: generating || !selectedProject ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: generating || !selectedProject ? 0.5 : 1 }}>
            <Icon name={generating ? 'refresh' : 'file'} size={13} color="currentColor" /> Preview
          </button>
          <button onClick={() => handleGenerateReport('html')} disabled={generating || !selectedProject} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 4, background: '#60a5fa', color: 'var(--bg)', border: 'none', fontSize: 12, fontWeight: 600, cursor: generating || !selectedProject ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: generating || !selectedProject ? 0.5 : 1 }}>
            <Icon name="download" size={13} color="currentColor" /> HTML
          </button>
          <button onClick={() => handleGenerateReport('markdown')} disabled={generating || !selectedProject} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 4, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: generating || !selectedProject ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: generating || !selectedProject ? 0.5 : 1 }}>
            <Icon name="download" size={13} color="currentColor" /> Markdown
          </button>
          <button onClick={handleExportPDF} disabled={generating || !selectedProject} title="Export PDF (requires WeasyPrint)" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 4, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--crit)', cursor: generating || !selectedProject ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: generating || !selectedProject ? 0.5 : 1 }}>
            <Icon name="download" size={13} color="currentColor" /> PDF
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: rule }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key
          const tabColor = tab.key === 'narrative' ? '#a855f7' : 'var(--accent)'
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 12, fontWeight: isActive ? 600 : 400, background: 'none', border: 'none', cursor: 'pointer', color: isActive ? tabColor : 'var(--fg-3)', borderBottom: isActive ? `2px solid ${tabColor}` : '2px solid transparent', fontFamily: 'var(--font-sans)' }}
            >
              {tab.key === 'narrative' && <Brain size={11} />}
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeTab === 'findings' && (
        <div>
          {template === 'executive_summary' && findings.length > 0 && (
            <div style={{ fontSize: 12, color: '#60a5fa', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 3, padding: '8px 12px', marginBottom: 12, fontFamily: 'var(--font-sans)' }}>
              Executive template active — showing {displayFindings.length} of {findings.length} findings (critical & high only)
            </div>
          )}
          <FindingsTable findings={displayFindings} loading={loading} />
        </div>
      )}

      {activeTab === 'report' && (
        <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 20 }}>
          {reportPreview ? (
            <>
              {template === 'executive_summary' && (
                <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 3, background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)' }}>
                  <p style={{ margin: '0 0 5px', fontSize: 10, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)' }}>Executive Summary</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-2)', fontFamily: 'var(--font-sans)' }}>
                    This report highlights <strong style={{ color: 'var(--fg)' }}>{displayFindings.length}</strong> critical and high severity findings
                    out of <strong style={{ color: 'var(--fg)' }}>{findings.length}</strong> total. Immediate remediation is recommended for all items below.
                  </p>
                </div>
              )}
              <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{reportPreview}</pre>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-3)' }}>
              <Icon name="file" size={40} color="var(--rule-strong)" />
              <p style={{ margin: '12px 0 0', fontSize: 13, fontFamily: 'var(--font-sans)' }}>Click "Preview" to generate a report preview</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'narrative' && (
        <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {narrativeError && (
            <div style={{ fontSize: 12, color: 'var(--crit)', background: 'rgba(232,64,64,0.08)', border: '1px solid rgba(232,64,64,0.3)', borderRadius: 3, padding: '8px 12px', fontFamily: 'var(--font-sans)' }}>
              {narrativeError}
              {narrativeError.includes('model configured') && (
                <span style={{ marginLeft: 8, color: 'var(--crit)', textDecoration: 'underline', cursor: 'pointer' }} onClick={() => window.location.hash = '#settings'}>
                  → Go to Settings → AI
                </span>
              )}
            </div>
          )}
          {narrative ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a855f7' }}>
                  <Brain size={15} />
                  <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize', fontFamily: 'var(--font-sans)' }}>{narrativeStyle} Narrative</span>
                  {narrativeSavedAt && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ok)', fontFamily: 'var(--font-sans)' }}>
                      <BookmarkCheck size={10} /> Saved {new Date(narrativeSavedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(narrative)}
                  style={{ fontSize: 11, color: 'var(--fg-3)', background: 'none', border: ruleStrong, borderRadius: 3, padding: '3px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                >
                  Copy
                </button>
              </div>
              <div style={{ borderLeft: '2px solid rgba(168,85,247,0.4)', paddingLeft: 16 }} className="prose prose-invert prose-sm max-w-none prose-headings:text-purple-200 prose-headings:font-semibold prose-p:text-slate-300 prose-p:leading-relaxed prose-strong:text-slate-100 prose-ul:text-slate-300 prose-ol:text-slate-300 prose-li:marker:text-purple-500 prose-code:text-purple-300 prose-code:bg-purple-950/40 prose-code:px-1 prose-code:rounded prose-code:text-xs prose-blockquote:border-purple-600/50 prose-blockquote:text-slate-400 prose-hr:border-purple-900/40">
                <ReactMarkdown>{narrative}</ReactMarkdown>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-3)' }}>
              <Brain size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3, color: '#a855f7' }} />
              <p style={{ margin: '0 0 6px', fontSize: 13, fontFamily: 'var(--font-sans)' }}>Select a project and click "AI Narrative" to generate a narrative using your local LLM.</p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Configure your LLM endpoint in Settings → AI</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
