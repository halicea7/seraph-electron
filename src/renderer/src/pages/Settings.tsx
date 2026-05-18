import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle, XCircle, Package, Brain, WifiOff, Save, Loader,
  Users, ShieldCheck, UserPlus, Gauge, Palette, Monitor, FlaskConical, Info, ExternalLink,
} from 'lucide-react'
import Icon from '../components/Icon'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { getApiBase, getWsBase } from '@/lib/config'

interface ToolInfo {
  available: boolean
  path: string | null
  version: string | null
  label: string
  install_hint: string | null
  url: string | null
}

interface Profile {
  id: string
  name: string
  description: string
  scan_categories: string  // JSON string
  created_at: string
}

interface HostInfo {
  os: string
  distro_id: string
  distro_name: string
  pkg_manager: string
}

// Per-tool package names keyed by package manager
const TOOL_PKGS: Record<string, Partial<Record<string, string>>> = {
  nmap:         { apt: 'nmap',             dnf: 'nmap',           pacman: 'nmap',        brew: 'nmap',          apk: 'nmap',       zypper: 'nmap' },
  nikto:        { apt: 'nikto',            dnf: 'nikto',          pacman: 'nikto',       brew: 'nikto',         apk: 'nikto',      zypper: 'nikto' },
  testssl:      { apt: 'testssl.sh',       pacman: 'testssl.sh',  brew: 'testssl' },
  lynis:        { apt: 'lynis',            dnf: 'lynis',          pacman: 'lynis',       brew: 'lynis',         zypper: 'lynis' },
  oscap:        { apt: 'libopenscap8 openscap-scanner', dnf: 'openscap-scanner', zypper: 'openscap' },
  masscan:      { apt: 'masscan',          dnf: 'masscan',        pacman: 'masscan',     brew: 'masscan' },
  gobuster:     { apt: 'gobuster',         brew: 'gobuster',      go: 'github.com/OJ/gobuster/v3@latest' },
  sqlmap:       { apt: 'sqlmap',           dnf: 'sqlmap',         pacman: 'sqlmap',      brew: 'sqlmap' },
  hydra:        { apt: 'hydra',            dnf: 'hydra',          pacman: 'hydra',       brew: 'hydra' },
  whois:        { apt: 'whois',            dnf: 'whois',          pacman: 'whois',       brew: 'whois' },
  dig:          { apt: 'dnsutils',         dnf: 'bind-utils',     pacman: 'bind',        brew: 'bind',          apk: 'bind-tools', zypper: 'bind-utils' },
  theHarvester: { apt: 'theharvester',     brew: 'theharvester' },
  subfinder:    { brew: 'subfinder',       go: 'github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest' },
  enum4linux:   { apt: 'enum4linux',       pacman: 'enum4linux' },
  ffuf:         { brew: 'ffuf',            go: 'github.com/ffuf/ffuf/v2@latest' },
  searchsploit: { apt: 'exploitdb',        pacman: 'exploitdb',   brew: 'exploitdb' },
  aws:          { pip: 'awscli',                                                        brew: 'awscli' },
  hashcat:      { apt: 'hashcat',          dnf: 'hashcat',        pacman: 'hashcat',     brew: 'hashcat' },
  john:         { apt: 'john',             dnf: 'john',           pacman: 'john',        brew: 'john' },
  go:           { apt: 'golang-go',        dnf: 'golang',         pacman: 'go',          brew: 'go',            apk: 'go',         zypper: 'go' },
  rustscan:     { brew: 'rustscan' },
  nuclei:       { brew: 'nuclei',          go: 'github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest' },
  feroxbuster:  { brew: 'feroxbuster' },
  kerbrute:                { go: 'github.com/ropnop/kerbrute@latest' },
  nxc:                     { apt: 'netexec',          pip: 'netexec' },
  'impacket-GetUserSPNs':  { apt: 'python3-impacket', pip: 'impacket' },
  'impacket-GetNPUsers':   { apt: 'python3-impacket', pip: 'impacket' },
  'impacket-secretsdump':  { apt: 'python3-impacket', pip: 'impacket' },
  'impacket-psexec':       { apt: 'python3-impacket', pip: 'impacket' },
  'impacket-wmiexec':      { apt: 'python3-impacket', pip: 'impacket' },
  responder:               { apt: 'responder' },
}

interface ToolUsage { feature: string; detail: string }
interface ToolInfoData { description: string; usedIn: ToolUsage[] }

