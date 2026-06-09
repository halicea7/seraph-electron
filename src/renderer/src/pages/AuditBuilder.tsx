import { useState, useEffect } from 'react'
import Icon from '../components/Icon'
import { getTargets } from '../api/client'
import type { TargetSummary, ScanCategory } from '../types'
import { useAppStore } from '@/stores/appStore'
import { getApiBase } from '@/lib/config'

// ── Constants ─────────────────────────────────────────────────────────────────

const rule = '1px solid var(--rule)'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CisControl {
  id: string
  code: string
  title: string
  sev: string
  state: 'pass' | 'warn' | 'fail'
  rationale?: string
  audit_cmd?: string[]
  audit_expected?: string
  remediation?: string[]
}

interface Profile {
  id: string
  name: string
  description: string
  scan_categories: Array<{ category_id: string; config: Record<string, unknown> }>
  schedule: string | null
  last_run: string | null
  next_run: string | null
}

// ── Static fallback data ──────────────────────────────────────────────────────

type BenchmarkEntry = { id: string; label: string; controls: number | string; sel: number | string }

const STATIC_BENCHMARKS: BenchmarkEntry[] = [
  { id: 'cis-l1',  label: 'CIS Ubuntu 22.04 L1',        controls: 274, sel: 198 },
  { id: 'cis-l2',  label: 'CIS Ubuntu 22.04 L2',        controls: 312, sel: 0   },
  { id: 'nist',    label: 'NIST 800-53 r5 · Moderate',  controls: 158, sel: 0   },
  { id: 'cis-win', label: 'CIS Win Server 2019 L1',      controls: 376, sel: 0   },
  { id: 'lynis',   label: 'Lynis · audit system',        controls: '—', sel: '—' },
]

const STATIC_TARGETS_DEMO = ['app-01', 'app-02', 'db-01', 'redis-01']

