import type { Finding, TargetSummary } from '@/types'
import { getTemplatesForTools, formatTemplatesForPrompt } from '@/lib/templates'

// ── Mode definitions ──────────────────────────────────────────────────────────

export type OperatorMode = 'attack' | 'audit' | 'recon'

export interface ModeConfig {
  id: OperatorMode
  label: string
  color: string     // hex — used for text and accents
  bg: string        // rgba — card background when active
  border: string    // rgba — card border when active
  desc: string
  defaultTools: string[]
  defaultMsf: string[]
}

export const MODE_CONFIGS: Record<OperatorMode, ModeConfig> = {
  attack: {
    id: 'attack',
    label: 'Attack',
    color: '#f87171',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.35)',
    desc: 'Exploit, escalate, persist',
    defaultTools: ['nmap', 'sqlmap', 'hydra', 'nxc', 'kerbrute', 'searchsploit'],
    defaultMsf: [
      'exploit/windows/smb/ms17_010_eternalblue',
      'exploit/unix/ftp/vsftpd_234_backdoor',
      'exploit/multi/handler',
      'post/multi/recon/local_exploit_suggester',
      'post/windows/gather/hashdump',
    ],
  },
  recon: {
    id: 'recon',
    label: 'Recon',
    color: '#60a5fa',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.35)',
    desc: 'Map the surface, no exploitation',
    defaultTools: ['nmap', 'masscan', 'rustscan', 'gobuster', 'ffuf', 'theHarvester', 'subfinder'],
    defaultMsf: [
      'auxiliary/scanner/portscan/tcp',
      'auxiliary/scanner/http/http_version',
      'auxiliary/scanner/ssh/ssh_version',
      'auxiliary/scanner/ftp/ftp_version',
    ],
  },
  audit: {
    id: 'audit',
    label: 'Audit',
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.08)',
    border: 'rgba(251,191,36,0.35)',
    desc: 'Identify and document, do not exploit',
    defaultTools: ['nmap', 'nikto', 'testssl', 'nuclei', 'enum4linux', 'nxc'],
    defaultMsf: [
      'auxiliary/scanner/smb/smb_ms17_010',
      'auxiliary/scanner/http/http_version',
    ],
  },
}

// ── Tool definitions ──────────────────────────────────────────────────────────

export interface OperatorTool {
  id: string
  label: string
  category: string
  desc: string
  isMsf?: boolean
}

export const PENTEST_TOOLS: OperatorTool[] = [
  { id: 'nmap',         label: 'nmap',         category: 'Network',          desc: 'Port scanner & service detection' },
  { id: 'masscan',      label: 'masscan',      category: 'Network',          desc: 'Fast mass port scanner' },
  { id: 'rustscan',     label: 'rustscan',     category: 'Network',          desc: 'Ultra-fast scanner → nmap' },
  { id: 'nikto',        label: 'nikto',        category: 'Web',              desc: 'Web server misconfiguration scanner' },
  { id: 'gobuster',     label: 'gobuster',     category: 'Web',              desc: 'Directory / subdomain brute-forcer' },
  { id: 'ffuf',         label: 'ffuf',         category: 'Web',              desc: 'Fast web fuzzer' },
  { id: 'feroxbuster',  label: 'feroxbuster',  category: 'Web',              desc: 'Recursive content discovery' },
  { id: 'nuclei',       label: 'nuclei',       category: 'Web',              desc: 'Template-based vuln scanner' },
  { id: 'testssl',      label: 'testssl',      category: 'Web',              desc: 'TLS/SSL configuration tester' },
  { id: 'sqlmap',       label: 'sqlmap',       category: 'Exploitation',     desc: 'SQL injection detection & exploit' },
  { id: 'hydra',        label: 'hydra',        category: 'Exploitation',     desc: 'Online password brute-forcer' },
  { id: 'searchsploit', label: 'searchsploit', category: 'Exploitation',     desc: 'Exploit-DB local search' },
  { id: 'enum4linux',   label: 'enum4linux',   category: 'Active Directory', desc: 'SMB/NetBIOS enumeration' },
  { id: 'nxc',          label: 'nxc',          category: 'Active Directory', desc: 'NetExec (CrackMapExec)' },
  { id: 'kerbrute',     label: 'kerbrute',     category: 'Active Directory', desc: 'Kerberos user enum / spray' },
  { id: 'theHarvester', label: 'theHarvester', category: 'OSINT',            desc: 'Email & subdomain harvester' },
  { id: 'subfinder',    label: 'subfinder',    category: 'OSINT',            desc: 'Passive subdomain discovery' },
]

