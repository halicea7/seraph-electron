import type React from 'react'
import { useState, useEffect, FormEvent } from 'react'
import { Shield, Eye, EyeOff, Loader, Fingerprint } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import LoginBackground from '../components/LoginBackground'
import { getApiBase } from '@/lib/config'

type Mode = 'checking' | 'setup' | 'login'

export default function Login() {
  const { login } = useAuth()
  const [mode, setMode] = useState<Mode>('checking')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [staySignedIn, setStaySignedIn] = useState(true)
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [error, setError] = useState('')
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setPulse(p => (p + 1) % 360), 500)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetch(`${getApiBase()}/auth/setup-required`)
      .then(r => r.json())
      .then(data => setMode(data.required ? 'setup' : 'login'))
      .catch(() => setMode('login'))
  }, [])

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
      const beginRes = await fetch(`${getApiBase()}/passkeys/authenticate/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() || undefined }),
      })
      if (!beginRes.ok) throw new Error('Failed to start passkey flow')
      const opts = await beginRes.json()
      const { _challenge_key: challengeKey, ...publicKeyOpts } = opts

      const credOpts: PublicKeyCredentialRequestOptions = {
        ...publicKeyOpts,
        challenge: _b64urlToBuffer(publicKeyOpts.challenge),
        allowCredentials: (publicKeyOpts.allowCredentials || []).map((c: any) => ({
          ...c,
          id: _b64urlToBuffer(c.id),
        })),
      }

      const assertion = await navigator.credentials.get({ publicKey: credOpts }) as PublicKeyCredential | null
      if (!assertion) throw new Error('No passkey selected')
      const ar = assertion.response as AuthenticatorAssertionResponse

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

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 11,
    color: 'var(--fg-2)',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '8px 14px 10px',
    borderBottom: active ? '1px solid var(--accent)' : '1px solid transparent',
    marginBottom: -1,
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: active ? 'var(--fg)' : 'var(--fg-3)',
  })

  if (mode === 'checking') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <Loader size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: '1fr 460px', background: 'var(--bg)' }}>
      {/* Left — atmospheric panel */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        borderRight: '1px solid var(--rule)',
        background: 'var(--bg)',
        padding: 40,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <LoginBackground style={{
          maskImage: 'radial-gradient(ellipse at 65% 50%, black 30%, transparent 95%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 65% 50%, black 30%, transparent 95%)',
        }} />

        {/* Brand */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Shield size={36} style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 8px rgba(240,168,58,0.5))' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, letterSpacing: '0.32em', fontWeight: 600, color: 'var(--fg)' }}>SERAPH</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em', color: 'var(--fg-3)', textTransform: 'uppercase' }}>Operations Console · v2.0.1</div>
          </div>
        </div>

        {/* Headline + stats */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--fg-3)', fontWeight: 500, marginBottom: 16 }}>Authorized use only</div>
          <h1 style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 56, lineHeight: 1.02, fontWeight: 400, letterSpacing: '-0.02em',
            maxWidth: 620, color: 'var(--fg)',
          }}>
            One console for compliance, offensive ops, and the long tail of fixing things.
          </h1>
          <p style={{ marginTop: 22, color: 'var(--fg-2)', fontSize: 14, maxWidth: 540, lineHeight: 1.55 }}>
            Self-hosted. JWT + passkeys. Local LLM narrative. Every byte stays on metal you control.
          </p>
          <div style={{ marginTop: 32, display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {[
              { k: 'modules', v: '14' },
              { k: 'integrated tools', v: '27' },
              { k: 'avg crit detection', v: '< 6m' },
            ].map(s => (
              <div key={s.k}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--fg)' }}>{s.v}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.16em', marginTop: 4 }}>{s.k}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Status row */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Status</div>
            <div style={{ fontFamily: 'var(--font-mono)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg)' }}>
              <span className="dot dot-live" />
              <span>backend · online</span>
              <span style={{ color: 'var(--fg-4)' }}>·</span>
              <span style={{ color: 'var(--fg-3)' }}>msfrpcd up</span>
              <span style={{ color: 'var(--fg-4)' }}>·</span>
              <span style={{ color: 'var(--fg-3)' }}>tls valid</span>
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
            ░ {Math.floor(pulse / 6).toString().padStart(3, '0')} ░ {(0.3 + Math.sin(pulse / 18) * 0.2).toFixed(3)}
          </div>
        </div>
      </div>

      {/* Right — form panel */}
      <div style={{ padding: '60px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--bg-2)' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', marginBottom: 28 }}>
          <button style={tabStyle(mode === 'login')} onClick={() => { setMode('login'); setError('') }}>Sign in</button>
          <button style={tabStyle(mode === 'setup')} onClick={() => { setMode('setup'); setError('') }}>First-run setup</button>
        </div>

        {mode === 'login' ? (
          <>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 20, letterSpacing: '-0.01em', color: 'var(--fg)' }}>Authenticate</h2>
            <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 6, marginBottom: 28 }}>JWT + bcrypt. Passkeys supported on secure origins.</p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Username</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  style={inputStyle}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    placeholder="••••••••"
                    onChange={e => setPassword(e.target.value)}
                    style={{ ...inputStyle, paddingRight: 36 }}
                    required
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

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--fg-2)', fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={staySignedIn}
                    onChange={e => setStaySignedIn(e.target.checked)}
                    style={{ width: 13, height: 13, accentColor: 'var(--accent)' }}
                  />
                  Stay signed in for 12 hours
                </label>
                <a href="#" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.12em', textDecoration: 'none' }}>Recover →</a>
              </div>

              {error && (
                <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--crit)', border: '1px solid rgba(232,64,64,0.3)', background: 'rgba(232,64,64,0.08)' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-lg"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? <Loader size={14} className="animate-spin" /> : 'Sign in'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
                <span style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.18em' }}>or</span>
                <span style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
              </div>

              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={passkeyLoading}
                className="btn btn-lg"
                style={{ width: '100%', justifyContent: 'center', gap: 10, opacity: passkeyLoading ? 0.5 : 1, cursor: passkeyLoading ? 'not-allowed' : 'pointer' }}
              >
                {passkeyLoading ? <Loader size={14} className="animate-spin" /> : <><Fingerprint size={14} /> Sign in with passkey</>}
              </button>
            </form>

            <div style={{ marginTop: 36, padding: '14px 0', borderTop: '1px dashed var(--rule)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Rate-limited · 5/min/ip</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>tlsv1.3 · rp = localhost</span>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 20, letterSpacing: '-0.01em', color: 'var(--fg)' }}>Create initial admin</h2>
            <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 6, marginBottom: 22 }}>This account becomes the platform owner. You can add more users from Settings → Users afterwards.</p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>First name</label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} required />
                </div>
                <div>
                  <label style={labelStyle}>Last name</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} required />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Username</label>
                <input value={username} onChange={e => setUsername(e.target.value)} style={inputStyle} required autoFocus />
              </div>
              <div>
                <label style={labelStyle}>Password (min 8 chars)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    placeholder="••••••••"
                    onChange={e => setPassword(e.target.value)}
                    style={{ ...inputStyle, paddingRight: 36 }}
                    required
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
                <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--crit)', border: '1px solid rgba(232,64,64,0.3)', background: 'rgba(232,64,64,0.08)' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-lg"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? <Loader size={14} className="animate-spin" /> : 'Create admin · enter Seraph'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
