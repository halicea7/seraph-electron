import { useState, useEffect } from 'react'
import { Brain, BookmarkCheck } from 'lucide-react'
import Icon from '../components/Icon'
import ReactMarkdown from 'react-markdown'
import type { Finding } from '../types'
import { getFindings, generateReport, getStats, type PlatformStats } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '@/stores/appStore'
import { useAINarrative } from '../contexts/AINarrativeContext'
import { getApiBase } from '@/lib/config'

// ── Constants ─────────────────────────────────────────────────────────────────

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--crit)',
  high:     'var(--high)',
  medium:   'var(--med)',
  low:      'var(--low)',
}

const AI_STEPS = [
  'loading findings (47) · scans (124) · sessions (3) · creds (7) ...',
  'tokenizing context window (4,820 tok) ...',
  'streaming narrative · model: llama3:8b ...',
  'drafting executive summary ...',
  'drafting technical findings ...',
  'cross-linking remediation ...',
  'rendering jinja template: pentest-en-formal.j2 ...',
  'attaching evidence (screenshots: 14, terminal captures: 31) ...',
  'pdf via weasyprint ...',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rule" style={{ background: 'var(--bg)' }}>
      <div className="sec-h">
        <span className="title">{title}</span>
        {right && <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{right}</span>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

function SegBtns({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', border: rule, height: 26 }}>
      {options.map((o, i) => (
        <button key={o} onClick={() => onChange(o)} style={{
          background: value === o ? 'var(--accent-2)' : 'transparent',
          color: value === o ? 'var(--accent)' : 'var(--fg-3)',
          border: 'none', borderLeft: i > 0 ? rule : 'none',
          padding: '0 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
          cursor: 'pointer', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
        }}>{o}</button>
      ))}
    </div>
  )
}

function Pill({ tone, children }: { tone: 'pass' | 'fail' | 'warn' | 'info'; children: React.ReactNode }) {
  const map = {
    pass: { color: 'var(--ok)',   bg: 'rgba(107,138,114,0.1)' },
    fail: { color: 'var(--crit)', bg: 'rgba(232,92,78,0.1)' },
    warn: { color: 'var(--high)', bg: 'rgba(240,168,58,0.1)' },
    info: { color: 'var(--fg-2)', bg: 'var(--bg-2)' },
  }
  const s = map[tone]
  return (
    <span className="mono" style={{
      fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em',
      padding: '1px 6px', color: s.color, background: s.bg, border: `1px solid ${s.color}33`,
    }}>{children}</span>
  )
}

function KV({ items }: { items: { k: string; v: string }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--rule)', padding: '4px 0', alignItems: 'baseline' }}>
          <span className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-3)' }}>{it.k}</span>
          <span className="mono tnum" style={{ fontSize: 12, color: 'var(--fg)', textAlign: 'right', marginLeft: 12 }}>{it.v}</span>
        </div>
      ))}
    </div>
  )
}

function PageHeader({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div style={{
      borderBottom: '1px solid var(--rule)', padding: '18px var(--pad)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexShrink: 0,
    }}>
      <div>
        <h1 className="mono" style={{ margin: 0, fontWeight: 500, fontSize: 22, letterSpacing: '-0.01em' }}>{title}</h1>
        <div style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 6 }}>{sub}</div>
      </div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{right}</div>}
    </div>
  )
}

// ── Preview sub-components ────────────────────────────────────────────────────

