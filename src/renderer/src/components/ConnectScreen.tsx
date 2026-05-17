import { useState } from 'react'
import { setServerUrl } from '@/lib/config'

export function ConnectScreen() {
  const [url, setUrl] = useState('http://192.168.1.10:8000')
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  async function connect() {
    const trimmed = url.trim().replace(/\/$/, '')
    if (!trimmed) return
    setTesting(true)
    setError(null)
    try {
      const res = await fetch(`${trimmed}/api/v1/auth/me`, { method: 'GET' })
      // 401 is fine — it means the server is reachable, just not logged in yet
      if (!res.ok && res.status !== 401) throw new Error(`Server returned ${res.status}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach server')
      setTesting(false)
      return
    }
    await setServerUrl(trimmed)
    // setServerUrl triggers a window reload in main process
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', background: '#05080d', gap: 16,
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#22d3ee', letterSpacing: 2 }}>SERAPH</div>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>Enter your Seraph server address</p>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && connect()}
        placeholder="http://192.168.1.10:8000"
        style={{
          width: 320, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: '#0f172a', border: '1px solid #1e3a5f', color: '#e2e8f0',
          outline: 'none',
        }}
      />
      {error && <p style={{ color: '#f87171', fontSize: 12 }}>{error}</p>}
      <button
        onClick={connect}
        disabled={testing}
        style={{
          padding: '10px 28px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: testing ? '#0e7490' : '#0891b2', color: '#fff',
          border: 'none', cursor: testing ? 'default' : 'pointer',
        }}
      >
        {testing ? 'Connecting…' : 'Connect'}
      </button>
    </div>
  )
}
