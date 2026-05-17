import type { Finding, TargetSummary } from '@/types'

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

// ── Prompt builder ────────────────────────────────────────────────────────────

export function buildSystemPrompt(
  target: TargetSummary,
  findings: Finding[],
  enabledTools: string[],
  enabledMsf: string[]
): string {
  const pentestList = enabledTools.length
    ? enabledTools.map(id => {
        const t = PENTEST_TOOLS.find(x => x.id === id)
        return `  - ${id}${t ? ` — ${t.desc}` : ''}`
      }).join('\n')
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

  return `You are an expert penetration tester conducting an authorized, scoped engagement.

TARGET:
  Host: ${target.hostname_or_ip}
  Type: ${target.target_type.replace(/_/g, ' ')}
  Known ports/services: ${target.ports || 'unknown — discover first'}

EXISTING FINDINGS (from prior automated scans):
${findingLines}

ENABLED PENTEST TOOLS:
${pentestList}

ENABLED METASPLOIT MODULES:
${msfList}

RULES — read carefully:
1. ONLY target ${target.hostname_or_ip}. Never expand scope.
2. Use ONLY tools and modules from the lists above.
3. For Metasploit modules, generate a complete msfconsole -q -x "..." one-liner.
4. Build on what you know — don't repeat scans unless you need fresh data.
5. After each result, identify any new attack path steps worth recording.
6. When you have no more productive actions, return next_action: null.
7. Keep commands concise and targeted — avoid wide spray attacks.

RESPONSE FORMAT — respond with valid JSON ONLY, no markdown, no explanation outside the JSON:
{
  "analysis": "your analysis of the current situation or previous output",
  "attack_path_note": null | "brief label for an attack path step you've just confirmed",
  "next_action": null | {
    "type": "command",
    "tool": "<tool_id or msf module id>",
    "command": "<complete shell command to run>",
    "rationale": "<one sentence: why this step now>"
  }
}`
}

export function buildInitialUserMessage(): string {
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
  // Direct parse
  try { JSON.parse(text); return text } catch { /* continue */ }
  // Markdown code fence
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) { try { JSON.parse(fence[1]); return fence[1] } catch { /* continue */ } }
  // First brace block
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