const BENCH_CONTROLS: Record<string, CisControl[]> = {
  'cis-l1': [
    {
      id: 'l1-1', code: '1.1.1.1', title: 'Ensure mounting of cramfs is disabled', sev: 'Medium', state: 'pass',
      rationale: 'The cramfs filesystem type is not required for normal operation. Disabling it reduces the attack surface against kernel filesystem vulnerabilities.',
      audit_cmd: ['modprobe -n -v cramfs', 'lsmod | grep cramfs'],
      audit_expected: 'install /bin/true (modprobe output); no output from lsmod',
      remediation: [
        'echo "install cramfs /bin/true" >> /etc/modprobe.d/CIS.conf',
        'rmmod cramfs 2>/dev/null || true',
      ],
    },
    {
      id: 'l1-2', code: '1.4.1', title: 'Ensure bootloader password is set', sev: 'High', state: 'fail',
      rationale: 'Without a GRUB password, any user with physical access can boot into single-user mode or modify kernel parameters to bypass authentication.',
      audit_cmd: ['grep "^set superusers" /boot/grub/grub.cfg', 'grep "^password" /boot/grub/grub.cfg'],
      audit_expected: 'Both lines should be present with non-empty values',
      remediation: [
        'grub-mkpasswd-pbkdf2   # copy hash output',
        '# Add to /etc/grub.d/40_custom:',
        'set superusers="root"',
        'password_pbkdf2 root <hash>',
        'update-grub',
      ],
    },
    {
      id: 'l1-3', code: '3.1.1', title: 'Ensure source-routed packets are not accepted', sev: 'Medium', state: 'pass',
      rationale: 'Source-routed packets allow the sender to specify the route, enabling traffic to bypass firewall rules and network monitoring controls.',
      audit_cmd: ['sysctl net.ipv4.conf.all.accept_source_route', 'sysctl net.ipv4.conf.default.accept_source_route'],
      audit_expected: 'net.ipv4.conf.all.accept_source_route = 0\nnet.ipv4.conf.default.accept_source_route = 0',
      remediation: [
        'sysctl -w net.ipv4.conf.all.accept_source_route=0',
        'sysctl -w net.ipv4.conf.default.accept_source_route=0',
        'echo "net.ipv4.conf.all.accept_source_route = 0" >> /etc/sysctl.d/99-cis.conf',
      ],
    },
    {
      id: 'l1-4', code: '5.2.5', title: 'Ensure SSH PermitRootLogin is disabled', sev: 'High', state: 'fail',
      rationale: 'Disabling root login over SSH narrows the attack surface considerably. Privileged operations should be performed through sudo by named users, leaving an auditable trail.',
      audit_cmd: ['grep "^PermitRootLogin" /etc/ssh/sshd_config'],
      audit_expected: 'PermitRootLogin no',
      remediation: [
        "sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config",
        'systemctl reload sshd',
      ],
    },
    {
      id: 'l1-5', code: '5.4.1', title: 'Ensure password expiration ≤ 365 days', sev: 'Medium', state: 'warn',
      rationale: 'Enforcing periodic password changes limits the window of opportunity for compromised credentials to be exploited.',
      audit_cmd: ['grep "^PASS_MAX_DAYS" /etc/login.defs', "awk -F: '($5 > 365) {print $1, $5}' /etc/shadow"],
      audit_expected: 'PASS_MAX_DAYS 365 (or lower); no users with expiry > 365',
      remediation: [
        "sed -i 's/^PASS_MAX_DAYS.*/PASS_MAX_DAYS 365/' /etc/login.defs",
        '# For existing users: chage --maxdays 365 <username>',
      ],
    },
    {
      id: 'l1-6', code: '6.1.1', title: 'Audit system file permissions', sev: 'Low', state: 'pass',
      rationale: 'Incorrect file permissions on system files can allow unprivileged users to read sensitive configuration or escalate privileges.',
      audit_cmd: ['dpkg --verify 2>&1 | grep -v "^$"', 'find /etc -maxdepth 1 -perm /o+w -ls'],
      audit_expected: 'No output from dpkg --verify; no world-writable files in /etc',
      remediation: [
        '# Reinstall affected packages to restore permissions:',
        "dpkg --verify | awk '{print $NF}' | xargs dpkg -S | cut -d: -f1 | sort -u | xargs apt-get install --reinstall",
      ],
    },
    {
      id: 'l1-7', code: '4.1.4', title: 'Ensure events that modify date/time are collected', sev: 'Medium', state: 'fail',
      rationale: 'Unauthorised date/time changes can be used to cover tracks or manipulate log timestamps, undermining forensic integrity.',
      audit_cmd: ['grep time-change /etc/audit/audit.rules', 'auditctl -l | grep time-change'],
      audit_expected: 'Rules for adjtimex, settimeofday, stime, clock_settime, and /etc/localtime present',
      remediation: [
        '# Add to /etc/audit/audit.rules:',
        '-a always,exit -F arch=b64 -S adjtimex -S settimeofday -k time-change',
        '-a always,exit -F arch=b32 -S adjtimex -S settimeofday -S stime -k time-change',
        '-a always,exit -F arch=b64 -S clock_settime -k time-change',
        '-w /etc/localtime -p wa -k time-change',
        'service auditd restart',
      ],
    },
  ],

  'cis-l2': [
    {
      id: 'l2-1', code: '1.8.1', title: 'Ensure GNOME Display Manager is not installed', sev: 'Medium', state: 'pass',
      rationale: 'A GUI desktop environment is not required on a server and increases the attack surface. GDM3 ships with browser integration and additional D-Bus services that should not be present on hardened systems.',
      audit_cmd: ['dpkg -l gdm3 | grep -E "^ii"'],
      audit_expected: 'No output — package should not be installed',
      remediation: ['apt purge gdm3 -y', 'apt autoremove -y'],
    },
    {
      id: 'l2-2', code: '2.2.1', title: 'Ensure time synchronization is configured', sev: 'Medium', state: 'pass',
      rationale: 'Accurate time is required for log correlation, Kerberos authentication, and certificate validation. Unsynchronised clocks skew audit trails and can enable replay attacks.',
      audit_cmd: ['systemctl is-enabled systemd-timesyncd', 'timedatectl show | grep NTPSynchronized'],
      audit_expected: 'enabled; NTPSynchronized=yes',
      remediation: [
        'systemctl enable --now systemd-timesyncd',
        'timedatectl set-ntp true',
      ],
    },
    {
      id: 'l2-3', code: '3.5.1', title: 'Ensure DCCP is disabled', sev: 'Low', state: 'pass',
      rationale: 'DCCP (Datagram Congestion Control Protocol) is an unused transport layer protocol. Loading unused kernel modules increases the risk of kernel-level exploitation.',
      audit_cmd: ['modprobe -n -v dccp', 'lsmod | grep dccp'],
      audit_expected: 'install /bin/true; no lsmod output',
      remediation: [
        'echo "install dccp /bin/true" >> /etc/modprobe.d/CIS.conf',
        'rmmod dccp 2>/dev/null || true',
      ],
    },
    {
      id: 'l2-4', code: '4.1.1', title: 'Ensure auditd is installed', sev: 'High', state: 'fail',
      rationale: 'auditd provides the Linux kernel audit framework. Without it, no kernel-level syscall auditing is available, making intrusion detection and forensic reconstruction impossible.',
      audit_cmd: ['dpkg -l auditd | grep "^ii"', 'systemctl is-enabled auditd'],
      audit_expected: 'Package present and service enabled',
      remediation: [
        'apt install auditd audispd-plugins -y',
        'systemctl enable --now auditd',
      ],
    },
    {
      id: 'l2-5', code: '5.3.4', title: 'Ensure password creation requirements are configured', sev: 'High', state: 'warn',
      rationale: 'Weak password policies allow users to set trivially guessable passwords. pam_pwquality enforces minimum complexity rules at the PAM layer before credentials are stored.',
      audit_cmd: ['grep -E "^minlen|^minclass|^dcredit|^ucredit|^ocredit|^lcredit" /etc/security/pwquality.conf'],
      audit_expected: 'minlen=14, minclass=4 (or equivalent credit values)',
      remediation: [
        '# /etc/security/pwquality.conf:',
        'minlen = 14',
        'dcredit = -1',
        'ucredit = -1',
        'ocredit = -1',
        'lcredit = -1',
      ],
    },
    {
      id: 'l2-6', code: '1.6.1', title: 'Ensure core dumps are restricted', sev: 'Medium', state: 'fail',
      rationale: 'Core dumps may contain sensitive information such as passwords, encryption keys, or session tokens. Restricting them prevents unprivileged users from extracting process memory.',
      audit_cmd: ['grep "hard core" /etc/security/limits.conf /etc/security/limits.d/*', 'sysctl fs.suid_dumpable'],
      audit_expected: '* hard core 0; fs.suid_dumpable = 0',
      remediation: [
        'echo "* hard core 0" >> /etc/security/limits.conf',
        'echo "fs.suid_dumpable = 0" >> /etc/sysctl.d/99-cis.conf',
        'sysctl -w fs.suid_dumpable=0',
      ],
    },
    {
      id: 'l2-7', code: '6.2.8', title: 'Ensure users\' home directories are not group-writable', sev: 'Medium', state: 'pass',
      rationale: 'Group-writable home directories allow members of the same group to modify or plant files in another user\'s home directory, enabling privilege escalation or session hijacking.',
      audit_cmd: ["awk -F: '($3 >= 1000 && $7 != \"/usr/sbin/nologin\") {print $6}' /etc/passwd | xargs -I{} stat -c '%n %a' {}"],
      audit_expected: 'No directory with mode containing group-write (g+w)',
      remediation: [
        '# For each offending directory:',
        'chmod g-w /home/<user>',
      ],
    },
  ],

  'nist': [
    {
      id: 'nist-1', code: 'AC-2', title: 'Account Management', sev: 'High', state: 'warn',
      rationale: 'Proper account management ensures that only authorised individuals have access to the system and that inactive or unnecessary accounts are promptly disabled.',
      audit_cmd: ['awk -F: \'($3 >= 1000) {print $1, $3, $7}\' /etc/passwd', 'lastlog | awk \'NR>1 && $2=="**Never"\' | head -20'],
      audit_expected: 'No accounts inactive for more than 90 days; no unexpected UID ≥ 1000 accounts',
      remediation: [
        '# Disable dormant accounts:',
        'usermod --expiredate 1 <username>',
        '# Review accounts with shells:',
        "grep -E '/bash|/sh|/zsh' /etc/passwd",
      ],
    },
    {
      id: 'nist-2', code: 'AC-17', title: 'Remote Access controls', sev: 'High', state: 'fail',
      rationale: 'Remote access sessions must use encrypted channels, enforce MFA where possible, and be restricted to authorised users. Uncontrolled remote access is the most common initial access vector.',
      audit_cmd: ['sshd -T | grep -E "passwordauthentication|pubkeyauthentication|permitemptypasswords|protocol"'],
      audit_expected: 'PasswordAuthentication no, PubkeyAuthentication yes, PermitEmptyPasswords no',
      remediation: [
        "sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config",
        "sed -i 's/^#\\?PermitEmptyPasswords.*/PermitEmptyPasswords no/' /etc/ssh/sshd_config",
        'systemctl reload sshd',
      ],
    },
    {
      id: 'nist-3', code: 'AU-2', title: 'Event Logging', sev: 'High', state: 'fail',
      rationale: 'Audit logs are the primary evidence source for incident response. NIST requires logging of logons, privilege use, configuration changes, and object access at minimum.',
      audit_cmd: ['auditctl -l | wc -l', 'systemctl is-active auditd', 'grep "max_log_file " /etc/audit/auditd.conf'],
      audit_expected: '>20 active rules; auditd active; max_log_file ≥ 8',
      remediation: [
        'apt install auditd -y',
        'systemctl enable --now auditd',
        '# Apply NIST baseline rules:',
        'curl -o /etc/audit/rules.d/nist.rules https://github.com/linux-audit/audit-userspace/raw/master/rules/30-nist-800-171.rules',
        'augenrules --load',
      ],
    },
    {
      id: 'nist-4', code: 'CM-6', title: 'Configuration Settings', sev: 'Medium', state: 'warn',
      rationale: 'Systems must be configured using established security baselines. Deviations from the approved configuration baseline introduce unknown risk and must be tracked.',
      audit_cmd: ['debsums -c 2>/dev/null | head -20', "find /etc -newer /etc/passwd -not -name '*.dpkg*' -ls 2>/dev/null | head -20"],
      audit_expected: 'No unexpected package file modifications; no unaccounted /etc changes',
      remediation: [
        '# Restore modified package files:',
        "debsums -c | awk '{print $1}' | xargs dpkg -S | cut -d: -f1 | sort -u | xargs apt reinstall",
      ],
    },
    {
      id: 'nist-5', code: 'IA-5', title: 'Authenticator Management', sev: 'High', state: 'pass',
      rationale: 'Authenticators (passwords, keys, tokens) must meet complexity requirements, have defined lifetimes, and be protected from disclosure. Weak authenticator management is the leading cause of credential compromise.',
      audit_cmd: ['grep -E "^PASS_MIN_LEN|^PASS_MAX_DAYS|^PASS_WARN_AGE" /etc/login.defs', "awk -F: '($2 == \"\") {print $1}' /etc/shadow"],
      audit_expected: 'PASS_MIN_LEN ≥ 12; PASS_MAX_DAYS ≤ 90; no accounts with empty password hash',
      remediation: [
        "sed -i 's/^PASS_MAX_DAYS.*/PASS_MAX_DAYS 90/' /etc/login.defs",
        "sed -i 's/^PASS_MIN_LEN.*/PASS_MIN_LEN 14/' /etc/login.defs",
        '# Lock accounts with empty passwords:',
        "awk -F: '($2 == \"\") {print $1}' /etc/shadow | xargs -I{} passwd -l {}",
      ],
    },
    {
      id: 'nist-6', code: 'SC-28', title: 'Protection of Information at Rest', sev: 'High', state: 'fail',
      rationale: 'Sensitive data must be encrypted at rest to protect against physical theft or unauthorized access to storage media. Unencrypted /home and /var partitions expose credentials, logs, and application data.',
      audit_cmd: ['lsblk -o NAME,FSTYPE,MOUNTPOINT,SIZE', 'cryptsetup status /dev/mapper/* 2>/dev/null'],
      audit_expected: 'Sensitive mount points (/, /home, /var) should use LUKS encryption or equivalent',
      remediation: [
        '# Full disk encryption must be configured at install time via LUKS.',
        '# For existing systems, encrypt specific directories using eCryptfs:',
        'apt install ecryptfs-utils -y',
        'ecryptfs-migrate-home -u <username>',
      ],
    },
  ],

  'cis-win': [
    {
      id: 'win-1', code: '1.1.1', title: 'Ensure password history is configured (24+ passwords)', sev: 'Medium', state: 'warn',
      rationale: 'Password history prevents users from rotating through a small set of passwords and immediately reverting to a preferred insecure one.',
      audit_cmd: ['net accounts | findstr "Password history"', 'secedit /export /cfg C:\\secpol.cfg /areas SECURITYPOLICY && findstr "PasswordHistorySize" C:\\secpol.cfg'],
      audit_expected: 'PasswordHistorySize = 24',
      remediation: [
        '# Group Policy: Computer Config → Windows Settings → Security Settings → Account Policies → Password Policy',
        '# Enforce password history: 24 passwords remembered',
        '# Or via secedit:',
        'secedit /configure /db %windir%\\security\\new.sdb /cfg custom.inf /areas SECURITYPOLICY',
      ],
    },
    {
      id: 'win-2', code: '1.1.2', title: 'Ensure maximum password age is ≤ 365 days', sev: 'Medium', state: 'pass',
      rationale: 'Passwords that never expire remain valid indefinitely after compromise. Periodic forced rotation limits the window of credential exploitation.',
      audit_cmd: ['net accounts | findstr "Maximum password age"'],
      audit_expected: 'Maximum password age: 365 (or less)',
      remediation: [
        'net accounts /maxpwage:90',
        '# Or via GPO: Computer Config → Security Settings → Account Policies → Max Password Age = 90',
      ],
    },
    {
      id: 'win-3', code: '2.2.1', title: 'Ensure "Access Credential Manager as trusted caller" is denied', sev: 'High', state: 'pass',
      rationale: 'Credential Manager stores user credentials. Granting untrusted processes access allows them to extract stored passwords for lateral movement.',
      audit_cmd: ['secedit /export /cfg %temp%\\secpol.cfg /areas USER_RIGHTS', 'findstr "SeTrustedCredManAccessPrivilege" %temp%\\secpol.cfg'],
      audit_expected: 'SeTrustedCredManAccessPrivilege = (empty — no accounts assigned)',
      remediation: [
        '# GPO: Computer Config → Windows Settings → Security Settings → Local Policies → User Rights Assignment',
        '# "Access Credential Manager as a trusted caller" — set to: (no accounts)',
      ],
    },
    {
      id: 'win-4', code: '9.1.1', title: 'Ensure Windows Firewall (Domain) is enabled', sev: 'High', state: 'fail',
      rationale: 'The Windows Firewall provides host-based packet filtering. Disabling it on domain-joined machines eliminates a critical defense layer even when perimeter firewalls exist.',
      audit_cmd: ['netsh advfirewall show domainprofile state', 'Get-NetFirewallProfile -Profile Domain | Select Enabled'],
      audit_expected: 'State ON; Enabled: True',
      remediation: [
        'netsh advfirewall set domainprofile state on',
        '# Or PowerShell:',
        'Set-NetFirewallProfile -Profile Domain -Enabled True',
      ],
    },
    {
      id: 'win-5', code: '18.9.77', title: 'Ensure Windows Defender Antivirus is enabled', sev: 'High', state: 'pass',
      rationale: 'Windows Defender provides real-time malware detection. Disabling it — even temporarily — leaves the system exposed to known malware families that would otherwise be blocked on execution.',
      audit_cmd: ['Get-MpComputerStatus | Select AntivirusEnabled, RealTimeProtectionEnabled', 'sc query WinDefend'],
      audit_expected: 'AntivirusEnabled: True; RealTimeProtectionEnabled: True; WinDefend: RUNNING',
      remediation: [
        'Set-MpPreference -DisableRealtimeMonitoring $false',
        'Start-Service WinDefend',
      ],
    },
    {
      id: 'win-6', code: '17.1.1', title: 'Ensure Audit Credential Validation events are logged', sev: 'Medium', state: 'fail',
      rationale: 'Credential validation events capture authentication attempts against local accounts. Without this, brute-force and pass-the-hash attacks leave no trace in the Windows event log.',
      audit_cmd: ['auditpol /get /subcategory:"Credential Validation"'],
      audit_expected: 'Success and Failure',
      remediation: [
        'auditpol /set /subcategory:"Credential Validation" /success:enable /failure:enable',
      ],
    },
    {
      id: 'win-7', code: '2.3.7.2', title: 'Ensure interactive logon does not display last username', sev: 'Low', state: 'pass',
      rationale: 'Displaying the last logged-in username gives an attacker one half of the credential pair. Suppressing it forces the attacker to enumerate valid usernames separately.',
      audit_cmd: ['reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v DontDisplayLastUserName'],
      audit_expected: 'DontDisplayLastUserName    REG_DWORD    0x1',
      remediation: [
        'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v DontDisplayLastUserName /t REG_DWORD /d 1 /f',
      ],
    },
  ],

  'lynis': [
    {
      id: 'lynis-1', code: 'AUTH-9262', title: 'PAM password strength configuration', sev: 'High', state: 'warn',
      rationale: 'Lynis checks that pam_pwquality or pam_cracklib is active in the PAM stack and enforcing minimum complexity. Weak PAM configuration renders password policies ineffective.',
      audit_cmd: ['grep -r "pam_pwquality\\|pam_cracklib" /etc/pam.d/', 'cat /etc/security/pwquality.conf'],
      audit_expected: 'pam_pwquality.so present in common-password with minlen, dcredit, ucredit, ocredit, lcredit',
      remediation: [
        'apt install libpam-pwquality -y',
        '# In /etc/pam.d/common-password, add/update:',
        'password requisite pam_pwquality.so retry=3 minlen=14 dcredit=-1 ucredit=-1 lcredit=-1 ocredit=-1',
      ],
    },
    {
      id: 'lynis-2', code: 'BOOT-5122', title: 'GRUB2 password protection', sev: 'High', state: 'fail',
      rationale: 'Lynis checks for a GRUB superuser with a hashed password. Without it, anyone with physical access can pass kernel boot parameters (e.g. init=/bin/bash) to gain root without authentication.',
      audit_cmd: ['grep -E "^set superusers|^password_pbkdf2" /boot/grub/grub.cfg'],
      audit_expected: 'Both directives present with non-empty values',
      remediation: [
        'grub-mkpasswd-pbkdf2',
        '# Add to /etc/grub.d/40_custom:',
        'set superusers="admin"',
        'password_pbkdf2 admin <paste-hash-here>',
        'update-grub',
      ],
    },
    {
      id: 'lynis-3', code: 'FILE-6310', title: 'Umask hardening in /etc/profile', sev: 'Medium', state: 'pass',
      rationale: 'The default umask controls permissions on newly created files. A permissive umask (e.g. 022) may create world-readable files in shared directories, leaking sensitive data.',
      audit_cmd: ['grep umask /etc/profile /etc/profile.d/*.sh /etc/bash.bashrc 2>/dev/null'],
      audit_expected: 'umask 027 or stricter in at least one shell init file',
      remediation: [
        'echo "umask 027" >> /etc/profile.d/cis-umask.sh',
        'chmod 644 /etc/profile.d/cis-umask.sh',
      ],
    },
    {
      id: 'lynis-4', code: 'KRNL-5820', title: 'Sysctl hardening parameters', sev: 'Medium', state: 'fail',
      rationale: 'Lynis evaluates key kernel parameters against a hardening checklist. Misconfigured sysctl values leave the kernel susceptible to ARP spoofing, ICMP redirect attacks, and SYN flood amplification.',
      audit_cmd: [
        'sysctl kernel.randomize_va_space',
        'sysctl net.ipv4.tcp_syncookies',
        'sysctl net.ipv4.conf.all.rp_filter',
      ],
      audit_expected: 'randomize_va_space=2; tcp_syncookies=1; rp_filter=1',
      remediation: [
        '# Write to /etc/sysctl.d/99-hardening.conf:',
        'kernel.randomize_va_space = 2',
        'net.ipv4.tcp_syncookies = 1',
        'net.ipv4.conf.all.rp_filter = 1',
        'net.ipv4.conf.default.rp_filter = 1',
        'sysctl --system',
      ],
    },
    {
      id: 'lynis-5', code: 'SSH-7408', title: 'SSH configuration hardening', sev: 'High', state: 'warn',
      rationale: 'Lynis runs a comprehensive check of sshd_config against a set of known-good values. Weak algorithms, missing idle timeouts, and enabled root login are the most common deficiencies.',
      audit_cmd: ['sshd -T | grep -E "^(protocol|permitrootlogin|passwordauth|x11forwarding|clientaliveinterval|maxauthtries)"'],
      audit_expected: 'PermitRootLogin no, PasswordAuthentication no, X11Forwarding no, ClientAliveInterval ≤ 300',
      remediation: [
        '# /etc/ssh/sshd_config:',
        'PermitRootLogin no',
        'PasswordAuthentication no',
        'X11Forwarding no',
        'ClientAliveInterval 300',
        'ClientAliveCountMax 3',
        'MaxAuthTries 3',
        'systemctl reload sshd',
      ],
    },
    {
      id: 'lynis-6', code: 'MALW-3280', title: 'Malware scanner installed', sev: 'Medium', state: 'fail',
      rationale: 'Lynis checks for the presence of a malware scanner (rkhunter, chkrootkit, ClamAV, etc.). On Linux servers, malware scanners catch rootkits, webshells, and known malicious binaries.',
      audit_cmd: ['which rkhunter chkrootkit clamscan 2>/dev/null', 'dpkg -l | grep -E "rkhunter|clamav|chkrootkit"'],
      audit_expected: 'At least one scanner binary present and configured',
      remediation: [
        'apt install rkhunter -y',
        'rkhunter --update',
        'rkhunter --propupd',
        '# Schedule daily scan via cron:',
        'echo "0 3 * * * root rkhunter --check --skip-keypress --report-warnings-only" > /etc/cron.d/rkhunter',
      ],
    },
  ],
}