function ExecReport({ auditor, findings }: { auditor: string; findings: Finding[] }) {
  const counts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high:     findings.filter(f => f.severity === 'high').length,
    medium:   findings.filter(f => f.severity === 'medium').length,
    low:      findings.filter(f => f.severity === 'low').length,
  }
  return (
    <div style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg)' }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: '0.22em', color: 'var(--fg-3)', textTransform: 'uppercase' }}>
        EXECUTIVE SUMMARY · CONFIDENTIAL
      </div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 36, letterSpacing: '-0.01em', lineHeight: 1.15, margin: '12px 0 6px' }}>
        External Pentest Assessment
      </h1>
      <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: 16, color: 'var(--fg-3)', margin: '0 0 32px' }}>
        Northwind Logistics · 2026-04-22 to 2026-05-22
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, border: '1px solid var(--rule)', marginBottom: 28 }}>
        {([
          { k: 'critical', v: counts.critical, c: 'var(--crit)' },
          { k: 'high',     v: counts.high,     c: 'var(--high)' },
          { k: 'medium',   v: counts.medium,   c: 'var(--med)' },
          { k: 'low',      v: counts.low,       c: 'var(--low)' },
        ] as const).map((d, i) => (
          <div key={d.k} style={{ padding: 14, borderLeft: i > 0 ? '1px solid var(--rule)' : 'none' }}>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>{d.k}</div>
            <div className="mono tnum" style={{ fontSize: 30, color: d.c, fontWeight: 500, marginTop: 4 }}>{d.v}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 15, lineHeight: 1.7, marginTop: 0 }}>
        Over a 30-day window we assessed Northwind Logistics' external attack surface, comprising 142 hosts across two datacenter ranges and a small SaaS perimeter. The engagement progressed through reconnaissance, scanning, exploitation, and post-exploitation phases under a non-destructive rules of engagement.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.7 }}>
        We obtained <strong>initial access</strong> within 6 hours via a path-traversal-to-RCE chain on the Mira commerce portal (<span className="mono" style={{ fontSize: 12 }}>CVE-2023-50164</span>). From there, harvested service-account material enabled lateral movement into the internal corporate domain, culminating in recovery of a Domain Admin equivalent within 36 hours. <strong>The blast radius is total</strong>.
      </p>

      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginTop: 32 }}>
        Top-line recommendations
      </h3>
      <ol style={{ fontSize: 14.5, lineHeight: 1.65, paddingLeft: 18 }}>
        <li>Patch the Apache Struts and PuTTY components flagged in Appendix A within 72 hours.</li>
        <li>Enforce SMB signing across the corp.argent.local domain. This single change closes three lateral-movement paths observed in this engagement.</li>
        <li>Rotate service account credentials and remove plaintext passwords from SYSVOL group policy preferences.</li>
        <li>Adopt a tiered administration model — currently a single account class has unrestricted access from workstation to domain controller.</li>
      </ol>

      <div style={{ marginTop: 40, paddingTop: 18, borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>auditor</div>
          <div className="mono" style={{ fontSize: 13, marginTop: 4 }}>{auditor || 'Margot Chen'}</div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>page</div>
          <div className="mono" style={{ fontSize: 13, marginTop: 4 }}>1 / 28</div>
        </div>
      </div>
    </div>
  )
}

function TechReport() {
  return (
    <div style={{ fontFamily: 'var(--font-serif)', color: 'var(--fg)' }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: '0.22em', color: 'var(--fg-3)', textTransform: 'uppercase' }}>
        TECHNICAL FINDINGS · 47 ITEMS
      </div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 30, margin: '12px 0 24px' }}>
        Finding 01 / 47
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <KV items={[
          { k: 'identifier', v: 'CVE-2024-31497' },
          { k: 'severity',   v: 'Critical' },
          { k: 'cvss 3.1',   v: '9.4' },
          { k: 'host',       v: 'DC01.corp.argent.local' },
        ]} />
        <KV items={[
          { k: 'service',     v: 'ssh / 22' },
          { k: 'found',       v: '2026-05-15 14:32' },
          { k: 'exploitable', v: 'yes — public PoC' },
          { k: 'owner',       v: 'M. Chen' },
        ]} />
      </div>

      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginTop: 0 }}>
        Summary
      </h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.7 }}>
        The deployed PuTTY release is affected by a private-key recovery flaw in its ECDSA-P521 nonce generation. An attacker that observes approximately 60 signed messages can recover the private key, after which they may impersonate the user against any service that trusts the key.
      </p>

      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>
        Reproduction
      </h3>
      <div className="term rule" style={{ padding: 12, fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
        <div><span className="pr">$</span> nuclei -u ssh://DC01.corp.argent.local:22 -id CVE-2024-31497</div>
        <div className="ok">[CVE-2024-31497] [tcp] [critical] DC01.corp.argent.local:22 — confirmed</div>
      </div>

      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>
        Remediation
      </h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.7 }}>
        Upgrade PuTTY and its derivatives (FileZilla, WinSCP) to versions released after 2024-04-15. Rotate any P-521 ECDSA keys that may have been used with vulnerable clients; the safest assumption is that all such keys are compromised.
      </p>
    </div>
  )
}

