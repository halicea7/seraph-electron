import { useState, useEffect, FormEvent } from 'react'
import { Shield, Eye, EyeOff, Loader, UserPlus, LogIn, Fingerprint } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import LoginBackground from '../components/LoginBackground'
import { getApiBase } from '@/lib/config'

const rule = '1px solid var(--rule)'
const ruleStrong = '1px solid var(--rule-strong)'

type Mode = 'checking' | 'setup' | 'login'

export default function Login() {
  const { login } = useAuth()
  const [mode, setMode] = useState<Mode>('checking')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [error, setError] = useState('')

  async function handlePasskeyLogin() {
    if (!window.isSecureContext) {
      setError('Passkeys require a secure context. Access Seraph via http://localhost:8000 or enable HTTPS.')
      return
    }
    if (!window.PublicKeyCredential) {
      setError('Passkeys are not available in this browser.')
      return
    }
    setError('')
    setPasskeyLoading(true)
    try {
      // 1. Get authentication options from server
      const beginRes = await fetch(`${getApiBase()}/passkeys/authenticate/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() || undefined }),
      })
      if (!beginRes.ok) throw new Error('Failed to start passkey flow')
      const opts = await beginRes.json()
      const { _challenge_key: challengeKey, ...publicKeyOpts } = opts

      // 2. Decode base64url fields expected by the browser API
      const credOpts: PublicKeyCredentialRequestOptions = {
        ...publicKeyOpts,
        challenge: _b64urlToBuffer(publicKeyOpts.challenge),
        allowCredentials: (publicKeyOpts.allowCredentials || []).map((c: any) => ({
          ...c,
          id: _b64urlToBuffer(c.id),
        })),
      }

      // 3. Prompt the user's authenticator
      const assertion = await navigator.credentials.get({ publicKey: credOpts }) as PublicKeyCredential | null
      if (!assertion) throw new Error('No passkey selected')
      const ar = assertion.response as AuthenticatorAssertionResponse

      // 4. Send response to server
      const completeRes = await fetch(`${getApiBase()}/passkeys/authenticate/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_key: challengeKey,
          credential: {
            id: assertion.id,
            rawId: _bufferToB64url(assertion.rawId),
            response: {
              clientDataJSON: _bufferToB64url(ar.clientDataJSON),
              authenticatorData: _bufferToB64url(ar.authenticatorData),
              signature: _bufferToB64url(ar.signature),
              userHandle: ar.userHandle ? _bufferToB64url(ar.userHandle) : null,
            },
            type: assertion.type,
          },
        }),
      })
      const data = await completeRes.json()
      if (!completeRes.ok) throw new Error(data.detail || 'Passkey authentication failed')
      login(data.access_token, data.user)
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey prompt was cancelled.')
      } else {
        setError(err.message || 'Passkey authentication failed')
      }
    } finally {
      setPasskeyLoading(false)
    }
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

  useEffect(() => {
    fetch(`${getApiBase()}/auth/setup-required`)
      .then(r => r.json())
      .then(data => setMode(data.required ? 'setup' : 'login'))
      .catch(() => setMode('login'))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'setup') {
        if (password.length < 8) {
          setError('Password must be at least 8 characters.')
          return
        }
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
        const res = await fetch(`${getApiBase()}/auth/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password, full_name: fullName || undefined }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail || 'Setup failed')
        login(data.access_token, data.user)
      } else {
        const form = new URLSearchParams()
        form.append('username', username.trim())
        form.append('password', password)
        const res = await fetch(`${getApiBase()}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail || 'Login failed')
        login(data.access_token, data.user)
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)',
    border: ruleStrong,
    borderRadius: 4,
    color: 'var(--fg)',
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    padding: '8px 12px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  }

  if (mode === 'checking') {
    return (
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
        <LoginBackground />
        <Loader size={24} className="animate-spin" style={{ position: 'relative', zIndex: 10, color: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div
      style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', overflow: 'hidden', background: 'var(--bg)', color: 'var(--fg)' }}
    >
      <LoginBackground />
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 360, padding: '0 16px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 4, background: 'rgba(240,168,58,0.1)', border: '1px solid rgba(240,168,58,0.25)', marginBottom: 12 }}
          >
            <Shield size={32} style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 8px rgba(240,168,58,0.5))' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--accent)', fontFamily: 'var(--font-mono)', margin: 0 }}>SERAPH</h1>
            <p style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', marginTop: 4 }}>Security Platform</p>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--bg-2)', border: ruleStrong, borderRadius: 6, padding: 32 }}>
          {mode === 'setup' && (
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--accent)', marginBottom: 4 }}>
                <UserPlus size={16} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>First-Run Setup</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--fg-2)', margin: 0 }}>Create your administrator account to get started.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {mode === 'setup' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--fg-2)', marginBottom: 6 }}>First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Jane"
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--fg-2)', marginBottom: 6 }}>Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Doe"
                    required
                    style={inputStyle}
                  />
                </div>
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--fg-2)', marginBottom: 6 }}>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={mode === 'setup' ? 'Choose a username' : 'Enter your username'}
                required
                autoFocus
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--fg-2)', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'setup' ? 'At least 8 characters' : 'Enter your password'}
                  required
                  style={{ ...inputStyle, paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 0 }}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                style={{ borderRadius: 4, padding: '8px 12px', fontSize: 11, color: 'var(--crit)', border: '1px solid rgba(232,64,64,0.3)', background: 'rgba(232,64,64,0.08)' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 0', borderRadius: 4, fontSize: 13, fontWeight: 600,
                background: 'var(--accent)', color: '#0d0c0a', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1, width: '100%', fontFamily: 'var(--font-sans)',
              }}
            >
              {loading ? (
                <Loader size={14} className="animate-spin" />
              ) : mode === 'setup' ? (
                <><UserPlus size={14} /> Create Account</>
              ) : (
                <><LogIn size={14} /> Sign In</>
              )}
            </button>

            {mode === 'login' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                  <span style={{ fontSize: 11, color: 'var(--fg-4)' }}>or</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                </div>
                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px 0', borderRadius: 4, fontSize: 13, fontWeight: 500,
                    background: 'rgba(240,168,58,0.06)', border: '1px solid rgba(240,168,58,0.2)',
                    color: 'var(--accent)', cursor: passkeyLoading ? 'not-allowed' : 'pointer',
                    opacity: passkeyLoading ? 0.5 : 1, width: '100%', fontFamily: 'var(--font-sans)',
                  }}
                >
                  {passkeyLoading ? (
                    <Loader size={14} className="animate-spin" />
                  ) : (
                    <><Fingerprint size={14} /> Sign in with Passkey</>
                  )}
                </button>
              </>
            )}
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--fg-4)', marginTop: 20 }}>
          Self-hosted · All data stays local
        </p>
      </div>
    </div>
  )
}