// ── Shared sub-components ─────────────────────────────────────────────────────

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

function SevBadge({ sev }: { sev: string }) {
  const color =
    sev === 'Critical' ? 'var(--crit)'
    : sev === 'High' ? 'var(--high)'
    : sev === 'Medium' ? 'var(--accent)'
    : 'var(--ok)'
  return (
    <span className="mono" style={{
      fontSize: 10, color,
      padding: '2px 6px',
      border: `1px solid ${color}`,
      background: `${color}18`,
    }}>{sev}</span>
  )
}

function StatePill({ state }: { state: 'pass' | 'warn' | 'fail' }) {
  const map = {
    pass: { color: 'var(--ok)',   bg: 'rgba(107,138,114,0.1)' },
    warn: { color: 'var(--high)', bg: 'rgba(240,168,58,0.1)' },
    fail: { color: 'var(--crit)', bg: 'rgba(232,92,78,0.1)' },
  }
  const s = map[state]
  return (
    <span className="mono" style={{
      fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em',
      padding: '1px 6px', color: s.color, background: s.bg,
      border: `1px solid ${s.color}33`,
    }}>{state}</span>
  )
}

function PageHeader({
  breadcrumb, title, sub, right,
}: {
  breadcrumb?: string
  title: string
  sub?: string
  right?: React.ReactNode
}) {
  return (
    <div style={{
      borderBottom: rule,
      padding: '24px var(--pad) 18px',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 16,
      flexShrink: 0,
    }}>
      <div>
        {breadcrumb && <div className="smcap" style={{ marginBottom: 6 }}>{breadcrumb}</div>}
        <h1 className="mono" style={{ margin: 0, fontWeight: 500, fontSize: 22, letterSpacing: '-0.01em' }}>{title}</h1>
        {sub && <div style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 6, maxWidth: 720 }}>{sub}</div>}
      </div>
      {right && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{right}</div>
      )}
    </div>
  )
}