function FindingsMatrix({ findings }: { findings: Finding[] }) {
  return (
    <table className="data" style={{ background: 'var(--bg)', width: '100%' }}>
      <thead>
        <tr>
          <th>ID</th>
          <th>Sev</th>
          <th>CVSS</th>
          <th>Title</th>
          <th>CVE</th>
          <th>State</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f) => (
          <tr key={f.id} className="zebra">
            <td className="mono" style={{ color: 'var(--fg-3)', fontSize: 10 }}>{f.id.slice(0, 8)}</td>
            <td>
              <span style={{
                display: 'inline-block', width: 8, height: 8,
                background: SEV_COLOR[f.severity] ?? 'var(--fg-4)',
              }} />
            </td>
            <td className="mono tnum">{f.cvss_score ?? '—'}</td>
            <td style={{ fontSize: 12 }}>{f.title}</td>
            <td className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>{f.cve_id ?? '—'}</td>
            <td>
              <Pill tone={f.status === 'remediated' ? 'pass' : f.status === 'open' ? 'fail' : 'warn'}>
                {f.status ?? 'open'}
              </Pill>
            </td>
          </tr>
        ))}
        {findings.length === 0 && (
          <tr>
            <td colSpan={6} style={{ textAlign: 'center', color: 'var(--fg-3)', padding: 24, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              no findings loaded
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

function EvidencePreview() {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26, margin: '0 0 6px' }}>Evidence pack</h1>
      <p className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>14 screenshots · 31 terminal captures · 6 loot artifacts</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rule" style={{ padding: 8 }}>
            <div className="hatch" style={{ aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                screenshot · 00{i + 1}
              </span>
            </div>
            <div className="mono" style={{ fontSize: 10.5, marginTop: 6 }}>capture-{String(i + 1).padStart(3, '0')}.png</div>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--fg-3)', marginTop: 2 }}>14:{20 + i} · session {i % 3 + 1}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── AI Generate state ─────────────────────────────────────────────────────────

interface GenState {
  running: boolean
  done: boolean
  p: number
  lines: string[]
}

// ── Main component ────────────────────────────────────────────────────────────

type PreviewTab = 'exec' | 'tech' | 'findings' | 'evid'
type Template = 'executive_summary' | 'technical_detail' | 'compliance_mapped'
type NarrativeStyle = 'executive' | 'technical'
type Audience = 'Exec' | 'Tech' | 'Both'
type Branding = 'Seraph' | 'Plain' | 'Custom'

export default function Reports() {
  const { user } = useAuth()
  const { generating: generatingNarrative, progress: narrativeProgress, generate } = useAINarrative()
  const { selectedProject: sp, projects } = useAppStore()
  const projectId = sp?.id ?? ''

  // Config sidebar state
  const [template, setTemplate] = useState<Template>('technical_detail')
  const [auditor, setAuditor] = useState<string>(user?.full_name || user?.username || 'Margot Chen')
  const [audience, setAudience] = useState<Audience>('Both')
  const [branding, setBranding] = useState<Branding>('Custom')
  const [includes, setIncludes] = useState<Record<string, boolean>>({
    'Executive summary': true,
    'Finding details': true,
    'Evidence (screenshots)': true,
    'Terminal captures': true,
    'Attack narrative': true,
    'Remediation': true,
    'CVSS matrix': true,
    'Appendix · scope': true,
  })

  // AI narrative sidebar state
  const [narrativeStyle, setNarrativeStyle] = useState<NarrativeStyle>('executive')
  const [narrative, setNarrative] = useState<string>('')
  const [narrativeSavedAt, setNarrativeSavedAt] = useState<string>('')
  const [narrativeError, setNarrativeError] = useState<string>('')
  const [localGen, setLocalGen] = useState<GenState>({ running: false, done: false, p: 0, lines: [] })

  // Data
  const [findings, setFindings] = useState<Finding[]>([])
  const [_stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Preview tab
  const [previewTab, setPreviewTab] = useState<PreviewTab>('exec')

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadStats()
  }, [])

  useEffect(() => {
    if (user && !auditor) setAuditor(user.full_name || user.username)
  }, [user])

  useEffect(() => {
    if (projectId) {
      loadFindings(projectId)
      loadSavedNarrative(projectId, narrativeStyle)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) loadSavedNarrative(projectId, narrativeStyle)
  }, [narrativeStyle])

  // ── Loaders ──────────────────────────────────────────────────────────────────

  async function loadStats() {
    try { setStats(await getStats()) } catch { /* ignore */ }
  }

  async function loadSavedNarrative(pid: string, style: string) {
    try {
      const res = await fetch(`${getApiBase()}/ai/narrate/${pid}`)
      if (!res.ok) return
      const data = await res.json()
      const saved = data[style]
      if (saved) { setNarrative(saved.content); setNarrativeSavedAt(saved.generated_at) }
      else { setNarrative(''); setNarrativeSavedAt('') }
    } catch { /* ignore */ }
  }

  async function loadFindings(pid: string) {
    setLoading(true)
    try { setFindings(await getFindings(pid)) } catch { setFindings([]) } finally { setLoading(false) }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleLocalGenerate() {
    if (localGen.running) return
    setLocalGen({ running: true, done: false, p: 0, lines: [] })
    let i = 0
    const tick = () => {
      i++
      setLocalGen(g => ({
        ...g,
        p: Math.min(100, Math.round((i / AI_STEPS.length) * 100)),
        lines: [...g.lines, AI_STEPS[i - 1]],
      }))
      if (i < AI_STEPS.length) setTimeout(tick, 460 + Math.random() * 360)
      else setLocalGen(g => ({ ...g, running: false, done: true }))
    }
    setTimeout(tick, 250)
  }

  async function handleGenerateNarrative() {
    if (!projectId) return
    setNarrativeError('')
    try {
      const result = await generate(projectId, narrativeStyle)
      if (result) { setNarrative(result.narrative); setNarrativeSavedAt(result.savedAt) }
    } catch (err: any) { setNarrativeError(err.message || 'Unknown error') }
  }

  async function handleExportPDF() {
    if (!projectId) return
    setGenerating(true)
    try {
      const res = await fetch(`${getApiBase()}/audit/reports/pdf/${projectId}`)
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.detail || `HTTP ${res.status}`) }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `seraph_report_${projectId.slice(0, 8)}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) { alert(`PDF export failed: ${err.message}`) } finally { setGenerating(false) }
  }

  async function handleGenerateReport(format: 'html' | 'markdown') {
    if (!projectId) return
    setGenerating(true)
    try {
      const isHtmlNative = template === 'executive_summary' || template === 'technical_detail' || template === 'compliance_mapped'
      let blob: Blob
      if (isHtmlNative && format === 'html') {
        const res = await fetch(`${getApiBase()}/audit/reports/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: projectId, report_type: template, auditor: auditor || 'Seraph (Automated)' }),
        })
        const data = await res.json()
        blob = new Blob([data.html || ''], { type: 'text/html' })
      } else {
        const params = new URLSearchParams({ format, auditor: auditor || 'Seraph (Automated)' })
        blob = await (await fetch(`${getApiBase()}/audit/reports/download/${projectId}?${params}`)).blob()
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `seraph_${template}_${projectId.slice(0, 8)}.${format === 'markdown' ? 'md' : 'html'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ } finally { setGenerating(false) }
  }

  async function handlePreviewReport() {
    if (!projectId) return
    setGenerating(true)
    try {
      await generateReport(projectId, template, auditor || 'Seraph (Automated)')
    } catch { /* ignore */ } finally { setGenerating(false) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const selectedProj = projects.find(p => p.id === projectId)
  const hasNewFindings = !!(selectedProj?.latest_finding_at && (!narrativeSavedAt || new Date(selectedProj.latest_finding_at) > new Date(narrativeSavedAt)))
  const displayFindings = template === 'executive_summary'
    ? findings.filter(f => f.severity === 'critical' || f.severity === 'high')
    : findings

  const PREVIEW_TABS = [
    { id: 'exec' as PreviewTab, label: 'Executive' },
    { id: 'tech' as PreviewTab, label: `Technical · ${displayFindings.length}` },
    { id: 'findings' as PreviewTab, label: 'Findings matrix' },
    { id: 'evid' as PreviewTab, label: 'Evidence' },
  ]

  const selStyle: React.CSSProperties = {
    background: 'var(--bg-2)', border: ruleStrong, borderRadius: 3,
    padding: '5px 10px', fontSize: 12, color: 'var(--fg)',
    fontFamily: 'var(--font-mono)', outline: 'none', width: '100%',
    boxSizing: 'border-box',
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-2)', border: ruleStrong, borderRadius: 3,
    padding: '5px 10px', fontSize: 12, color: 'var(--fg)',
    fontFamily: 'var(--font-sans)', outline: 'none', width: '100%',
    boxSizing: 'border-box',
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', color: 'var(--fg)' }}>

      {/* AI Narrative global progress (from context) */}
      {narrativeProgress !== null && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 50, width: 280,
          borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.3)',
          background: 'rgba(10,5,20,0.92)', boxShadow: '0 0 24px rgba(168,85,247,0.25)',
        }}>
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

      {/* Page header */}
      <PageHeader
        title="Reports"
        sub="Render HTML / Markdown / PDF deliverables. AI narrative compiled locally via Ollama."
        right={
          <>
            <button
              className="btn"
              onClick={() => handleGenerateReport('html')}
              disabled={generating || !projectId}
            >
              <Icon name="download" size={11} /> HTML
            </button>
            <button
              className="btn"
              onClick={() => handleGenerateReport('markdown')}
              disabled={generating || !projectId}
            >
              <Icon name="download" size={11} /> Markdown
            </button>
            <button
              className="btn btn-primary"
              onClick={handleExportPDF}
              disabled={generating || !projectId}
            >
              <Icon name="download" size={11} color="#1a1408" /> Render PDF
            </button>
          </>
        }
      />

      {/* 2-pane layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── Left pane: config sidebar ── */}
        <div style={{ borderRight: '1px solid var(--rule)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          <Section title="REPORT CONFIG">
            <div style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Template">
                <select
                  value={template}
                  onChange={e => setTemplate(e.target.value as Template)}
                  style={selStyle}
                >
                  <option value="executive_summary">Pentest · Formal</option>
                  <option value="technical_detail">Pentest · Concise</option>
                  <option value="compliance_mapped">Compliance · CIS</option>
                  <option value="technical_detail">Internal handoff</option>
                </select>
              </Field>

              <Field label="Auditor">
                <input
                  type="text"
                  value={auditor}
                  onChange={e => setAuditor(e.target.value)}
                  placeholder="Margot Chen"
                  style={inputStyle}
                />
              </Field>

              <Field label="Audience">
                <SegBtns options={['Exec', 'Tech', 'Both']} value={audience} onChange={v => setAudience(v as Audience)} />
              </Field>

              <Field label="Include">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {Object.keys(includes).map(s => (
                    <label key={s} style={{ display: 'flex', gap: 8, textTransform: 'none', fontSize: 11.5, letterSpacing: 0, color: 'var(--fg-2)', fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={includes[s]}
                        onChange={e => setIncludes(prev => ({ ...prev, [s]: e.target.checked }))}
                        style={{ width: 12, height: 12, accentColor: 'var(--accent)', flexShrink: 0, marginTop: 1 }}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Branding">
                <SegBtns options={['Seraph', 'Plain', 'Custom']} value={branding} onChange={v => setBranding(v as Branding)} />
              </Field>
            </div>
          </Section>

          <Section title="AI NARRATIVE · LOCAL">
            <div style={{ padding: 'var(--pad)' }}>
              {/* Model + status row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span className="mono" style={{ fontSize: 11 }}>llama3:8b · q4_0</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ok)' }}>● ollama 11434</span>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <div className="rule" style={{ padding: 8, textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: 18, color: 'var(--accent)' }}>4.8s</div>
                  <div className="smcap" style={{ marginTop: 4, fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>avg ttft</div>
                </div>
                <div className="rule" style={{ padding: 8, textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: 18, color: 'var(--accent)' }}>62 tps</div>
                  <div className="smcap" style={{ marginTop: 4, fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>throughput</div>
                </div>
              </div>

              {/* Narrative style selector */}
              <div style={{ marginBottom: 10 }}>
                <SegBtns
                  options={['executive', 'technical']}
                  value={narrativeStyle}
                  onChange={v => setNarrativeStyle(v as NarrativeStyle)}
                />
              </div>

              {/* Generate button (idle) */}
              {!localGen.running && !localGen.done && (
                <button
                  onClick={handleLocalGenerate}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Icon name="bolt" size={11} color="#1a1408" /> Generate narrative
                </button>
              )}

              {/* Also trigger real AI generate when project loaded */}
              {!localGen.running && !localGen.done && projectId && (
                <button
                  onClick={handleGenerateNarrative}
                  disabled={generatingNarrative || !projectId}
                  title={hasNewFindings ? 'New findings since last narrative — regenerate' : 'Generate AI narrative using local LLM'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, width: '100%', marginTop: 6,
                    padding: '5px 10px', background: 'none', border: ruleStrong,
                    fontSize: 11, color: '#a855f7', cursor: generatingNarrative || !projectId ? 'not-allowed' : 'pointer',
                    opacity: generatingNarrative || !projectId ? 0.5 : 1, fontFamily: 'var(--font-mono)',
                    justifyContent: 'center', position: 'relative',
                  }}
                >
                  <Brain size={11} />
                  {hasNewFindings ? 'Regenerate (new findings)' : 'Generate via context'}
                  {hasNewFindings && !generatingNarrative && (
                    <span style={{ position: 'absolute', top: 2, right: 6, width: 6, height: 6, borderRadius: '50%', background: 'var(--crit)', boxShadow: '0 0 6px rgba(232,64,64,0.8)' }} />
                  )}
                </button>
              )}

              {/* Progress + streaming log */}
              {(localGen.running || localGen.done) && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                      {localGen.done ? 'complete' : 'streaming'}
                    </span>
                    <span className="mono tnum" style={{ fontSize: 10, color: localGen.done ? 'var(--ok)' : 'var(--accent)' }}>
                      {localGen.p}%
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'var(--rule-2)' }}>
                    <div style={{
                      width: `${localGen.p}%`, height: '100%',
                      background: localGen.done ? 'var(--ok)' : 'var(--accent)',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <div className="term rule" style={{ marginTop: 10, padding: 10, fontSize: 10.5, maxHeight: 160, overflowY: 'auto', background: 'var(--bg-term)' }}>
                    {localGen.lines.map((l, i) => (
                      <div key={i} className={i === localGen.lines.length - 1 && localGen.running ? 'stdout' : 'muted'}>→ {l}</div>
                    ))}
                    {localGen.running && (
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="muted">awaiting</span>
                        <span className="cursor" />
                      </div>
                    )}
                  </div>

                  {/* Saved narrative display */}
                  {narrativeError && (
                    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--crit)', fontFamily: 'var(--font-sans)' }}>
                      {narrativeError}
                    </div>
                  )}
                  {narrative && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a855f7' }}>
                          <Brain size={11} />
                          <span className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{narrativeStyle}</span>
                          {narrativeSavedAt && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--ok)' }}>
                              <BookmarkCheck size={9} /> {new Date(narrativeSavedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(narrative)}
                          style={{ fontSize: 10, color: 'var(--fg-3)', background: 'none', border: ruleStrong, padding: '2px 7px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                        >
                          Copy
                        </button>
                      </div>
                      <div style={{ borderLeft: '2px solid rgba(168,85,247,0.4)', paddingLeft: 10, fontSize: 11, lineHeight: 1.6, color: 'var(--fg-2)' }}>
                        <ReactMarkdown>{narrative}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Loading indicator */}
              {loading && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                  loading findings…
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* ── Right pane: preview ── */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
            {PREVIEW_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setPreviewTab(t.id)}
                className="mono"
                style={{
                  background: 'transparent', border: 'none',
                  color: previewTab === t.id ? 'var(--fg)' : 'var(--fg-3)',
                  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em',
                  padding: '10px 14px', cursor: 'pointer',
                  borderBottom: previewTab === t.id ? '1px solid var(--accent)' : '1px solid transparent',
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Preview content */}
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-2)' }}>
            <div style={{
              maxWidth: 760, margin: '0 auto', padding: '48px 64px',
              background: 'var(--bg)', boxShadow: '0 0 0 1px var(--rule)',
              borderLeft: '1px solid var(--rule)', borderRight: '1px solid var(--rule)',
              minHeight: '100%',
            }}>
              {previewTab === 'exec' && <ExecReport auditor={auditor} findings={findings} />}
              {previewTab === 'tech' && <TechReport />}
              {previewTab === 'findings' && <FindingsMatrix findings={displayFindings} />}
              {previewTab === 'evid' && <EvidencePreview />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