export const MSF_MODULES: OperatorTool[] = [
  { id: 'auxiliary/scanner/portscan/tcp',            label: 'TCP Port Scan',       category: 'Auxiliary', desc: 'MSF TCP port scanner', isMsf: true },
  { id: 'auxiliary/scanner/smb/smb_ms17_010',       label: 'EternalBlue Check',   category: 'Auxiliary', desc: 'MS17-010 vulnerability check', isMsf: true },
  { id: 'auxiliary/scanner/http/http_version',       label: 'HTTP Version',        category: 'Auxiliary', desc: 'HTTP server version scanner', isMsf: true },
  { id: 'auxiliary/scanner/ssh/ssh_version',         label: 'SSH Version',         category: 'Auxiliary', desc: 'SSH server version detection', isMsf: true },
  { id: 'auxiliary/scanner/ftp/ftp_version',         label: 'FTP Version',         category: 'Auxiliary', desc: 'FTP banner grabber', isMsf: true },
  { id: 'exploit/windows/smb/ms17_010_eternalblue', label: 'EternalBlue',         category: 'Exploit',   desc: 'MS17-010 SMB RCE (Win7/2008)', isMsf: true },
  { id: 'exploit/multi/http/tomcat_mgr_upload',     label: 'Tomcat Mgr Upload',   category: 'Exploit',   desc: 'Tomcat Manager WAR deployment RCE', isMsf: true },
  { id: 'exploit/unix/ftp/vsftpd_234_backdoor',     label: 'vsFTPd Backdoor',     category: 'Exploit',   desc: 'vsFTPd 2.3.4 backdoor shell', isMsf: true },
  { id: 'exploit/multi/handler',                    label: 'Generic Handler',     category: 'Exploit',   desc: 'Catch reverse shells / stagers', isMsf: true },
  { id: 'post/multi/recon/local_exploit_suggester', label: 'Exploit Suggester',   category: 'Post',      desc: 'Local privilege escalation suggestions', isMsf: true },
  { id: 'post/linux/gather/hashdump',               label: 'Linux Hashdump',      category: 'Post',      desc: 'Dump /etc/shadow hashes', isMsf: true },
  { id: 'post/windows/gather/hashdump',             label: 'Windows Hashdump',    category: 'Post',      desc: 'Dump SAM / NTLM hashes', isMsf: true },
  { id: 'post/windows/manage/enable_rdp',           label: 'Enable RDP',          category: 'Post',      desc: 'Enable Remote Desktop on target', isMsf: true },
]

export const PENTEST_CATEGORIES = [...new Set(PENTEST_TOOLS.map(t => t.category))]
export const MSF_CATEGORIES     = [...new Set(MSF_MODULES.map(t => t.category))]

// ── Prior recon record ────────────────────────────────────────────────────────

export interface PentestScanRecord {
  tool_name: string
  command: string
  status: string
  raw_output: string | null
}

/** Extract only the signal lines from scan output so we don't flood the prompt. */
function extractKeyOutput(tool: string, output: string | null): string | null {
  if (!output) return null
  const lines = output.split('\n')

  // For port scanners, pull open port lines
  if (['nmap', 'masscan', 'rustscan'].includes(tool)) {
    const ports = lines
      .filter(l => /\d+\/(tcp|udp)\s+(open|filtered)/.test(l))
      .map(l => l.trim())
      .slice(0, 30)
    return ports.length ? ports.join('\n') : null
  }

  // For directory/subdomain fuzzers, grab found entries
  if (['gobuster', 'ffuf', 'feroxbuster'].includes(tool)) {
    const hits = lines
      .filter(l => /\b(200|301|302|403|401|Found|Status)\b/.test(l))
      .map(l => l.trim())
      .slice(0, 20)
    return hits.length ? hits.join('\n') : output.slice(0, 400)
  }

  // Default: first 400 chars
  return output.slice(0, 400)
}

function buildPriorReconSection(priorScans: PentestScanRecord[]): string {
  if (!priorScans.length) return '  None — this is the first engagement against this target.'

  return priorScans.map(s => {
    const cmd = s.command ? ` → \`${s.command.slice(0, 100)}${s.command.length > 100 ? '…' : ''}\`` : ''
    const key = extractKeyOutput(s.tool_name, s.raw_output)
    const outputLine = key
      ? `\n    Key output:\n${key.split('\n').map(l => `      ${l}`).join('\n')}`
      : ''
    return `  - ${s.tool_name}${cmd}${outputLine}`
  }).join('\n')
}