// ── Control Detail pane ───────────────────────────────────────────────────────

function ControlDetail({ control }: { control: CisControl | null }) {
  if (!control) {
    return (
      <div style={{ background: 'var(--bg-2)', overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-4)' }}>select a control</span>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-2)', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '18px var(--pad)', borderBottom: rule }}>
        <div className="smcap">control · {control.code}</div>
        <h2 className="mono" style={{ margin: '6px 0 12px', fontWeight: 500, fontSize: 17, lineHeight: 1.3 }}>
          {control.title}
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <SevBadge sev={control.sev} />
          <StatePill state={control.state} />
        </div>
      </div>

      <div style={{ padding: 'var(--pad)' }}>
        {/* Rationale */}
        <div className="smcap" style={{ marginBottom: 8 }}>Rationale</div>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.65, marginTop: 0 }}>
          {control.rationale ?? 'No rationale available for this control.'}
        </p>

        {/* Audit commands */}
        {control.audit_cmd && control.audit_cmd.length > 0 && (
          <>
            <div className="smcap" style={{ margin: '14px 0 8px' }}>Audit command</div>
            <div className="term rule" style={{ padding: 10, fontSize: 11.5 }}>
              {control.audit_cmd.map((cmd, i) => (
                <div key={i}><span className="pr">$</span> {cmd}</div>
              ))}
              {control.audit_expected && (
                <div className="muted" style={{ marginTop: 6 }}>(expected: {control.audit_expected})</div>
              )}
            </div>
          </>
        )}

        {/* Remediation */}
        {control.remediation && control.remediation.length > 0 && (
          <>
            <div className="smcap" style={{ margin: '14px 0 8px' }}>Remediation</div>
            <div className="term rule" style={{ padding: 10, fontSize: 11.5 }}>
              {control.remediation.map((line, i) => (
                line.startsWith('#')
                  ? <div key={i} className="muted">{line}</div>
                  : <div key={i}><span className="pr">$</span> {line}</div>
              ))}
            </div>
          </>
        )}

        {/* Auto-pin */}
        <div className="rule" style={{ marginTop: 14, padding: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Icon name="bolt" size={14} color="var(--accent)" />
          <div style={{ flex: 1, fontSize: 12, color: 'var(--fg-2)' }}>
            Auto-pin a finding when this control fails. Failed controls aggregate into a{' '}
            <code className="mono">VulnerabilityRecord</code> tagged{' '}
            <code className="mono" style={{ color: 'var(--accent)' }}>compliance:cis</code>.
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg)', cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ width: 12, height: 12, accentColor: 'var(--accent)' }} />
            on
          </label>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AuditBuilder() {
  const { selectedProject: sp } = useAppStore()
  const projectId = sp?.id ?? ''

  // ── API / project state ─────────────────────────────────────────────────────
  const [targets, setTargets] = useState<TargetSummary[]>([])
  const [categories, setCategories] = useState<Record<string, ScanCategory>>({})
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [sshCredentials, setSshCredentials] = useState<Array<{ id: string; username: string; target_host: string; notes: string }>>([])
  const [scanId, setScanId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generatedScript, setGeneratedScript] = useState('')

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeBench, setActiveBench] = useState<string>('cis-l1')
  const [profileMode, setProfileMode] = useState<string>('Server')
  const [checkedTargets, setCheckedTargets] = useState<Set<string>>(new Set(STATIC_TARGETS_DEMO))
  const [controls, setControls] = useState<CisControl[]>(BENCH_CONTROLS['cis-l1'])
  const [benchmarks, setBenchmarks] = useState<BenchmarkEntry[]>(STATIC_BENCHMARKS)
  const [selectedControlId, setSelectedControlId] = useState<string>(BENCH_CONTROLS['cis-l1'][0].id)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [categoryConfigs, setCategoryConfigs] = useState<Record<string, Record<string, unknown>>>({})
  const [selectedTarget, setSelectedTarget] = useState<string>('')
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>('')
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [hardeningProfiles, setHardeningProfiles] = useState<Record<string, unknown>[]>([])
  const [complianceReport, setComplianceReport] = useState<Record<string, unknown> | null>(null)
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState('')
  const [selectedHardeningProfile, setSelectedHardeningProfile] = useState('cis_l1')
  const [toolStatus, setToolStatus] = useState<Record<string, { available: boolean }>>({})
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [showProfileSave, setShowProfileSave] = useState(false)
  const [scheduleCron, setScheduleCron] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)

  // ── CIS-CAT import ─────────────────────────────────────────────────────────
  const [showCiscatImport, setShowCiscatImport] = useState(false)
  const [ciscatFile, setCiscatFile] = useState<File | null>(null)
  const [ciscatTargetId, setCiscatTargetId] = useState('')
  const [ciscatImporting, setCiscatImporting] = useState(false)
  const [ciscatResult, setCiscatResult] = useState<{ imported: number; pass: number; fail: number; notapplicable: number } | null>(null)
  const [ciscatError, setCiscatError] = useState('')

  // ── Derived ─────────────────────────────────────────────────────────────────
  const REMOTE_CATEGORIES = new Set(['host_hardening', 'openscap', 'log_monitoring'])
  const needsSSH = [...selectedCategories].some(c => REMOTE_CATEGORIES.has(c))

  const pass  = controls.filter(c => c.state === 'pass').length
  const warn  = controls.filter(c => c.state === 'warn').length
  const fail  = controls.filter(c => c.state === 'fail').length
  const total = controls.length
  const pct   = total > 0 ? Math.round((pass / total) * 100) : 0

  const selectedControl = controls.find(c => c.id === selectedControlId) ?? null

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadCategories()
    loadToolStatus()
    loadProfiles()
    loadHardeningProfiles()
  }, [])

  useEffect(() => {
    if (projectId) {
      getTargets(projectId)
        .then(data => {
          setTargets(data)
          if (data.length > 0) setSelectedTarget(data[0].id)
        })
        .catch(err => console.error('Failed to load targets', err))

      fetch(`${getApiBase()}/credentials/keys?project_id=${projectId}`)
        .then(r => r.ok ? r.json() : [])
        .then(setSshCredentials)
        .catch(() => {})

      loadControlResults(projectId)
      loadBenchmarks(projectId)
    }
  }, [projectId])

  // ── Loaders ─────────────────────────────────────────────────────────────────
  async function loadCategories() {
    try {
      const res = await fetch(`${getApiBase()}/audit/categories`)
      const data = await res.json()
      setCategories(data)
      const defaults: Record<string, Record<string, unknown>> = {}
      for (const [id, cat] of Object.entries(data as Record<string, ScanCategory>)) {
        defaults[id] = {}
        for (const [key, schema] of Object.entries(cat.config_schema)) {
          defaults[id][key] = schema.default ?? ''
        }
      }
      setCategoryConfigs(defaults)
    } catch (err) { console.error('Failed to load categories', err) }
  }

  async function loadToolStatus() {
    try {
      const res = await fetch(`${getApiBase()}/settings/tools`)
      setToolStatus(await res.json())
    } catch { /* optional */ }
  }

  async function loadProfiles() {
    try {
      const res = await fetch(`${getApiBase()}/profiles`)
      if (res.ok) {
        const data = await res.json()
        const parsed = data.map((p: Record<string, unknown>) => ({
          ...p,
          scan_categories: typeof p.scan_categories === 'string'
            ? JSON.parse(p.scan_categories as string)
            : p.scan_categories,
        }))
        setProfiles(parsed)
      }
    } catch { /* ignore */ }
  }

  async function loadHardeningProfiles() {
    try {
      const res = await fetch(`${getApiBase()}/hardening/profiles`)
      if (res.ok) setHardeningProfiles(await res.json())
    } catch { /* ignore */ }
  }

  async function loadControlResults(pid: string) {
    try {
      const res = await fetch(`${getApiBase()}/audit/findings?project_id=${pid}`)
      if (!res.ok) return
      const findings: Array<{ severity: string; title: string; description?: string }> = await res.json()
      if (!findings.length) return

      // Map findings severity to control states
      setControls(prev => prev.map(ctrl => {
        const related = findings.filter(f =>
          f.title?.toLowerCase().includes(ctrl.title?.toLowerCase?.() ?? '') ||
          f.description?.toLowerCase().includes(ctrl.id?.toLowerCase?.() ?? '')
        )
        if (!related.length) return ctrl
        const hasCrit = related.some(f => f.severity === 'critical')
        const hasHigh  = related.some(f => f.severity === 'high')
        return {
          ...ctrl,
          state: hasCrit ? 'fail' : hasHigh ? 'warn' : ctrl.state,
        }
      }))
    } catch {
      // keep static data on error
    }
  }

  async function loadBenchmarks(pid: string) {
    try {
      // Try /audit/summary first, fall back to /audit/benchmarks
      let res = await fetch(`${getApiBase()}/audit/summary?project_id=${pid}`)
      if (!res.ok) {
        res = await fetch(`${getApiBase()}/audit/benchmarks?project_id=${pid}`)
      }
      if (!res.ok) return
      const data: Array<{ id: string; label: string; controls: number | string; sel: number | string }> = await res.json()
      if (!data.length) return
      setBenchmarks(data)
    } catch {
      // keep STATIC_BENCHMARKS on error
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!projectId || !selectedTarget || selectedCategories.size === 0) return
    setGenerating(true)
    try {
      const scanCategories = Array.from(selectedCategories).map(id => ({
        category_id: id, config: categoryConfigs[id] || {},
      }))
      const res = await fetch(`${getApiBase()}/audit/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId, target_id: selectedTarget,
          scan_categories: scanCategories,
          credential_id: needsSSH && selectedCredentialId ? selectedCredentialId : null,
        }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail ?? `HTTP ${res.status}`) }
      const data = await res.json()
      setGeneratedScript(data.script)
      setScanId(data.scan_id)
      setComplianceReport(null)
    } catch (err) { console.error('Script generation failed', err) }
    finally { setGenerating(false) }
  }

  async function handleDownload() {
    if (!scanId) return
    const res = await fetch(`${getApiBase()}/audit/script/${scanId}/download`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `seraph_audit_${scanId.slice(0, 8)}.sh`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportResults() {
    // Import results via file picker
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.jsonl'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !projectId) return
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project_id', projectId)
      try {
        await fetch(`${getApiBase()}/audit/import`, { method: 'POST', body: formData })
      } catch (err) { console.error('Import failed', err) }
    }
    input.click()
  }

  async function handleRunAudit() {
    if (!generatedScript && selectedCategories.size > 0) {
      await handleGenerate()
    }
  }

  async function handleScoreScan() {
    if (!scanId || !projectId) return
    setScoring(true); setScoreError('')
    try {
      const res = await fetch(`${getApiBase()}/hardening/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_id: scanId, profile_id: selectedHardeningProfile, project_id: projectId }),
      })
      if (!res.ok) { const err = await res.json(); setScoreError(err.detail || 'Scoring failed'); return }
      setComplianceReport(await res.json())
    } catch (e: unknown) {
      setScoreError(e instanceof Error ? e.message : 'Scoring failed')
    } finally { setScoring(false) }
  }

  async function handleSaveProfile() {
    if (!profileName.trim()) return
    setSavingProfile(true)
    try {
      await fetch(`${getApiBase()}/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName.trim(),
          description: `Saved from Audit Builder — ${Array.from(selectedCategories).join(', ')}`,
          scan_categories: Array.from(selectedCategories).map(id => ({
            category_id: id, config: categoryConfigs[id] || {},
          })),
        }),
      })
      setProfileName(''); setShowProfileSave(false)
      await loadProfiles()
    } catch (err) { console.error('Failed to save profile', err) }
    finally { setSavingProfile(false) }
  }

  function applyProfile(profileId: string) {
    const profile = profiles.find(p => p.id === profileId)
    if (!profile) return
    const newSelected = new Set<string>()
    const newConfigs: Record<string, Record<string, unknown>> = { ...categoryConfigs }
    for (const cat of profile.scan_categories) {
      newSelected.add(cat.category_id)
      newConfigs[cat.category_id] = { ...newConfigs[cat.category_id], ...cat.config }
    }
    setSelectedCategories(newSelected)
    setCategoryConfigs(newConfigs)
    setSelectedProfileId('')
  }

  async function handleSaveSchedule() {
    if (!selectedProfileId) return
    setSavingSchedule(true)
    await fetch(`${getApiBase()}/profiles/${selectedProfileId}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cron: scheduleCron || null, project_id: projectId || null, target_id: selectedTarget || null }),
    })
    setSavingSchedule(false)
    setShowSchedule(false)
    await loadProfiles()
  }

  async function handleClearSchedule() {
    if (!selectedProfileId) return
    await fetch(`${getApiBase()}/profiles/${selectedProfileId}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cron: null }),
    })
    await loadProfiles()
  }

  async function handleCiscatImport() {
    if (!ciscatFile || !projectId || !ciscatTargetId) return
    setCiscatImporting(true)
    setCiscatError('')
    setCiscatResult(null)
    try {
      const form = new FormData()
      form.append('file', ciscatFile)
      form.append('project_id', projectId)
      form.append('target_id', ciscatTargetId)
      const res = await fetch(`${getApiBase()}/audit/import/ciscat`, { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setCiscatResult(data)
    } catch (e: unknown) {
      setCiscatError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setCiscatImporting(false)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function toggleCheckedTarget(t: string) {
    setCheckedTargets(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  // Use real targets if loaded; fall back to demo list
  const targetLabels = targets.length > 0
    ? targets.map(t => t.hostname_or_ip)
    : STATIC_TARGETS_DEMO

  // Suppress unused-variable warnings for vars preserved from API wiring
  void categories; void toolStatus; void hardeningProfiles; void complianceReport
  void scoring; void scoreError; void selectedHardeningProfile; void handleScoreScan
  void sshCredentials; void selectedCredentialId; void setSelectedCredentialId
  void savingProfile; void savingSchedule; void showSchedule; void setShowSchedule
  void showProfileSave; void profileName; void setProfileName; void handleSaveProfile
  void selectedProfileId; void profiles; void scheduleCron; void setScheduleCron
  void applyProfile; void handleSaveSchedule; void handleClearSchedule
  void setCiscatFile; void setCiscatTargetId; void ciscatImporting

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <PageHeader
        breadcrumb={sp ? `${sp.name}` : 'Seraph'}
        title="Audit Builder"
        sub="Select a compliance benchmark, review its controls, then generate an audit script to run against your targets. Import results back to mark controls pass/fail and auto-create findings for anything that fails."
        right={(
          <>
            <button className="btn" onClick={handleDownload} disabled={!scanId}>
              <Icon name="download" size={11} /> Download script
            </button>
            <button className="btn" onClick={handleImportResults}>
              <Icon name="upload" size={11} /> Import results
            </button>
            <button className="btn" onClick={() => { setShowCiscatImport(v => !v); setCiscatResult(null); setCiscatError('') }}>
              <Icon name="upload" size={11} /> Import CIS-CAT
            </button>
            <button
              className="btn btn-primary"
              onClick={handleRunAudit}
              disabled={generating}
            >
              <Icon name="play" size={11} color="#1a1408" />
              {generating ? 'Generating…' : 'Run audit'}
            </button>
          </>
        )}
      />

      {/* ── CIS-CAT Import Panel ────────────────────────────────────────── */}
      {showCiscatImport && (
        <div style={{ borderBottom: '1px solid var(--rule)', background: 'var(--bg-2)', padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>REPORT FILE (.xml / .json / .csv)</div>
            <input
              type="file"
              accept=".xml,.json,.csv"
              onChange={e => setCiscatFile(e.target.files?.[0] ?? null)}
              style={{ fontSize: 12, color: 'var(--fg)', background: 'var(--bg)', border: '1px solid var(--rule-strong)', padding: '4px 8px', fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>TARGET</div>
            <select
              value={ciscatTargetId}
              onChange={e => setCiscatTargetId(e.target.value)}
              style={{ fontSize: 12, color: 'var(--fg)', background: 'var(--bg)', border: '1px solid var(--rule-strong)', padding: '5px 8px', fontFamily: 'var(--font-mono)' }}
            >
              <option value="">— select target —</option>
              {targets.map(t => <option key={t.id} value={t.id}>{t.hostname_or_ip}</option>)}
            </select>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleCiscatImport}
            disabled={!ciscatFile || !ciscatTargetId || ciscatImporting || !projectId}
          >
            {ciscatImporting ? 'Importing…' : 'Import'}
          </button>
          {ciscatResult && (
            <span style={{ fontSize: 12, color: 'var(--ok)' }}>
              ✓ {ciscatResult.imported} rules — {ciscatResult.fail} fail · {ciscatResult.pass} pass · {ciscatResult.notapplicable} N/A
            </span>
          )}
          {ciscatError && <span style={{ fontSize: 12, color: 'var(--err)' }}>{ciscatError}</span>}
          {!projectId && <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>Select a project first</span>}
        </div>
      )}

      {/* ── 3-pane grid ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 460px', flex: 1, minHeight: 0 }}>

        {/* ═══ LEFT PANE — benchmarks ═══════════════════════════════════ */}
        <div style={{ borderRight: rule, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="sec-h"><span className="title">BENCHMARK</span></div>

          {/* Benchmark list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {benchmarks.map(b => (
              <button
                key={b.id}
                onClick={() => {
                  setActiveBench(b.id)
                  const next = BENCH_CONTROLS[b.id]
                  if (next) {
                    setControls(next)
                    setSelectedControlId(next[0].id)
                  }
                }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: activeBench === b.id ? 'var(--accent-2)' : 'transparent',
                  borderLeft: activeBench === b.id ? '2px solid var(--accent)' : '2px solid transparent',
                  borderBottom: rule,
                  borderTop: 'none', borderRight: 'none',
                  padding: '12px 14px', cursor: 'pointer', color: 'var(--fg)',
                }}
              >
                <div className="mono" style={{ fontSize: 12 }}>{b.label}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 4 }}>
                  {b.controls} controls · {b.sel} selected
                </div>
              </button>
            ))}

            {/* Profiles section */}
            <div style={{ padding: 14 }}>
              <div className="smcap" style={{ marginBottom: 8 }}>Profiles</div>
              <SegBtns
                options={['Server', 'Workstation', 'DMZ', 'PCI']}
                value={profileMode}
                onChange={setProfileMode}
              />
            </div>

            {/* Targets section */}
            <div style={{ padding: 14, borderTop: rule }}>
              <div className="smcap" style={{ marginBottom: 8 }}>
                Targets · {targetLabels.length} hosts
              </div>
              {targetLabels.map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <input
                    type="checkbox"
                    checked={checkedTargets.has(t)}
                    onChange={() => toggleCheckedTarget(t)}
                    style={{ width: 12, height: 12, accentColor: 'var(--accent)' }}
                  />
                  <span className="mono" style={{ fontSize: 11 }}>{t}</span>
                </div>
              ))}

              {/* Target dropdown for real API targets */}
              {targets.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="smcap" style={{ marginBottom: 6 }}>Active target</div>
                  <select
                    value={selectedTarget}
                    onChange={e => setSelectedTarget(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'var(--bg)', border: rule, borderRadius: 3,
                      padding: '5px 8px', fontSize: 11, color: 'var(--fg)',
                      fontFamily: 'var(--font-mono)', outline: 'none',
                    }}
                  >
                    {targets.map(t => (
                      <option key={t.id} value={t.id}>{t.hostname_or_ip}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ MIDDLE PANE — controls list ═════════════════════════════ */}
        <div style={{ borderRight: rule, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* 4-col KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: rule, flexShrink: 0 }}>
            {[
              { k: 'controls', v: total, c: 'var(--fg)' },
              { k: 'pass',     v: pass,  c: 'var(--ok)' },
              { k: 'warn',     v: warn,  c: 'var(--high)' },
              { k: 'fail',     v: fail,  c: 'var(--crit)' },
            ].map((d, i) => (
              <div key={d.k} style={{ padding: '14px 16px', borderRight: i < 3 ? rule : 'none' }}>
                <div className="smcap">{d.k}</div>
                <div className="mono tnum" style={{ fontSize: 26, color: d.c, marginTop: 4, fontWeight: 500 }}>{d.v}</div>
              </div>
            ))}
          </div>

          {/* Compliance bar */}
          <div style={{ padding: '14px var(--pad)', borderBottom: rule, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="smcap">compliance</div>
              <div style={{ flex: 1, height: 8, background: 'var(--rule-2)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
                  <div style={{ flex: pass, background: 'var(--ok)' }} />
                  <div style={{ flex: warn, background: 'var(--high)' }} />
                  <div style={{ flex: fail, background: 'var(--crit)' }} />
                </div>
              </div>
              <div className="mono tnum" style={{ fontSize: 18, color: 'var(--accent)', fontWeight: 500 }}>
                {pct}%
              </div>
            </div>
          </div>

          {/* Controls table */}
          <table className="data" style={{ flex: 1 }}>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Code</th>
                <th>Control</th>
                <th style={{ width: 90 }}>Severity</th>
                <th style={{ width: 70 }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {controls.map(c => (
                <tr
                  key={c.id}
                  className={selectedControlId === c.id ? 'selected' : ''}
                  onClick={() => setSelectedControlId(c.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="mono" style={{ color: 'var(--accent)' }}>{c.code}</td>
                  <td style={{ fontSize: 12.5 }}>{c.title}</td>
                  <td><SevBadge sev={c.sev} /></td>
                  <td><StatePill state={c.state} /></td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>

        {/* ═══ RIGHT PANE — control detail ════════════════════════════ */}
        <ControlDetail control={selectedControl} />
      </div>
    </div>
  )
}
