import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getApiBase } from '@/lib/config'

export interface AuthUser {
  id: string
  username: string
  role: string
  full_name: string
}

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  login: (token: string, user: AuthUser) => void
  logout: () => void
  refreshUser: () => Promise<void>
  loading: boolean
  unreachable: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

const TOKEN_KEY = 'seraph_token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (stored) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      fetch(`${getApiBase()}/auth/me`, {
        headers: { Authorization: `Bearer ${stored}` },
        signal: controller.signal,
      })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data) {
            setToken(stored)
            setUser(data)
          } else {
            localStorage.removeItem(TOKEN_KEY)
          }
        })
        .catch(err => {
          localStorage.removeItem(TOKEN_KEY)
          if (err.name === 'AbortError') setUnreachable(true)
        })
        .finally(() => { clearTimeout(timeout); setLoading(false) })
    } else {
      setLoading(false)
    }
  }, [])

  function login(newToken: string, newUser: AuthUser) {
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
    setUser(newUser)
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }

  async function refreshUser() {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) return
    const r = await fetch(`${getApiBase()}/auth/me`, { headers: { Authorization: `Bearer ${stored}` } })
    if (r.ok) setUser(await r.json())
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshUser, loading, unreachable }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