// ── Mode-specific persona builders ────────────────────────────────────────────

function buildPersona(mode: OperatorMode, hostname: string): string {
  switch (mode) {
    case 'attack':
      return `You are an expert penetration tester conducting an authorized red team engagement against ${hostname}. Your objective is to compromise the target, escalate privileges to the highest level achievable, and map every viable attack path. Be methodical: enumerate services, identify vulnerabilities, exploit them, then move laterally or escalate.`
    case 'recon':
      return `You are a security researcher performing authorized reconnaissance against ${hostname}. Your objective is to fully map the attack surface: open ports, running services, software versions, usernames, subdomains, and potential entry points. DO NOT attempt exploitation, brute-force credentials, or cause any disruption — discovery and enumeration only.`
    case 'audit':
      return `You are a security auditor conducting a compliance-oriented assessment of ${hostname}. Your objective is to identify, verify, and document security vulnerabilities and misconfigurations — without exploiting them. For each finding, note the severity (Critical / High / Medium / Low) and a brief remediation recommendation. Prioritize coverage breadth over exploitation depth.`
  }
}

function buildRules(mode: OperatorMode, hostname: string): string {
  const scopeRule = `1. ONLY target ${hostname}. Never expand scope.`
  const reconRule = `2. PREVIOUS RECONNAISSANCE is authoritative — treat it as ground truth. If a tool already appears there (e.g. nmap, masscan, gobuster), its data is sufficient. Do NOT re-run it with different flags, scripts, or options. Use the existing output and move to the next logical step.`
  const sudoRule = `3. Use sudo ONLY for tools that require raw socket access: nmap, masscan, tcpdump. Every other tool must be run WITHOUT sudo.`
  const scriptRule = `4. When using nmap NSE scripts, only use scripts that are known to exist: pgsql-brute, ftp-anon, ftp-brute, ssh-brute, http-title, http-headers, smb-vuln-ms17-010, smb-enum-shares, smtp-enum-users, ssl-cert. Do NOT invent script names.`
  switch (mode) {
    case 'attack':
      return `${scopeRule}
${reconRule}
${sudoRule}
${scriptRule}
5. Use ONLY tools and modules from the enabled lists above.
6. Use example command templates as a starting point — adapt variables to the actual target.
7. For Metasploit modules, generate a complete msfconsole -q -x "..." one-liner.
8. After each result, identify any new attack path steps worth recording.
9. When you have no more productive actions, return next_action: null.
10. Keep commands targeted — avoid wide spray attacks.`
    case 'recon':
      return `${scopeRule}
${reconRule}
${sudoRule}
${scriptRule}
5. Use ONLY recon/enumeration tools from the enabled lists — no exploitation.
6. DO NOT run password sprays, exploit modules, or any command that modifies the target.
7. Use example command templates as a starting point — adapt variables to the actual target.
8. After each result, note what new attack surface or information you've uncovered.
9. When the target surface is fully mapped, return next_action: null.`
    case 'audit':
      return `${scopeRule}
${reconRule}
${sudoRule}
${scriptRule}
5. Use ONLY non-destructive scanning tools from the enabled lists above.
6. DO NOT exploit vulnerabilities — identify and document them only.
7. Use example command templates as a starting point — adapt variables to the actual target.
8. For each finding, state the risk level: Critical, High, Medium, or Low.
9. When audit coverage is complete, return next_action: null.`
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────

export function buildSystemPrompt(
  mode: OperatorMode,
  target: TargetSummary,
  findings: Finding[],
  enabledTools: string[],
  enabledMsf: string[],
  priorScans: PentestScanRecord[] = []
): string {
  const pentestTemplates = getTemplatesForTools(enabledTools, 3)
  const pentestSection = enabledTools.length
    ? formatTemplatesForPrompt(pentestTemplates)
    : '  (none enabled)'

  const msfList = enabledMsf.length
    ? enabledMsf.map(id => {
        const t = MSF_MODULES.find(x => x.id === id)
        return `  - MSF:${id}${t ? ` — ${t.desc}` : ''}\n    Command pattern: msfconsole -q -x "use ${id}; set RHOSTS ${target.hostname_or_ip}; <set options>; run; exit -y"`
      }).join('\n')
    : '  (none enabled)'

  const findingLines = findings.length
    ? findings.slice(0, 25).map(f =>
        `  - [${f.severity.toUpperCase()}] ${f.title}${f.cve_id ? ` (${f.cve_id})` : ''}`
      ).join('\n')
    : '  None yet.'

  const knownPorts = target.ports
    ? target.ports
    : priorScans.some(s => ['nmap', 'masscan', 'rustscan'].includes(s.tool_name))
      ? 'see PREVIOUS RECONNAISSANCE below'
      : 'unknown'

  return `${buildPersona(mode, target.hostname_or_ip)}

TARGET:
  Host: ${target.hostname_or_ip}
  Type: ${target.target_type.replace(/_/g, ' ')}
  Known ports/services: ${knownPorts}

PREVIOUS RECONNAISSANCE (tools already run against this target — read before acting):
${buildPriorReconSection(priorScans)}

EXISTING FINDINGS (from prior automated scans):
${findingLines}

ENABLED PENTEST TOOLS (with example command templates):
${pentestSection}

ENABLED METASPLOIT MODULES:
${msfList}

RULES — read carefully:
${buildRules(mode, target.hostname_or_ip)}

RESPONSE FORMAT — respond with valid JSON ONLY, no markdown, no explanation outside the JSON:
{
  "analysis": "your analysis of the current situation or previous output",
  "attack_path_note": null | "brief label for an attack path step you've just confirmed",
  "next_action": null | {
    "type": "command",
    "tool": "<EXACT tool id from the enabled lists above — e.g. 'nmap', 'hydra', 'exploit/unix/ftp/vsftpd_234_backdoor'. NEVER use generic labels like 'msf-exploit' or 'metasploit'>",
    "command": "<complete shell command to run>",
    "rationale": "<one sentence: why this step now>"
  }
}`
}

// Preview variant — dynamic data shown as placeholders
export function buildPreviewPrompt(
  mode: OperatorMode,
  target: TargetSummary,
  enabledTools: string[],
  enabledMsf: string[]
): string {
  const base = buildSystemPrompt(mode, target, [], enabledTools, enabledMsf, [])
  return base
    .replace(
      '  None — this is the first engagement against this target.',
      '  (loaded from project database at session start)'
    )
    .replace(
      '  None yet.',
      '  (loaded from project database at session start)'
    )
}

export function buildInitialUserMessage(hasPriorRecon: boolean): string {
  if (hasPriorRecon) {
    return 'Review the PREVIOUS RECONNAISSANCE section carefully. Identify what has already been covered and what gaps remain. Start from where the prior work left off — only propose a scan if it covers something genuinely not yet explored.'
  }
  return 'Begin the engagement. Analyze what you know and propose your first action.'
}

export function buildOutputUserMessage(command: string, output: string): string {
  const trimmed = output.length > 8000 ? output.slice(0, 8000) + '\n... [truncated]' : output
  return `Command completed: ${command}\n\nOutput:\n\`\`\`\n${trimmed}\n\`\`\`\n\nAnalyze this output and propose your next action. If there are no more useful actions, set next_action to null.`
}

export function buildSkipUserMessage(): string {
  return 'Step skipped by operator. Based on what you know so far, what is your next action? If there are no more useful actions, set next_action to null.'
}

// ── Response parser ───────────────────────────────────────────────────────────

export interface OperatorResponse {
  analysis: string
  attack_path_note: string | null
  next_action: {
    type: 'command'
    tool: string
    command: string
    rationale: string
  } | null
}

function extractJSON(text: string): string | null {
  try { JSON.parse(text); return text } catch { /* continue */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) { try { JSON.parse(fence[1]); return fence[1] } catch { /* continue */ } }
  const brace = text.match(/\{[\s\S]*\}/)
  if (brace) { try { JSON.parse(brace[0]); return brace[0] } catch { /* continue */ } }
  return null
}

export function parseOperatorResponse(text: string): OperatorResponse | null {
  const json = extractJSON(text)
  if (!json) return null
  try {
    const obj = JSON.parse(json)
    return {
      analysis: String(obj.analysis || ''),
      attack_path_note: obj.attack_path_note ? String(obj.attack_path_note) : null,
      next_action: obj.next_action ? {
        type: 'command',
        tool: String(obj.next_action.tool || ''),
        command: String(obj.next_action.command || ''),
        rationale: String(obj.next_action.rationale || ''),
      } : null,
    }
  } catch {
    return null
  }
}