const TOOL_INFO: Record<string, ToolInfoData> = {
  nmap: {
    description: 'Industry-standard network scanner. Discovers open ports, identifies running services, detects OS fingerprints, and runs NSE vulnerability scripts.',
    usedIn: [
      { feature: 'Auto-Probe', detail: 'Runs automatically on every new target for initial reconnaissance' },
      { feature: 'Tool Chains', detail: 'Port scanning phase for external, internal, and web target types' },
      { feature: 'Playbooks', detail: 'Core step in 11 built-in playbooks (Full Recon, Web Sweep, AD Audit, Vuln Assessment, and more)' },
      { feature: 'Scan Templates', detail: 'nmap_discovery and nmap_vuln templates for custom scans' },
    ],
  },
  nikto: {
    description: 'Web server scanner that checks for dangerous files, outdated server software, and common misconfigurations across HTTP/HTTPS.',
    usedIn: [
      { feature: 'Auto-Probe', detail: 'Conditionally runs when ports 80, 443, 8080, 8443, or 8000 are open' },
      { feature: 'Tool Chains', detail: 'Web application scanning phase' },
      { feature: 'Playbooks', detail: 'Web Sweep, Web App Audit, REST API Assessment, Wireless AP Recon' },
      { feature: 'Scan Templates', detail: 'nikto_web scan template' },
    ],
  },
  testssl: {
    description: 'Comprehensive TLS/SSL configuration tester. Checks cipher suites, certificate validity, protocol versions, and known vulnerabilities (BEAST, POODLE, Heartbleed, etc.).',
    usedIn: [
      { feature: 'Auto-Probe', detail: 'Conditionally runs when port 443 or 8443 is open' },
      { feature: 'Tool Chains', detail: 'Web application TLS/SSL analysis phase' },
      { feature: 'Playbooks', detail: 'Web Sweep, Web App Audit, REST API Assessment' },
      { feature: 'Scan Templates', detail: 'Integrated in nikto_web scan template' },
    ],
  },
  lynis: {
    description: 'Host-based security auditing tool. Scans the local system for hardening gaps, misconfigurations, and compliance issues, producing a hardening score.',
    usedIn: [
      { feature: 'Hardening Module', detail: 'Drives the full hardening audit — score, warnings, and improvement suggestions' },
      { feature: 'Scan Templates', detail: 'lynis_audit scan template for local host assessments' },
    ],
  },
  oscap: {
    description: 'OpenSCAP scanner that evaluates systems against SCAP datastreams and XCCDF compliance profiles (CIS, STIG, PCI-DSS, etc.).',
    usedIn: [
      { feature: 'Scan Templates', detail: 'openscap_check template for compliance profile evaluation' },
    ],
  },
  masscan: {
    description: 'Extremely fast TCP port scanner capable of scanning the entire internet in under 6 minutes. Used for large-scale initial port discovery.',
    usedIn: [
      { feature: 'Tool Chains', detail: 'High-speed port discovery for external and internal network target types' },
    ],
  },
  gobuster: {
    description: 'Directory and file brute-forcer for web servers. Also supports DNS subdomain enumeration and virtual host discovery.',
    usedIn: [
      { feature: 'Tool Chains', detail: 'Enumeration phase for external and web application targets' },
      { feature: 'Playbooks', detail: 'Web Sweep, Web App Audit, REST API Assessment' },
    ],
  },
  sqlmap: {
    description: 'Automated SQL injection detection and exploitation tool. Fingerprints databases, extracts data, and tests injection points across HTTP parameters.',
    usedIn: [
      { feature: 'Tool Chains', detail: 'Exploitation phase for external and web application targets' },
      { feature: 'Playbooks', detail: 'Vuln Assessment, Web App Audit, REST API Assessment, Database Discovery' },
    ],
  },
  hydra: {
    description: 'Fast and flexible online password brute-forcer supporting 50+ protocols including SSH, FTP, HTTP, SMB, LDAP, and more.',
    usedIn: [
      { feature: 'Tool Chains', detail: 'Exploitation phase for external and internal network targets' },
      { feature: 'Playbooks', detail: 'Credential Spraying playbook (SSH and SMB password spray)' },
    ],
  },
  whois: {
    description: 'Queries domain registration data including registrar, creation/expiry dates, name servers, and registrant contact information.',
    usedIn: [
      { feature: 'Auto-Probe', detail: 'Always runs on every new target for initial OSINT' },
      { feature: 'Tool Chains', detail: 'Reconnaissance phase for external and internal targets' },
      { feature: 'Playbooks', detail: 'Full Recon, OSINT Deep Dive' },
    ],
  },
  dig: {
    description: 'DNS lookup utility for querying DNS records (A, MX, NS, TXT, CNAME, SOA). Used for mapping a target\'s DNS infrastructure.',
    usedIn: [
      { feature: 'Tool Chains', detail: 'Reconnaissance phase for external network targets' },
    ],
  },
  theHarvester: {
    description: 'OSINT tool that gathers emails, subdomains, hosts, employee names, and open ports from public sources like search engines, DNS, and certificate transparency logs.',
    usedIn: [
      { feature: 'OSINT Module', detail: 'Dedicated OSINT tool with command templates for email and subdomain harvesting' },
      { feature: 'Tool Chains', detail: 'Reconnaissance phase for external network targets' },
      { feature: 'Playbooks', detail: 'Full Recon, OSINT Deep Dive' },
    ],
  },
  subfinder: {
    description: 'Passive subdomain discovery tool using 40+ sources including certificate transparency logs, DNS aggregators, and public APIs. Fast and low-noise.',
    usedIn: [
      { feature: 'OSINT Module', detail: 'Dedicated OSINT tool for rapid passive subdomain enumeration' },
      { feature: 'Tool Chains', detail: 'Reconnaissance phase for external network targets' },
      { feature: 'Playbooks', detail: 'Full Recon, OSINT Deep Dive' },
    ],
  },
  amass: {
    description: 'In-depth attack surface mapping tool using 50+ passive sources. Goes beyond subfinder with graph-based analysis and ASN/IP range enumeration.',
    usedIn: [
      { feature: 'OSINT Module', detail: 'Dedicated OSINT tool for comprehensive attack surface mapping' },
      { feature: 'Playbooks', detail: 'OSINT Deep Dive' },
    ],
  },
  hashcat: {
    description: 'World\'s fastest GPU-accelerated password cracker. Supports 300+ hash types and attack modes including dictionary, brute-force, combinator, and rule-based.',
    usedIn: [
      { feature: 'Cracking Module', detail: 'Primary GPU cracking engine — MD5, SHA1, SHA256, NTLM, bcrypt, and more' },
      { feature: 'Database', detail: 'CrackingJob model tracks jobs, results, and cracked hashes' },
    ],
  },
  john: {
    description: 'John the Ripper — CPU-based password hash cracker with auto-detection of hash formats. Useful when a GPU is unavailable or for formats hashcat doesn\'t support.',
    usedIn: [
      { feature: 'Cracking Module', detail: 'CPU cracking fallback — NT, MD5, SHA1, bcrypt, Kerberos TGS, and more' },
      { feature: 'Database', detail: 'CrackingJob model tracks jobs and cracked results' },
    ],
  },
  enum4linux: {
    description: 'SMB/NetBIOS enumeration tool wrapping smbclient, rpcclient, and net. Extracts users, groups, shares, policies, and OS info from Windows/Samba hosts.',
    usedIn: [
      { feature: 'Tool Chains', detail: 'Enumeration phase for internal and external network targets (Windows hosts)' },
      { feature: 'Playbooks', detail: 'AD Audit, Full AD Attack Path, Windows Post-Exploitation' },
    ],
  },
  ffuf: {
    description: 'Fast web fuzzer written in Go. Used for directory brute-forcing, parameter fuzzing, virtual host discovery, and API endpoint enumeration.',
    usedIn: [
      { feature: 'Tool Chains', detail: 'Enumeration phase for external and web application targets' },
    ],
  },
  searchsploit: {
    description: 'Command-line search tool for the Exploit-DB database. Finds public exploits and shellcode matching detected software versions and CVEs.',
    usedIn: [
      { feature: 'Tool Chains', detail: 'Exploitation research phase for external and internal targets' },
      { feature: 'Playbooks', detail: 'Vuln Assessment — matches discovered services to known exploits' },
    ],
  },
  aws: {
    description: 'AWS Command Line Interface for interacting with Amazon Web Services APIs. Used for cloud security auditing, IAM analysis, and S3 bucket assessments.',
    usedIn: [
      { feature: 'Tool Chains', detail: 'All phases of cloud_aws target type: recon, scanning, enumeration, exploitation, post-exploitation' },
      { feature: 'Scan Templates', detail: 'aws_security_check template for IAM, S3, EC2, and CloudTrail audits' },
    ],
  },
  go: {
    description: 'Go programming language runtime. Not a security tool itself — required to run Go-based tools installed via `go install`.',
    usedIn: [
      { feature: 'Runtime Dependency', detail: 'Required to install and run subfinder, ffuf, gobuster, nuclei (go install method)' },
    ],
  },
  rustscan: {
    description: 'Ultra-fast port scanner written in Rust. Scans all 65535 TCP ports in seconds then hands discovered ports to Nmap for targeted service/version detection — dramatically faster than Nmap\'s --top-ports 1000.',
    usedIn: [
      { feature: 'Auto-Probe', detail: 'Pre-nmap port discovery pass — open ports feed directly into nmap -sV -p <ports>' },
    ],
  },
  nuclei: {
    description: 'Fast, template-based vulnerability scanner from ProjectDiscovery with 7000+ community templates covering CVEs, misconfigurations, exposed panels, default credentials, and more.',
    usedIn: [
      { feature: 'Auto-Probe', detail: 'Runs after nmap on web ports (80, 443, 8080, 8443) with medium/high/critical severity templates' },
    ],
  },
  feroxbuster: {
    description: 'Fast, recursive web directory and file fuzzer written in Rust. Finds hidden paths, admin panels, backup files, and APIs through brute-force enumeration.',
    usedIn: [
      { feature: 'Auto-Probe', detail: 'Runs on HTTP ports (80, 8080, 8000) to discover hidden paths and sensitive endpoints' },
    ],
  },
  kerbrute: {
    description: 'Kerberos user enumeration and password spraying tool. Validates AD usernames via Kerberos pre-authentication — generates no failed-login events, avoiding NTLM lockout noise.',
    usedIn: [
      { feature: 'Pentest Workbench', detail: 'Active Directory engagement — scanning phase (user enumeration) and exploitation phase (password spray)' },
    ],
  },
  nxc: {
    description: 'NetExec (successor to CrackMapExec). Swiss-army knife for Active Directory: SMB/LDAP/WinRM enumeration, credential spraying, pass-the-hash, NTDS dumping, and lateral movement.',
    usedIn: [
      { feature: 'Pentest Workbench', detail: 'Active Directory engagement — all phases: anonymous SMB recon, user enumeration, credentialed enumeration, exploitation, NTDS dump' },
    ],
  },
  'impacket-GetUserSPNs': {
    description: 'Impacket tool for Kerberoasting — requests TGS tickets for all AD service accounts (SPNs). Returned tickets can be cracked offline to recover service account passwords.',
    usedIn: [
      { feature: 'Pentest Workbench', detail: 'Active Directory engagement — enumeration phase (Kerberoasting)' },
    ],
  },
  'impacket-GetNPUsers': {
    description: 'Impacket tool for AS-REP roasting — retrieves Kerberos AS-REP hashes for accounts with "Do not require Kerberos preauthentication" enabled. Hashcat-ready output.',
    usedIn: [
      { feature: 'Pentest Workbench', detail: 'Active Directory engagement — enumeration phase (AS-REP roasting)' },
    ],
  },
  'impacket-secretsdump': {
    description: 'Impacket tool for dumping SAM, LSA secrets, cached domain credentials, and NTDS.dit hashes. Supports DCSync to pull all NTLM hashes from a domain controller without touching disk.',
    usedIn: [
      { feature: 'Pentest Workbench', detail: 'Active Directory engagement — post-exploitation phase (secretsdump and DCSync)' },
    ],
  },
  'impacket-psexec': {
    description: 'Impacket implementation of PsExec — remote execution on Windows hosts via SMB service pipes. Returns a SYSTEM-level shell. Noisier than wmiexec (creates a service).',
    usedIn: [
      { feature: 'Pentest Workbench', detail: 'Active Directory engagement — exploitation phase (remote execution)' },
    ],
  },
  'impacket-wmiexec': {
    description: 'Impacket WMI-based remote execution. Provides a semi-interactive shell using WMI without creating services — lower EDR footprint than psexec.',
    usedIn: [
      { feature: 'Pentest Workbench', detail: 'Active Directory engagement — exploitation phase (stealthier remote execution)' },
    ],
  },
  responder: {
    description: 'LLMNR/NBT-NS/mDNS poisoner. Intercepts broadcast name resolution queries on internal networks and returns forged responses, capturing NTLMv2 challenge/response hashes. Hashes can be cracked offline (hashcat -m 5600) or relayed (ntlmrelayx).',
    usedIn: [
      { feature: 'Pentest Workbench', detail: 'Internal Network engagement — exploitation phase (NTLMv2 hash capture via poisoning)' },
    ],
  },
}


function getBulkInstallCmd(toolNames: string[], hostInfo: HostInfo | null): string {
  const mgr = hostInfo?.pkg_manager || 'apt'
  const pkgSet = new Set(
    toolNames.map(n => TOOL_PKGS[n]?.[mgr]).filter(Boolean) as string[]
  )
  const pkgList = Array.from(pkgSet)

  const pipSet = new Set(
    toolNames.map(n => TOOL_PKGS[n]?.['pip']).filter(Boolean) as string[]
  )
  const pipList = Array.from(pipSet)

  const parts: string[] = []
  if (pkgList.length) {
    if (mgr === 'apt') parts.push(`sudo apt-get update && sudo apt-get install -y ${pkgList.join(' ')}`)
    else if (mgr === 'dnf' || mgr === 'yum') parts.push(`sudo ${mgr} install -y ${pkgList.join(' ')}`)
    else if (mgr === 'pacman') parts.push(`sudo pacman -S --noconfirm ${pkgList.join(' ')}`)
    else if (mgr === 'apk') parts.push(`sudo apk add ${pkgList.join(' ')}`)
    else if (mgr === 'zypper') parts.push(`sudo zypper install -y ${pkgList.join(' ')}`)
    else if (mgr === 'brew') parts.push(`brew install ${pkgList.join(' ')}`)
  }
  if (pipList.length) parts.push(`pip install ${pipList.join(' ')}`)
  return parts.join(' && ')
}

const PKG_MANAGER_LABELS: Record<string, string> = {
  apt: 'Debian / Ubuntu', dnf: 'Fedora / RHEL', yum: 'CentOS / RHEL',
  pacman: 'Arch Linux', apk: 'Alpine', zypper: 'openSUSE', brew: 'macOS (Homebrew)',
}

interface AIConfig {
  endpoint: string
  model: string
  provider: string
  temperature: number | null
  top_p: number | null
  top_k: number | null
  min_p: number | null
  presence_penalty: number | null
  repetition_penalty: number | null
  timeout: number | null
}

interface AIStatus {
  online: boolean
  endpoint: string
  model_count?: number
  error?: string
}

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

const FEATURE_STYLES: Record<string, { color: string; background: string; border: string }> = {
  'Auto-Probe':         { color: 'var(--ok)',     background: 'rgba(84,175,97,0.1)',    border: '1px solid rgba(84,175,97,0.25)' },
  'Tool Chains':        { color: '#60a5fa',       background: 'rgba(96,165,250,0.1)',   border: '1px solid rgba(96,165,250,0.25)' },
  'Playbooks':          { color: '#a855f7',       background: 'rgba(168,85,247,0.1)',   border: '1px solid rgba(168,85,247,0.25)' },
  'Hardening Module':   { color: '#f97316',       background: 'rgba(249,115,22,0.1)',   border: '1px solid rgba(249,115,22,0.25)' },
  'Cracking Module':    { color: 'var(--crit)',   background: 'rgba(232,64,64,0.1)',    border: '1px solid rgba(232,64,64,0.25)' },
  'OSINT Module':       { color: '#22d3ee',       background: 'rgba(34,211,238,0.1)',   border: '1px solid rgba(34,211,238,0.25)' },
  'Scan Templates':     { color: 'var(--fg-3)',   background: 'rgba(100,116,139,0.1)',  border: '1px solid rgba(100,116,139,0.2)' },
  'Database':           { color: 'var(--fg-3)',   background: 'rgba(100,116,139,0.1)',  border: '1px solid rgba(100,116,139,0.2)' },
  'Runtime Dependency': { color: 'var(--accent)', background: 'rgba(240,168,58,0.1)',   border: '1px solid rgba(240,168,58,0.25)' },
  'Pentest Workbench':  { color: '#a855f7',       background: 'rgba(168,85,247,0.1)',   border: '1px solid rgba(168,85,247,0.25)' },
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'tools' | 'profiles' | 'ai' | 'users' | 'autoprobe' | 'appearance' | 'webhooks'>('tools')
  const { user: currentUser, token: authToken, refreshUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [toolStatus, setToolStatus] = useState<Record<string, ToolInfo>>({})
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState('')
  const [profiles, setProfiles] = useState<Profile[]>([])

  // Tool info modal state
  const [infoTool, setInfoTool] = useState<string | null>(null)

  // Install modal state
  const [installTool, setInstallTool] = useState<string | null>(null)
  const [installLines, setInstallLines] = useState<string[]>([])
  const [installDone, setInstallDone] = useState(false)

  function startInstall(toolName: string) {
    setInstallTool(toolName)
    setInstallLines([])
    setInstallDone(false)
    const ws = new WebSocket(`${getWsBase()}/ws/install/${toolName}`)
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'stdout' || msg.type === 'stderr' || msg.type === 'error') {
        setInstallLines(prev => [...prev, msg.data])
      } else if (msg.type === 'exit') {
        setInstallDone(true)
        if (msg.code === 0) loadTools()
      }
    }
    ws.onerror = () => setInstallLines(prev => [...prev, '\nWebSocket error — check server logs.\n'])
  }

  // Auto-probe state
  const [probeEnabled, setProbeEnabled] = useState(false)
  const [probeTools, setProbeTools] = useState<string[]>(['whois', 'rustscan', 'nmap', 'nikto', 'testssl', 'nuclei', 'feroxbuster'])
  const [probeIntensity, setProbeIntensity] = useState<'quick' | 'standard' | 'deep'>('standard')
  const [probeSaving, setProbeSaving] = useState(false)
  const [probeLoading, setProbeLoading] = useState(false)

  // Edit profile state
  const [profileFirstName, setProfileFirstName] = useState(() => {
    const parts = (currentUser?.full_name || '').split(' ')
    return parts.slice(0, -1).join(' ') || parts[0] || ''
  })
  const [profileLastName, setProfileLastName] = useState(() => {
    const parts = (currentUser?.full_name || '').split(' ')
    return parts.length > 1 ? parts[parts.length - 1] : ''
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileOk, setProfileOk] = useState(false)
  const [profileError, setProfileError] = useState('')

  // User management state
  interface UserRow { id: string; username: string; role: string; is_active: boolean; full_name: string; created_at: string }
  const [userList, setUserList] = useState<UserRow[]>([])
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'analyst'>('analyst')
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [showNewPw, setShowNewPw] = useState(false)
  const [userError, setUserError] = useState('')
  const [userSaving, setUserSaving] = useState(false)
  // Change password
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwOk, setPwOk] = useState(false)

  // Passkey state
  interface PasskeyRow { id: string; name: string; created_at: string }
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([])
  const [passkeyRegLoading, setPasskeyRegLoading] = useState(false)
  const [passkeyError, setPasskeyError] = useState('')
  const [newPasskeyName, setNewPasskeyName] = useState('iCloud Keychain')

  // API Token state
  interface ApiTokenRow { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }
  const [apiTokens, setApiTokens] = useState<ApiTokenRow[]>([])
  const [newTokenName, setNewTokenName] = useState('')
  const [tokenGenerating, setTokenGenerating] = useState(false)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)

  // Webhook state
  interface WebhookRow { id: string; name: string; url: string; events: string[]; active: boolean; created_at: string }
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([])
  const [webhookForm, setWebhookForm] = useState({ name: '', url: '', events: ['critical', 'warning'], active: true })
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookError, setWebhookError] = useState('')
  const [webhookTestId, setWebhookTestId] = useState<string | null>(null)

  // Demo mode state
  const [demoActive, setDemoActive] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState('')

  // AI config state
  const [aiConfig, setAiConfig] = useState<AIConfig>({ endpoint: 'http://localhost:11434', model: '', provider: 'ollama', temperature: null, top_p: null, top_k: null, min_p: null, presence_penalty: null, repetition_penalty: null, timeout: null })
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const [aiModels, setAiModels] = useState<string[]>([])
  const [aiSaving, setAiSaving] = useState(false)
  const [aiTesting, setAiTesting] = useState(false)

  // Local Ollama state
  const [localOllamaSettings, setLocalOllamaSettings] = useState({ useLocalOllama: false, localOllamaUrl: 'http://localhost:11434', localOllamaModel: '' })
  const [localOllamaModels, setLocalOllamaModels] = useState<string[]>([])
  const [localOllamaTesting, setLocalOllamaTesting] = useState(false)
  const [localOllamaSaving, setLocalOllamaSaving] = useState(false)
  const [localOllamaStatus, setLocalOllamaStatus] = useState<{ online: boolean; error?: string } | null>(null)

  useEffect(() => {
    loadTools()
    loadProfiles()
    loadAiConfig()
    loadProbeConfig()
    loadPasskeys()
    loadApiTokens()
    loadWebhooks()
    loadLocalOllamaSettings()
    if (currentUser?.role === 'admin') {
      loadUsers()
      loadDemoStatus()
    }
  }, [])

  async function loadPasskeys() {
    try {
      const res = await fetch(`${getApiBase()}/passkeys/`, { headers: { Authorization: `Bearer ${authToken}` } })
      if (res.ok) setPasskeys(await res.json())
    } catch { /* ignore */ }
  }

  async function loadApiTokens() {
    try {
      const res = await fetch(`${getApiBase()}/auth/tokens`, { headers: { Authorization: `Bearer ${authToken}` } })
      if (res.ok) setApiTokens(await res.json())
    } catch { /* ignore */ }
  }

  async function handleGenerateToken() {
    if (!newTokenName.trim()) return
    setTokenGenerating(true)
    setRevealedToken(null)
    try {
      const res = await fetch(`${getApiBase()}/auth/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ name: newTokenName.trim() }),
      })
      if (!res.ok) return
      const data = await res.json()
      setRevealedToken(data.token)
      setNewTokenName('')
      await loadApiTokens()
    } finally {
      setTokenGenerating(false)
    }
  }

  async function handleRevokeToken(id: string) {
    await fetch(`${getApiBase()}/auth/tokens/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    })
    setApiTokens(prev => prev.filter(t => t.id !== id))
  }

  function handleCopyToken() {
    if (!revealedToken) return
    navigator.clipboard.writeText(revealedToken)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 2000)
  }

  async function handleRegisterPasskey() {
    if (!window.isSecureContext) {
      setPasskeyError('Passkeys require a secure context. Access Seraph via http://localhost:8000 or enable HTTPS.')
      return
    }
    if (!window.PublicKeyCredential) {
      setPasskeyError('Passkeys are not available in this browser.')
      return
    }
    setPasskeyError('')
    setPasskeyRegLoading(true)
    try {
      // 1. Begin
      const beginRes = await fetch(`${getApiBase()}/passkeys/register/begin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (!beginRes.ok) throw new Error('Failed to start passkey registration')
      const opts = await beginRes.json()
      const { _challenge_key: challengeKey, ...pubKeyOpts } = opts

      // 2. Decode for browser API
      const createOpts: PublicKeyCredentialCreationOptions = {
        ...pubKeyOpts,
        challenge: _b64urlToBuffer(pubKeyOpts.challenge),
        user: { ...pubKeyOpts.user, id: _b64urlToBuffer(pubKeyOpts.user.id) },
        excludeCredentials: (pubKeyOpts.excludeCredentials || []).map((c: any) => ({
          ...c, id: _b64urlToBuffer(c.id),
        })),
      }

      // 3. Prompt authenticator
      const cred = await navigator.credentials.create({ publicKey: createOpts }) as PublicKeyCredential | null
      if (!cred) throw new Error('No credential created')
      const ar = cred.response as AuthenticatorAttestationResponse

      // 4. Complete
      const completeRes = await fetch(`${getApiBase()}/passkeys/register/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          challenge_key: challengeKey,
          name: newPasskeyName.trim() || 'Passkey',
          credential: {
            id: cred.id,
            rawId: _bufferToB64url(cred.rawId),
            response: {
              clientDataJSON: _bufferToB64url(ar.clientDataJSON),
              attestationObject: _bufferToB64url(ar.attestationObject),
              transports: ar.getTransports ? ar.getTransports() : [],
            },
            type: cred.type,
          },
        }),
      })
      const data = await completeRes.json()
      if (!completeRes.ok) throw new Error(data.detail || 'Registration failed')
      setNewPasskeyName('iCloud Keychain')
      await loadPasskeys()
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setPasskeyError('Passkey prompt was cancelled.')
      } else {
        setPasskeyError(err.message || 'Registration failed')
      }
    } finally {
      setPasskeyRegLoading(false)
    }
  }

  async function handleDeletePasskey(id: string) {
    await fetch(`${getApiBase()}/passkeys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    })
    setPasskeys(prev => prev.filter(p => p.id !== id))
  }

  function _b64urlToBuffer(b64url: string): ArrayBuffer {
    const padded = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      b64url.length + (4 - (b64url.length % 4)) % 4, '=',
    )
    const bin = atob(padded)
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    return buf.buffer
  }

  function _bufferToB64url(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  }

  async function loadWebhooks() {
    try {
      const res = await fetch(`${getApiBase()}/webhooks`, { headers: { Authorization: `Bearer ${authToken}` } })
      if (res.ok) setWebhooks(await res.json())
    } catch { /* ignore */ }
  }

  async function handleCreateWebhook(e: React.FormEvent) {
    e.preventDefault()
    setWebhookError('')
    if (!webhookForm.name.trim() || !webhookForm.url.trim()) { setWebhookError('Name and URL are required.'); return }
    setWebhookSaving(true)
    try {
      const res = await fetch(`${getApiBase()}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(webhookForm),
      })
      if (!res.ok) { const d = await res.json(); setWebhookError(d.detail || 'Failed to create webhook'); return }
      setWebhookForm({ name: '', url: '', events: ['critical', 'warning'], active: true })
      await loadWebhooks()
    } catch { setWebhookError('Request failed') }
    finally { setWebhookSaving(false) }
  }

  async function handleDeleteWebhook(id: string) {
    await fetch(`${getApiBase()}/webhooks/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` } })
    setWebhooks(w => w.filter(x => x.id !== id))
  }

  async function handleToggleWebhook(id: string, active: boolean) {
    const res = await fetch(`${getApiBase()}/webhooks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ active }),
    })
    if (res.ok) setWebhooks(w => w.map(x => x.id === id ? { ...x, active } : x))
  }

  async function handleTestWebhook(id: string) {
    setWebhookTestId(id)
    try {
      await fetch(`${getApiBase()}/webhooks/${id}/test`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } })
    } finally { setTimeout(() => setWebhookTestId(null), 1500) }
  }

  function toggleWebhookEvent(event: string) {
    setWebhookForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }))
  }

  async function loadDemoStatus() {
    try {
      const res = await fetch(`${getApiBase()}/demo/status`)
      if (res.ok) setDemoActive((await res.json()).active)
    } catch { /* backend offline */ }
  }

  async function handleDemoToggle() {
    setDemoLoading(true)
    setDemoError('')
    try {
      const res = await fetch(`${getApiBase()}/demo/${demoActive ? 'clear' : 'seed'}`, {
        method: demoActive ? 'DELETE' : 'POST',
      })
      if (res.ok) {
        setDemoActive(!demoActive)
        navigate('/')
      } else {
        setDemoError(`Failed to ${demoActive ? 'clear' : 'seed'} demo data (${res.status})`)
      }
    } catch {
      setDemoError('Could not reach the backend.')
    } finally {
      setDemoLoading(false)
    }
  }

  async function loadTools() {
    setLoading(true)
    try {
      const [toolRes, hostRes] = await Promise.all([
        fetch(`${getApiBase()}/settings/tools`),
        fetch(`${getApiBase()}/settings/host-info`),
      ])
      setToolStatus(await toolRes.json())
      if (hostRes.ok) setHostInfo(await hostRes.json())
    } finally {
      setLoading(false)
    }
  }

  async function loadProfiles() {
    const res = await fetch(`${getApiBase()}/profiles`)
    if (res.ok) setProfiles(await res.json())
  }

  async function deleteProfile(id: string) {
    await fetch(`${getApiBase()}/profiles/${id}`, { method: 'DELETE' })
    loadProfiles()
  }

  async function loadProbeConfig() {
    setProbeLoading(true)
    try {
      const res = await fetch(`${getApiBase()}/settings/auto-probe`)
      if (res.ok) {
        const data = await res.json()
        setProbeEnabled(data.enabled)
        setProbeTools(data.tools)
        setProbeIntensity(data.intensity)
      }
    } finally {
      setProbeLoading(false)
    }
  }

  async function saveProbeConfig() {
    setProbeSaving(true)
    try {
      await fetch(`${getApiBase()}/settings/auto-probe`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: probeEnabled, tools: probeTools, intensity: probeIntensity }),
      })
    } finally {
      setProbeSaving(false)
    }
  }

  function toggleProbeTool(name: string) {
    setProbeTools(prev =>
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    )
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileError('')
    setProfileOk(false)
    setProfileSaving(true)
    try {
      const fullName = `${profileFirstName.trim()} ${profileLastName.trim()}`.trim()
      const res = await fetch(`${getApiBase()}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ full_name: fullName || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to update profile')
      await refreshUser()
      setProfileOk(true)
      setTimeout(() => setProfileOk(false), 3000)
    } catch (err: any) {
      setProfileError(err.message)
    } finally {
      setProfileSaving(false)
    }
  }

  async function loadUsers() {
    const res = await fetch(`${getApiBase()}/auth/users`)
    if (res.ok) setUserList(await res.json())
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setUserError('')
    setUserSaving(true)
    try {
      const res = await fetch(`${getApiBase()}/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
          full_name: `${newFirstName.trim()} ${newLastName.trim()}`.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to create user')
      setNewUsername('')
      setNewPassword('')
      setNewFirstName('')
      setNewLastName('')
      loadUsers()
    } catch (err: any) {
      setUserError(err.message)
    } finally {
      setUserSaving(false)
    }
  }

  async function handleDeleteUser(id: string) {
    await fetch(`${getApiBase()}/auth/users/${id}`, { method: 'DELETE' })
    loadUsers()
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    setPwOk(false)
    setPwSaving(true)
    try {
      const res = await fetch(`${getApiBase()}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: curPw, new_password: newPw }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to change password')
      setCurPw('')
      setNewPw('')
      setPwOk(true)
    } catch (err: any) {
      setPwError(err.message)
    } finally {
      setPwSaving(false)
    }
  }

  async function loadAiConfig() {
    try {
      const res = await fetch(`${getApiBase()}/ai/config`)
      if (res.ok) setAiConfig(await res.json())
    } catch { /* backend offline */ }
  }

  async function saveAiConfig() {
    setAiSaving(true)
    try {
      await fetch(`${getApiBase()}/ai/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiConfig),
      })
    } finally {
      setAiSaving(false)
    }
  }

  async function testAiConnection() {
    setAiTesting(true)
    setAiStatus(null)
    setAiModels([])
    try {
      // Save first so status check uses new endpoint
      await fetch(`${getApiBase()}/ai/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiConfig),
      })
      const [statusRes, modelsRes] = await Promise.all([
        fetch(`${getApiBase()}/ai/status`),
        fetch(`${getApiBase()}/ai/models`),
      ])
      if (statusRes.ok) setAiStatus(await statusRes.json())
      if (modelsRes.ok) {
        const data = await modelsRes.json()
        setAiModels(data.models || [])
        // Auto-select first model if none selected
        if (!aiConfig.model && data.models?.length > 0) {
          setAiConfig(c => ({ ...c, model: data.models[0] }))
        }
      }
    } finally {
      setAiTesting(false)
    }
  }

  async function loadLocalOllamaSettings() {
    try {
      const s = await window.electronAPI.ollamaGetSettings()
      setLocalOllamaSettings(s)
    } catch { /* ignore */ }
  }

  async function saveLocalOllamaSettings() {
    setLocalOllamaSaving(true)
    try {
      await window.electronAPI.ollamaSetSettings(localOllamaSettings)
    } finally {
      setLocalOllamaSaving(false)
    }
  }

  async function testLocalOllama() {
    setLocalOllamaTesting(true)
    setLocalOllamaStatus(null)
    setLocalOllamaModels([])
    try {
      await window.electronAPI.ollamaSetSettings(localOllamaSettings)
      const models = await window.electronAPI.ollamaModels()
      setLocalOllamaModels(models)
      setLocalOllamaStatus({ online: true })
      if (!localOllamaSettings.localOllamaModel && models.length > 0) {
        setLocalOllamaSettings(s => ({ ...s, localOllamaModel: models[0] }))
      }
    } catch (err: any) {
      setLocalOllamaStatus({ online: false, error: err.message })
    } finally {
      setLocalOllamaTesting(false)
    }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  const available = Object.entries(toolStatus).filter(([, v]) => v.available)
  const missing = Object.entries(toolStatus).filter(([, v]) => !v.available)

  const mgr = hostInfo?.pkg_manager || 'apt'
  const missingNames = missing.map(([name]) => name)
  // Exclude 'go' from bulk install (it's a runtime, handled separately)
  const pkgMgrMissing = missingNames.filter(n => n !== 'go' && TOOL_PKGS[n]?.[mgr])
  const goRuntimeMissing = !toolStatus['go']?.available && toolStatus['go'] !== undefined
  // Tools that install via `go install` but Go itself is missing
  const blockedByGo = missing.filter(([name]) => {
    const hint = toolStatus[name]?.install_hint
    return hint?.startsWith('go install') && goRuntimeMissing
  })
  const bulkInstallCmd = getBulkInstallCmd(pkgMgrMissing, hostInfo)

  const tabBtn = (value: typeof activeTab, label: string, icon?: JSX.Element, dot?: boolean) => (
    <button
      key={value}
      onClick={() => setActiveTab(value)}
      style={{
        padding: '8px 14px', fontSize: 12, fontFamily: 'var(--font-sans)', background: 'none', border: 'none',
        borderBottom: `2px solid ${activeTab === value ? 'var(--accent)' : 'transparent'}`,
        marginBottom: -1, color: activeTab === value ? 'var(--accent)' : 'var(--fg-3)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
      }}
    >
      {icon}{label}
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', boxShadow: '0 0 4px rgba(84,175,97,0.8)' }} />}
    </button>
  )

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--bg)', color: 'var(--fg)', minHeight: '100%' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Settings</h1>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
          Tool detection, scan profiles, and platform configuration
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: rule, marginBottom: 24 }}>
        {tabBtn('tools',      `Tools (${available.length}/${Object.keys(toolStatus).length})`)}
        {tabBtn('profiles',   `Profiles (${profiles.length})`)}
        {tabBtn('ai',         'AI',          <Brain size={12} />)}
        {tabBtn('users',      'Users',        <Users size={12} />)}
        {tabBtn('autoprobe',  'Auto-Probe',   <Icon name="zap" size={12} color="currentColor" />, probeEnabled)}
        {tabBtn('appearance', 'Appearance',   <Palette size={12} />)}
        {tabBtn('webhooks',   'Webhooks',     <Icon name="zap" size={12} color="currentColor" />)}
      </div>

      {activeTab === 'tools' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button
            onClick={loadTools}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 3, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: loading ? 'default' : 'pointer', fontFamily: 'var(--font-sans)', width: 'fit-content' }}
          >
            <Icon name="refresh" size={13} color={loading ? 'var(--accent)' : 'currentColor'} />
            {loading ? 'Detecting...' : 'Refresh Tool Detection'}
          </button>

          {missing.length > 0 && (
            <div style={{ background: 'rgba(240,168,58,0.06)', border: '1px solid rgba(240,168,58,0.25)', borderRadius: 4, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Package size={14} color="var(--accent)" />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-sans)' }}>{missing.length} tools not installed</span>
                {hostInfo && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 3, background: 'var(--bg-2)', border: ruleStrong }}>
                    {hostInfo.distro_name} · {PKG_MANAGER_LABELS[mgr] || mgr}
                  </span>
                )}
              </div>
              {bulkInstallCmd && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', marginBottom: 6 }}>
                    Install all {pkgMgrMissing.length} missing tools at once:
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ flex: 1, background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bulkInstallCmd}
                    </code>
                    <button
                      onClick={() => copyText(bulkInstallCmd, 'bulk-all')}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 3, background: 'rgba(240,168,58,0.1)', border: '1px solid rgba(240,168,58,0.3)', color: 'var(--accent)', fontSize: 11, fontFamily: 'var(--font-sans)', cursor: 'pointer', flexShrink: 0 }}
                    >
                      <Icon name={copied === 'bulk-all' ? 'check' : 'copy'} size={11} color="currentColor" />
                      {copied === 'bulk-all' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
              {goRuntimeMissing && blockedByGo.length > 0 && (
                <div style={{ background: 'rgba(240,168,58,0.05)', border: '1px solid rgba(240,168,58,0.2)', borderRadius: 3, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>
                    Go Runtime required for: {blockedByGo.map(([n]) => toolStatus[n]?.label || n).join(', ')}
                  </div>
                  <button
                    onClick={() => startInstall('go')}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 3, background: 'rgba(240,168,58,0.1)', border: '1px solid rgba(240,168,58,0.3)', color: 'var(--accent)', fontSize: 11, fontFamily: 'var(--font-sans)', cursor: 'pointer', width: 'fit-content' }}
                  >
                    <Icon name="download" size={11} color="currentColor" /> Install Go Runtime
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', marginBottom: 10 }}>
              All Tools — {available.length} available, {missing.length} missing
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {Object.entries(toolStatus).map(([name, info]) => {
                const isGoRuntime = name === 'go'
                const needsGo = !isGoRuntime && !info.available && info.install_hint?.startsWith('go install')
                const goMissing = needsGo && toolStatus['go'] && !toolStatus['go'].available
                const leftBorder = info.available ? '3px solid var(--ok)' : isGoRuntime ? '3px solid var(--accent)' : '3px solid var(--crit)'
                return (
                  <div key={name} style={{ background: 'var(--bg-2)', border: ruleStrong, borderLeft: leftBorder, borderRadius: 4, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      {info.available
                        ? <CheckCircle size={14} color="var(--ok)" style={{ flexShrink: 0 }} />
                        : <XCircle size={14} color={isGoRuntime ? 'var(--accent)' : 'var(--crit)'} style={{ flexShrink: 0 }} />
                      }
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--fg)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.label || name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {isGoRuntime && !info.available && (
                          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(240,168,58,0.1)', color: 'var(--accent)', border: '1px solid rgba(240,168,58,0.25)', fontFamily: 'var(--font-sans)' }}>runtime</span>
                        )}
                        {TOOL_INFO[name] && (
                          <button onClick={() => setInfoTool(name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, display: 'flex' }} title="About this tool">
                            <Info size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    {info.available ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {isGoRuntime && <div style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Required by subfinder, ffuf, gobuster</div>}
                        {info.path && <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.path}</div>}
                        {info.version && <div style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.version.slice(0, 60)}</div>}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {isGoRuntime
                          ? <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-sans)' }}>Required by subfinder, ffuf, gobuster</div>
                          : <div style={{ fontSize: 10, color: 'var(--crit)', fontFamily: 'var(--font-sans)' }}>Not installed</div>
                        }
                        {goMissing && <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-sans)' }}>⚠ Install Go Runtime first</div>}
                        {info.install_hint && !goMissing && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <code style={{ flex: 1, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={info.install_hint}>{info.install_hint}</code>
                            <button onClick={() => copyText(info.install_hint!, `tool-${name}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === `tool-${name}` ? 'var(--ok)' : 'var(--fg-3)', padding: 0, flexShrink: 0, display: 'flex' }}>
                              <Icon name={copied === `tool-${name}` ? 'check' : 'copy'} size={11} color="currentColor" />
                            </button>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {!goMissing && (
                            <button onClick={() => startInstall(name)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 3, background: isGoRuntime ? 'rgba(240,168,58,0.1)' : 'rgba(96,165,250,0.1)', color: isGoRuntime ? 'var(--accent)' : '#60a5fa', border: isGoRuntime ? '1px solid rgba(240,168,58,0.3)' : '1px solid rgba(96,165,250,0.3)', fontSize: 11, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                              <Icon name="download" size={10} color="currentColor" /> Install
                            </button>
                          )}
                          {info.url && (
                            <a href={info.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textDecoration: 'underline' }}>
                              Instructions ↗
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'autoprobe' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          {probeLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-3)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
              <Loader size={14} className="animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
                When enabled, Seraph automatically runs a lightweight recon against any newly added target.
                Results appear in the target's scan history within minutes.
              </p>

              <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Icon name="zap" size={14} color={probeEnabled ? 'var(--ok)' : 'var(--fg-3)'} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Auto-Probe</span>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, fontFamily: 'var(--font-sans)', color: probeEnabled ? 'var(--ok)' : 'var(--fg-3)', background: probeEnabled ? 'rgba(84,175,97,0.1)' : 'rgba(100,116,139,0.1)', border: probeEnabled ? '1px solid rgba(84,175,97,0.3)' : '1px solid rgba(100,116,139,0.2)' }}>
                      {probeEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Fires automatically on every new target</p>
                </div>
                <button
                  onClick={() => setProbeEnabled(v => !v)}
                  style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, background: probeEnabled ? 'var(--ok)' : 'rgba(100,116,139,0.3)', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                >
                  <span style={{ position: 'absolute', top: 3, left: probeEnabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                </button>
              </div>

              <div>
                <label style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Tools to Run</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { name: 'whois',        label: 'whois',        desc: 'Domain registration & ASN info',                         always: true  },
                    { name: 'rustscan',     label: 'rustscan',     desc: 'Full 65k port scan — feeds open ports to nmap (faster)', always: false },
                    { name: 'nmap',         label: 'nmap',         desc: 'Service & version detection',                            always: true  },
                    { name: 'nikto',        label: 'nikto',        desc: 'Web server scan (port 80/443)',                          always: false },
                    { name: 'testssl',      label: 'testssl',      desc: 'TLS/SSL audit (port 443)',                               always: false },
                    { name: 'nuclei',       label: 'nuclei',       desc: 'Template-based vuln scan (port 80/443/8080)',            always: false },
                    { name: 'feroxbuster',  label: 'feroxbuster',  desc: 'Directory fuzzing (port 80/8080)',                       always: false },
                    { name: 'searchsploit', label: 'searchsploit', desc: 'Exploit-DB lookup (runs last)',                         always: false },
                  ].map(tool => {
                    const checked = probeTools.includes(tool.name)
                    const toolAvail = Object.keys(toolStatus).includes(tool.name) ? toolStatus[tool.name]?.available : null
                    return (
                      <button
                        key={tool.name}
                        onClick={() => toggleProbeTool(tool.name)}
                        style={{ textAlign: 'left', borderRadius: 4, padding: 10, border: checked ? '1px solid rgba(240,168,58,0.35)' : ruleStrong, background: checked ? 'rgba(240,168,58,0.06)' : 'var(--bg-2)', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ width: 14, height: 14, borderRadius: 3, border: checked ? 'none' : ruleStrong, background: checked ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {checked && <Icon name="check" size={9} color="var(--bg)" />}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>{tool.label}</span>
                          {toolAvail === false && <span style={{ fontSize: 10, color: 'var(--crit)', fontFamily: 'var(--font-sans)' }}>not installed</span>}
                          {!tool.always && <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', marginLeft: 'auto' }}>conditional</span>}
                        </div>
                        <p style={{ margin: 0, fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', paddingLeft: 20 }}>{tool.desc}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                  <Gauge size={11} /> Intensity
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([
                    { value: 'quick',    label: 'Quick',    desc: '2 min · serial (low noise)' },
                    { value: 'standard', label: 'Standard', desc: '5 min · 2 tools parallel' },
                    { value: 'deep',     label: 'Deep',     desc: '10 min · fully parallel' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setProbeIntensity(opt.value)}
                      style={{ flex: 1, borderRadius: 4, padding: '10px 12px', textAlign: 'center', border: probeIntensity === opt.value ? '1px solid rgba(240,168,58,0.35)' : ruleStrong, background: probeIntensity === opt.value ? 'rgba(240,168,58,0.08)' : 'var(--bg-2)', cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: probeIntensity === opt.value ? 'var(--accent)' : 'var(--fg)', fontFamily: 'var(--font-sans)' }}>{opt.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={saveProbeConfig}
                disabled={probeSaving}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 3, background: 'var(--accent)', color: '#0d0c0a', border: 'none', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: probeSaving ? 'default' : 'pointer', opacity: probeSaving ? 0.7 : 1, width: 'fit-content' }}
              >
                {probeSaving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
                Save Auto-Probe Settings
              </button>
            </>
          )}
        </div>
      )}

      {activeTab === 'ai' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
            Connect Seraph to a local LLM (Ollama or LMStudio) for AI-generated report narratives.
            Both expose an OpenAI-compatible API — no internet or API key required.
          </p>

          <div>
            <label style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Provider Preset</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { label: 'Ollama',   value: 'ollama',   url: 'http://localhost:11434' },
                { label: 'LMStudio', value: 'lmstudio', url: 'http://localhost:1234' },
                { label: 'Custom',   value: 'custom',   url: '' },
              ].map(p => (
                <button key={p.value}
                  onClick={() => setAiConfig(c => ({ ...c, provider: p.value, ...(p.url ? { endpoint: p.url } : {}) }))}
                  style={{ padding: '5px 14px', borderRadius: 3, fontSize: 12, fontFamily: 'var(--font-sans)', cursor: 'pointer', background: aiConfig.provider === p.value ? 'rgba(240,168,58,0.1)' : 'none', color: aiConfig.provider === p.value ? 'var(--accent)' : 'var(--fg-3)', border: aiConfig.provider === p.value ? '1px solid rgba(240,168,58,0.35)' : ruleStrong }}
                >{p.label}</button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>API Endpoint</label>
            <input type="text" value={aiConfig.endpoint}
              onChange={e => setAiConfig(c => ({ ...c, endpoint: e.target.value, provider: 'custom' }))}
              placeholder="http://localhost:11434"
              style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-mono)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
            <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Ollama: port 11434 · LMStudio: port 1234 · Both expose /v1/models and /v1/chat/completions</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={testAiConnection} disabled={aiTesting}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 3, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: aiTesting ? 'default' : 'pointer', fontFamily: 'var(--font-sans)', opacity: aiTesting ? 0.7 : 1 }}
            >
              {aiTesting ? <Loader size={13} className="animate-spin" color="var(--accent)" /> : <Icon name="wifi" size={13} color="currentColor" />}
              Test Connection
            </button>
            {aiStatus && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: aiStatus.online ? 'var(--ok)' : 'var(--crit)', fontFamily: 'var(--font-sans)' }}>
                {aiStatus.online
                  ? <><CheckCircle size={13} /> Connected · {aiStatus.model_count} model{aiStatus.model_count !== 1 ? 's' : ''} available</>
                  : <><WifiOff size={13} /> Offline — {aiStatus.error}</>
                }
              </div>
            )}
          </div>

          {aiModels.length > 0 ? (
            <div>
              <label style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Model</label>
              <select value={aiConfig.model} onChange={e => setAiConfig(c => ({ ...c, model: e.target.value }))}
                style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%' }}
              >
                <option value="">Select a model...</option>
                {aiModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Model Name</label>
              <input type="text" value={aiConfig.model} onChange={e => setAiConfig(c => ({ ...c, model: e.target.value }))}
                placeholder="e.g. llama3.2, mistral, deepseek-r1:8b"
                style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-mono)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
              />
              <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Click "Test Connection" to auto-populate models from the endpoint.</p>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Generation Parameters</label>
              <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Leave blank to use model defaults</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {([
                { key: 'temperature',        label: 'Temperature',          min: 0,   max: 2,    step: 0.01, placeholder: 'e.g. 1.0' },
                { key: 'top_p',              label: 'Top P',                min: 0,   max: 1,    step: 0.01, placeholder: 'e.g. 0.95' },
                { key: 'top_k',              label: 'Top K',                min: 0,   max: 200,  step: 1,    placeholder: 'e.g. 20' },
                { key: 'min_p',              label: 'Min P',                min: 0,   max: 1,    step: 0.01, placeholder: 'e.g. 0.0' },
                { key: 'presence_penalty',   label: 'Presence Penalty',     min: -2,  max: 2,    step: 0.1,  placeholder: 'e.g. 1.5' },
                { key: 'repetition_penalty', label: 'Repetition Penalty',   min: 0.1, max: 2,    step: 0.01, placeholder: 'e.g. 1.0' },
                { key: 'timeout',            label: 'Timeout (seconds)',    min: 30,  max: 1800,  step: 30,   placeholder: 'default: 300' },
              ] as { key: keyof AIConfig; label: string; min: number; max: number; step: number; placeholder: string }[]).map(({ key, label, min, max, step, placeholder }) => (
                <div key={key}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>{label}</label>
                    {aiConfig[key] !== null && (
                      <button onClick={() => setAiConfig(c => ({ ...c, [key]: null }))} style={{ fontSize: 10, color: 'var(--fg-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>reset</button>
                    )}
                  </div>
                  <input type="number" min={min} max={max} step={step} value={aiConfig[key] ?? ''} placeholder={placeholder}
                    onChange={e => setAiConfig(c => ({ ...c, [key]: e.target.value === '' ? null : Number(e.target.value) }))}
                    style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-mono)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
          </div>

          <button onClick={saveAiConfig} disabled={aiSaving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 3, background: 'var(--accent)', color: '#0d0c0a', border: 'none', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: aiSaving ? 'default' : 'pointer', opacity: aiSaving ? 0.7 : 1, width: 'fit-content' }}
          >
            {aiSaving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            Save AI Settings
          </button>

          <div style={{ borderTop: rule, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Local Ollama (this machine)</h3>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
                  Use Ollama running on your laptop instead of the server. Narratives are generated locally — no data leaves your machine.
                </p>
              </div>
              <button
                onClick={() => setLocalOllamaSettings(s => ({ ...s, useLocalOllama: !s.useLocalOllama }))}
                style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, background: localOllamaSettings.useLocalOllama ? 'var(--ok)' : 'rgba(100,116,139,0.3)', border: 'none', cursor: 'pointer', flexShrink: 0 }}
              >
                <span style={{ position: 'absolute', top: 3, left: localOllamaSettings.useLocalOllama ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
              </button>
            </div>

            {localOllamaSettings.useLocalOllama && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Ollama URL</label>
                  <input type="text" value={localOllamaSettings.localOllamaUrl}
                    onChange={e => setLocalOllamaSettings(s => ({ ...s, localOllamaUrl: e.target.value }))}
                    placeholder="http://localhost:11434"
                    style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-mono)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={testLocalOllama} disabled={localOllamaTesting}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 3, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: localOllamaTesting ? 'default' : 'pointer', fontFamily: 'var(--font-sans)', opacity: localOllamaTesting ? 0.7 : 1 }}
                  >
                    {localOllamaTesting ? <Loader size={13} className="animate-spin" /> : <Icon name="wifi" size={13} color="currentColor" />}
                    Test Connection
                  </button>
                  {localOllamaStatus && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: localOllamaStatus.online ? 'var(--ok)' : 'var(--crit)', fontFamily: 'var(--font-sans)' }}>
                      {localOllamaStatus.online
                        ? <><CheckCircle size={13} /> Connected · {localOllamaModels.length} model{localOllamaModels.length !== 1 ? 's' : ''} available</>
                        : <><WifiOff size={13} /> Offline — {localOllamaStatus.error}</>
                      }
                    </div>
                  )}
                </div>
                {localOllamaModels.length > 0 ? (
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Model</label>
                    <select value={localOllamaSettings.localOllamaModel}
                      onChange={e => setLocalOllamaSettings(s => ({ ...s, localOllamaModel: e.target.value }))}
                      style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%' }}
                    >
                      <option value="">Select a model...</option>
                      {localOllamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Model Name</label>
                    <input type="text" value={localOllamaSettings.localOllamaModel}
                      onChange={e => setLocalOllamaSettings(s => ({ ...s, localOllamaModel: e.target.value }))}
                      placeholder="e.g. llama3.2, mistral, deepseek-r1:8b"
                      style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-mono)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                    />
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Click "Test Connection" to auto-populate from your local Ollama instance.</p>
                  </div>
                )}
              </div>
            )}

            <button onClick={saveLocalOllamaSettings} disabled={localOllamaSaving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 3, background: 'var(--accent)', color: '#0d0c0a', border: 'none', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: localOllamaSaving ? 'default' : 'pointer', opacity: localOllamaSaving ? 0.7 : 1, width: 'fit-content' }}
            >
              {localOllamaSaving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
              Save Local Ollama Settings
            </button>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          {/* My Profile */}
          <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <UserPlus size={14} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>My Profile</span>
              <span style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>@{currentUser?.username}</span>
            </div>
            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 4 }}>First Name</label>
                  <input type="text" value={profileFirstName} onChange={e => setProfileFirstName(e.target.value)} placeholder="Jane" style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' }} /></div>
                <div><label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 4 }}>Last Name</label>
                  <input type="text" value={profileLastName} onChange={e => setProfileLastName(e.target.value)} placeholder="Doe" style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' }} /></div>
              </div>
              {profileError && <p style={{ margin: 0, fontSize: 11, color: 'var(--crit)', fontFamily: 'var(--font-sans)' }}>{profileError}</p>}
              {profileOk && <p style={{ margin: 0, fontSize: 11, color: 'var(--ok)', fontFamily: 'var(--font-sans)' }}>Profile updated.</p>}
              <button type="submit" disabled={profileSaving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 3, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: profileSaving ? 'default' : 'pointer', fontFamily: 'var(--font-sans)', opacity: profileSaving ? 0.7 : 1, width: 'fit-content' }}>
                {profileSaving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Save Profile
              </button>
            </form>
          </div>

          {/* Change Password */}
          <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="key" size={14} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Change Password</span>
            </div>
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 4 }}>Current password</label>
                  <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} required style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' }} /></div>
                <div><label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 4 }}>New password (min 8)</label>
                  <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' }} /></div>
              </div>
              {pwError && <p style={{ margin: 0, fontSize: 11, color: 'var(--crit)', fontFamily: 'var(--font-sans)' }}>{pwError}</p>}
              {pwOk && <p style={{ margin: 0, fontSize: 11, color: 'var(--ok)', fontFamily: 'var(--font-sans)' }}>Password changed successfully.</p>}
              <button type="submit" disabled={pwSaving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 3, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: pwSaving ? 'default' : 'pointer', fontFamily: 'var(--font-sans)', opacity: pwSaving ? 0.7 : 1, width: 'fit-content' }}>
                {pwSaving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Update Password
              </button>
            </form>
          </div>

          {/* Passkeys */}
          <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="fingerprint" size={14} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Passkeys</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>iCloud Keychain, Touch ID, Face ID, YubiKey…</span>
            </div>
            {passkeys.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {passkeys.map(pk => (
                  <div key={pk.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg)', border: ruleStrong, borderRadius: 3 }}>
                    <Icon name="fingerprint" size={13} color="var(--accent)" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>{pk.name}</span>
                      <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>added {new Date(pk.created_at).toLocaleDateString()}</span>
                    </div>
                    <button onClick={() => handleDeletePasskey(pk.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, display: 'flex' }} title="Remove passkey">
                      <Icon name="trash" size={13} color="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div><label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 4 }}>Passkey name (optional)</label>
                <input type="text" value={newPasskeyName} onChange={e => setNewPasskeyName(e.target.value)} placeholder="iCloud Keychain" style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' }} /></div>
              {passkeyError && <p style={{ margin: 0, fontSize: 11, color: 'var(--crit)', fontFamily: 'var(--font-sans)' }}>{passkeyError}</p>}
              <button type="button" onClick={handleRegisterPasskey} disabled={passkeyRegLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 3, background: 'none', border: ruleStrong, fontSize: 12, color: 'var(--fg-3)', cursor: passkeyRegLoading ? 'default' : 'pointer', fontFamily: 'var(--font-sans)', opacity: passkeyRegLoading ? 0.7 : 1, width: 'fit-content' }}>
                {passkeyRegLoading ? <Loader size={13} className="animate-spin" /> : <Icon name="fingerprint" size={13} color="currentColor" />}
                {passkeys.length > 0 ? 'Add Another Passkey' : 'Register Passkey'}
              </button>
            </div>
          </div>

          {/* API Tokens */}
          <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="key" size={14} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>API Tokens</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>For Chronos and other clients</span>
            </div>
            {revealedToken && (
              <div style={{ background: 'rgba(240,168,58,0.06)', border: '1px solid rgba(240,168,58,0.3)', borderRadius: 3, padding: 10, marginBottom: 10 }}>
                <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>Copy this token now — it won't be shown again.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <code style={{ flex: 1, fontSize: 11, color: 'var(--fg)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{revealedToken}</code>
                  <button onClick={handleCopyToken} style={{ background: 'none', border: 'none', cursor: 'pointer', color: tokenCopied ? 'var(--ok)' : 'var(--fg-3)', padding: 0, display: 'flex', flexShrink: 0 }} title="Copy">
                    <Icon name={tokenCopied ? 'check' : 'copy'} size={13} color="currentColor" />
                  </button>
                  <button onClick={() => setRevealedToken(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, display: 'flex', flexShrink: 0 }} title="Dismiss">
                    <Icon name="x" size={13} color="currentColor" />
                  </button>
                </div>
              </div>
            )}
            {apiTokens.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                {apiTokens.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'var(--bg)', border: ruleStrong, borderRadius: 3 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</p>
                      <p style={{ margin: 0, fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
                        srph_{t.prefix}… {t.last_used_at ? `· last used ${new Date(t.last_used_at).toLocaleDateString()}` : '· never used'}
                      </p>
                    </div>
                    <button onClick={() => handleRevokeToken(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, display: 'flex', flexShrink: 0 }} title="Revoke token">
                      <Icon name="trash" size={13} color="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={newTokenName} onChange={e => setNewTokenName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleGenerateToken()}
                placeholder='Token name (e.g. "Chronos — Laptop")'
                style={{ flex: 1, background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none' }}
              />
              <button onClick={handleGenerateToken} disabled={tokenGenerating || !newTokenName.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 3, background: 'var(--accent)', color: '#0d0c0a', border: 'none', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: (tokenGenerating || !newTokenName.trim()) ? 'default' : 'pointer', opacity: (tokenGenerating || !newTokenName.trim()) ? 0.5 : 1, flexShrink: 0 }}
              >
                {tokenGenerating ? <Loader size={13} className="animate-spin" /> : <Icon name="key" size={13} color="currentColor" />} Generate
              </button>
            </div>
            {apiTokens.length === 0 && !revealedToken && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textAlign: 'center' }}>No tokens yet. Generate one to connect Chronos.</p>
            )}
          </div>

          {/* User management (admin only) */}
          {currentUser?.role === 'admin' ? (
            <>
              <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <UserPlus size={14} color="var(--accent)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Create User</span>
                </div>
                <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 4 }}>First Name</label>
                      <input type="text" value={newFirstName} onChange={e => setNewFirstName(e.target.value)} required placeholder="Jane" style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' }} /></div>
                    <div><label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 4 }}>Last Name</label>
                      <input type="text" value={newLastName} onChange={e => setNewLastName(e.target.value)} required placeholder="Doe" style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' }} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div><label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 4 }}>Username</label>
                      <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' }} /></div>
                    <div style={{ position: 'relative' }}>
                      <label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 4 }}>Password</label>
                      <input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 28px 6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                      <button type="button" onClick={() => setShowNewPw(v => !v)} style={{ position: 'absolute', right: 6, top: 26, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, display: 'flex' }}>
                        <Icon name={showNewPw ? 'eye_off' : 'eye'} size={12} color="currentColor" />
                      </button>
                    </div>
                    <div><label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 4 }}>Role</label>
                      <select value={newRole} onChange={e => setNewRole(e.target.value as 'admin' | 'analyst')} style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%' }}>
                        <option value="analyst">Analyst</option>
                        <option value="admin">Admin</option>
                      </select></div>
                  </div>
                  {userError && <p style={{ margin: 0, fontSize: 11, color: 'var(--crit)', fontFamily: 'var(--font-sans)' }}>{userError}</p>}
                  <button type="submit" disabled={userSaving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 3, background: 'var(--accent)', color: '#0d0c0a', border: 'none', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: userSaving ? 'default' : 'pointer', opacity: userSaving ? 0.7 : 1, width: 'fit-content' }}>
                    {userSaving ? <Loader size={13} className="animate-spin" /> : <UserPlus size={13} />} Create User
                  </button>
                </form>
              </div>

              <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Users size={14} color="var(--accent)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>All Users ({userList.length})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {userList.map(u => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', border: ruleStrong, borderRadius: 3 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'rgba(240,168,58,0.1)', border: '1px solid rgba(240,168,58,0.2)' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{(u.full_name || u.username)[0].toUpperCase()}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>{u.full_name || u.username}</span>
                          {u.full_name && <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>@{u.username}</span>}
                          {u.id === currentUser?.id && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, color: 'var(--accent)', background: 'rgba(240,168,58,0.1)', border: '1px solid rgba(240,168,58,0.25)', fontFamily: 'var(--font-sans)' }}>you</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, textTransform: 'capitalize', fontFamily: 'var(--font-sans)', color: u.role === 'admin' ? 'var(--accent)' : 'var(--fg-3)', background: u.role === 'admin' ? 'rgba(240,168,58,0.1)' : 'rgba(100,116,139,0.1)', border: u.role === 'admin' ? '1px solid rgba(240,168,58,0.25)' : '1px solid rgba(100,116,139,0.2)' }}>
                            <ShieldCheck size={9} style={{ display: 'inline', marginRight: 2 }} />{u.role}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>joined {new Date(u.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => handleDeleteUser(u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, display: 'flex', flexShrink: 0 }} title="Delete user">
                          <Icon name="trash" size={14} color="currentColor" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 16, fontSize: 13, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
              User management is only available to administrators.
            </div>
          )}
        </div>
      )}

      {activeTab === 'profiles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
            Scan profiles save your preferred audit configurations for quick reuse in the Audit Builder.
          </p>
          {profiles.length === 0 ? (
            <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: '48px 24px', textAlign: 'center' }}>
              <Icon name="terminal" size={36} color="var(--rule-strong)" />
              <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>No saved profiles yet.</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Generate a script in Audit Builder and save the configuration as a profile.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {profiles.map(profile => {
                let cats: any[] = []
                try { cats = JSON.parse(profile.scan_categories) } catch {}
                return (
                  <div key={profile.id} style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>{profile.name}</div>
                      {profile.description && <div style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>{profile.description}</div>}
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        {cats.map((c: any) => (
                          <span key={c.category_id} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 3, color: 'var(--fg-3)', border: ruleStrong, background: 'var(--bg)', fontFamily: 'var(--font-sans)' }}>
                            {c.category_id?.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => deleteProfile(profile.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, display: 'flex', flexShrink: 0 }} title="Delete profile">
                      <Icon name="trash" size={15} color="currentColor" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      {activeTab === 'appearance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
          <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Monitor size={14} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Color Theme</span>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
              Choose a visual theme. Functional colors (severity, status, terminal) are preserved in all themes.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Cyber Blue */}
              <button onClick={() => setTheme('blue')} style={{ borderRadius: 4, border: theme === 'blue' ? '2px solid var(--accent)' : ruleStrong, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', background: 'none', padding: 0 }}>
                <div style={{ height: 96, position: 'relative', background: '#05080d' }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(6,182,212,0.06) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 36, background: '#090d14', borderRight: '1px solid rgba(6,182,212,0.15)' }}>
                    {[0,1,2,3].map(i => <div key={i} style={{ margin: '5px 5px', height: 5, borderRadius: 2, background: i === 0 ? 'rgba(6,182,212,0.4)' : 'rgba(148,163,184,0.15)' }} />)}
                  </div>
                  <div style={{ position: 'absolute', left: 44, top: 6, right: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ height: 16, borderRadius: 3, background: 'rgba(9,13,20,0.8)', border: '1px solid rgba(6,182,212,0.12)' }} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <div style={{ flex: 1, height: 40, borderRadius: 3, background: 'rgba(9,13,20,0.8)', border: '1px solid rgba(6,182,212,0.12)', padding: 5 }}>
                        <div style={{ height: 5, width: '50%', borderRadius: 2, background: '#06b6d4', opacity: 0.5 }} />
                      </div>
                      <div style={{ flex: 1, height: 40, borderRadius: 3, background: 'rgba(9,13,20,0.8)', border: '1px solid rgba(6,182,212,0.12)', padding: 5 }}>
                        <div style={{ height: 5, width: '33%', borderRadius: 2, background: '#3b82f6', opacity: 0.5 }} />
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#090d14' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', fontFamily: 'var(--font-sans)' }}>Cyber Blue</div>
                    <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'var(--font-sans)' }}>Cyan + dark blue accents</div>
                  </div>
                  {theme === 'blue' && <CheckCircle size={14} color="#22d3ee" />}
                </div>
              </button>

              {/* Monochrome */}
              <button onClick={() => setTheme('mono')} style={{ borderRadius: 4, border: theme === 'mono' ? '2px solid rgba(255,255,255,0.4)' : ruleStrong, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', background: 'none', padding: 0 }}>
                <div style={{ height: 96, position: 'relative', background: '#080808' }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 36, background: '#111', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                    {[0,1,2,3].map(i => <div key={i} style={{ margin: '5px 5px', height: 5, borderRadius: 2, background: i === 0 ? 'rgba(212,212,216,0.6)' : 'rgba(148,163,184,0.12)' }} />)}
                  </div>
                  <div style={{ position: 'absolute', left: 44, top: 6, right: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ height: 16, borderRadius: 3, background: 'rgba(17,17,17,0.88)', border: '1px solid rgba(255,255,255,0.07)' }} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <div style={{ flex: 1, height: 40, borderRadius: 3, background: 'rgba(17,17,17,0.88)', border: '1px solid rgba(255,255,255,0.07)', padding: 5 }}>
                        <div style={{ height: 5, width: '50%', borderRadius: 2, background: '#d4d4d8', opacity: 0.4 }} />
                      </div>
                      <div style={{ flex: 1, height: 40, borderRadius: 3, background: 'rgba(17,17,17,0.88)', border: '1px solid rgba(255,255,255,0.07)', padding: 5 }}>
                        <div style={{ height: 5, width: '33%', borderRadius: 2, background: '#a1a1aa', opacity: 0.4 }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
                  </div>
                </div>
                <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', fontFamily: 'var(--font-sans)' }}>Monochrome</div>
                    <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'var(--font-sans)' }}>Black, white, gray — status colors preserved</div>
                  </div>
                  {theme === 'mono' && <CheckCircle size={14} color="#d4d4d8" />}
                </div>
              </button>
            </div>

            <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
              Theme saved locally. Green, amber, red, and orange always indicate severity and status.
            </p>
          </div>

          {currentUser?.role === 'admin' && (
            <div style={{ background: 'var(--bg-2)', border: '1px solid rgba(240,168,58,0.2)', borderRadius: 4, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <FlaskConical size={14} color="var(--accent)" />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Demo Data</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, color: 'var(--accent)', background: 'rgba(240,168,58,0.1)', border: '1px solid rgba(240,168,58,0.25)', fontFamily: 'var(--font-sans)' }}>Admin only</span>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
                Populate the platform with three realistic demo projects — external pentest, web app audit, and internal network assessment — with targets, findings, credentials, and vulnerabilities. Turning off removes all demo data cleanly.
              </p>
              {demoError && <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--crit)', fontFamily: 'var(--font-sans)' }}>{demoError}</p>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  {demoActive ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-sans)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px rgba(240,168,58,0.8)' }} />
                      Demo mode active — 3 projects seeded
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>Demo mode off</span>
                  )}
                </div>
                <button onClick={handleDemoToggle} disabled={demoLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 3, fontSize: 12, fontFamily: 'var(--font-sans)', cursor: demoLoading ? 'default' : 'pointer', opacity: demoLoading ? 0.7 : 1, background: demoActive ? 'rgba(232,64,64,0.08)' : 'rgba(240,168,58,0.08)', color: demoActive ? 'var(--crit)' : 'var(--accent)', border: demoActive ? '1px solid rgba(232,64,64,0.3)' : '1px solid rgba(240,168,58,0.3)' }}
                >
                  {demoLoading ? <Loader size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                  {demoLoading ? (demoActive ? 'Clearing...' : 'Seeding...') : (demoActive ? 'Clear Demo Data' : 'Load Demo Data')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'webhooks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Icon name="zap" size={14} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>Add Webhook</span>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
              Send HTTP POST notifications to Slack, Discord, or any custom endpoint when events occur.
            </p>
            {webhookError && <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--crit)', fontFamily: 'var(--font-sans)' }}>{webhookError}</p>}
            <form onSubmit={handleCreateWebhook} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 4 }}>Name</label>
                  <input placeholder="Slack alerts" value={webhookForm.name} onChange={e => setWebhookForm(f => ({ ...f, name: e.target.value }))} style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' }} /></div>
                <div><label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 4 }}>URL</label>
                  <input placeholder="https://hooks.slack.com/..." value={webhookForm.url} onChange={e => setWebhookForm(f => ({ ...f, url: e.target.value }))} style={{ background: 'var(--bg)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 12, color: 'var(--fg)', fontFamily: 'var(--font-mono)', outline: 'none', width: '100%', boxSizing: 'border-box' }} /></div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 6 }}>Events</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['critical', 'warning', 'info', 'all'] as const).map(ev => {
                    const on = webhookForm.events.includes(ev)
                    const col = ev === 'critical' ? 'var(--crit)' : ev === 'warning' ? 'var(--accent)' : ev === 'info' ? '#60a5fa' : '#22d3ee'
                    return (
                      <button key={ev} type="button" onClick={() => toggleWebhookEvent(ev)}
                        style={{ padding: '3px 10px', borderRadius: 3, fontSize: 11, fontFamily: 'var(--font-sans)', textTransform: 'capitalize', cursor: 'pointer', background: on ? `${col}18` : 'none', color: on ? col : 'var(--fg-3)', border: on ? `1px solid ${col}55` : ruleStrong }}
                      >{ev}</button>
                    )
                  })}
                </div>
              </div>
              <button type="submit" disabled={webhookSaving}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 3, background: 'var(--accent)', color: '#0d0c0a', border: 'none', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: webhookSaving ? 'default' : 'pointer', opacity: webhookSaving ? 0.7 : 1, width: 'fit-content' }}
              >
                {webhookSaving ? 'Saving...' : 'Add Webhook'}
              </button>
            </form>
          </div>

          {webhooks.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>No webhooks configured.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {webhooks.map(wh => (
                <div key={wh.id} style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 4, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wh.name}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, fontFamily: 'var(--font-sans)', color: wh.active ? 'var(--ok)' : 'var(--fg-3)', background: wh.active ? 'rgba(84,175,97,0.08)' : 'rgba(100,116,139,0.08)', border: wh.active ? '1px solid rgba(84,175,97,0.3)' : '1px solid rgba(100,116,139,0.2)' }}>{wh.active ? 'active' : 'paused'}</span>
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wh.url}</p>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {wh.events.map(ev => {
                        const col = ev === 'critical' ? 'var(--crit)' : ev === 'warning' ? 'var(--accent)' : ev === 'info' ? '#60a5fa' : '#22d3ee'
                        return <span key={ev} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, fontFamily: 'var(--font-sans)', color: col, background: `${col}18`, border: `1px solid ${col}55` }}>{ev}</span>
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => handleTestWebhook(wh.id)} disabled={webhookTestId === wh.id}
                      style={{ padding: '4px 8px', borderRadius: 3, fontSize: 11, fontFamily: 'var(--font-sans)', border: ruleStrong, background: 'none', color: webhookTestId === wh.id ? 'var(--ok)' : 'var(--fg-3)', cursor: webhookTestId === wh.id ? 'default' : 'pointer' }}
                    >{webhookTestId === wh.id ? '✓ Sent' : 'Test'}</button>
                    <button onClick={() => handleToggleWebhook(wh.id, !wh.active)}
                      style={{ padding: '4px 8px', borderRadius: 3, fontSize: 11, fontFamily: 'var(--font-sans)', border: ruleStrong, background: 'none', color: 'var(--fg-3)', cursor: 'pointer' }}
                    >{wh.active ? 'Pause' : 'Resume'}</button>
                    <button onClick={() => handleDeleteWebhook(wh.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, display: 'flex' }}>
                      <Icon name="trash" size={14} color="currentColor" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tool info modal */}
      {infoTool && (() => {
        const data = TOOL_INFO[infoTool]
        const entry = toolStatus[infoTool]
        if (!data) return null
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }} onClick={() => setInfoTool(null)}>
            <div style={{ width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', border: ruleStrong, borderRadius: 6, boxShadow: '0 8px 40px rgba(0,0,0,0.6)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: rule, flexShrink: 0 }}>
                <Info size={15} color="var(--accent)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{entry?.label || infoTool}</span>
                    {entry?.available
                      ? <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, color: 'var(--ok)', background: 'rgba(84,175,97,0.1)', border: '1px solid rgba(84,175,97,0.3)', fontFamily: 'var(--font-sans)' }}>installed</span>
                      : <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, color: 'var(--crit)', background: 'rgba(232,64,64,0.1)', border: '1px solid rgba(232,64,64,0.3)', fontFamily: 'var(--font-sans)' }}>not installed</span>
                    }
                  </div>
                  {entry?.version && <div style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 2, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.version}</div>}
                </div>
                {entry?.url && <a href={entry.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fg-3)', display: 'flex' }} title="Official website"><ExternalLink size={13} /></a>}
                <button onClick={() => setInfoTool(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, display: 'flex' }}>
                  <Icon name="x" size={15} color="currentColor" />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--fg)', fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}>{data.description}</p>

                {data.usedIn.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Used in Seraph</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {data.usedIn.map((u, i) => {
                        const fs = FEATURE_STYLES[u.feature] ?? { color: 'var(--fg-3)', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)' }
                        return (
                          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 3, fontFamily: 'var(--font-sans)', color: fs.color, background: fs.background, border: fs.border }}>{u.feature}</span>
                            <span style={{ fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}>{u.detail}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {!entry?.available && entry?.install_hint && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Install</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <code style={{ flex: 1, background: 'var(--bg-2)', border: ruleStrong, borderRadius: 3, padding: '6px 10px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg)', wordBreak: 'break-all' }}>{entry.install_hint}</code>
                      <button onClick={() => copyText(entry.install_hint!, `info-${infoTool}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === `info-${infoTool}` ? 'var(--ok)' : 'var(--fg-3)', padding: 0, flexShrink: 0, display: 'flex' }}>
                        <Icon name={copied === `info-${infoTool}` ? 'check' : 'copy'} size={13} color="currentColor" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding: '10px 18px', borderTop: rule, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                {entry?.url ? (
                  <a href={entry.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', textDecoration: 'none' }}>
                    <ExternalLink size={11} /> Official website
                  </a>
                ) : <div />}
                {!entry?.available && (
                  <button onClick={() => { setInfoTool(null); startInstall(infoTool) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 3, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', fontSize: 11, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}
                  ><Icon name="download" size={11} color="currentColor" /> Install now</button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Install modal */}
      {installTool && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}>
          <div style={{ width: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', border: ruleStrong, borderRadius: 6, boxShadow: '0 8px 40px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: rule, flexShrink: 0 }}>
              <Icon name="terminal" size={15} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-sans)' }}>
                Installing <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{toolStatus[installTool]?.label || installTool}</span>
              </span>
              {installDone && (
                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 3, color: 'var(--ok)', background: 'rgba(84,175,97,0.1)', border: '1px solid rgba(84,175,97,0.3)', fontFamily: 'var(--font-sans)' }}>Done</span>
              )}
              <button onClick={() => setInstallTool(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0, display: 'flex' }}>
                <Icon name="x" size={15} color="currentColor" />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', minHeight: 200, background: 'var(--bg-2)' }}>
              {installLines.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-3)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
                  <Loader size={13} className="animate-spin" /> Connecting…
                </div>
              ) : (
                <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{installLines.join('')}</pre>
              )}
            </div>
            {installDone && (
              <div style={{ padding: '10px 18px', borderTop: rule, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                <button onClick={() => setInstallTool(null)}
                  style={{ padding: '6px 16px', borderRadius: 3, background: 'var(--accent)', color: '#0d0c0a', border: 'none', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: 'pointer' }}
                >Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
