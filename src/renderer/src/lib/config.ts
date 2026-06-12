// Reads the configured Seraph server URL from Electron settings.
// Falls back to localhost for dev convenience.
import { getToken } from './auth-token'

let _cachedUrl: string | null | undefined = undefined

export async function initServerUrl(): Promise<void> {
  _cachedUrl = await window.electronAPI.getServerUrl()
}

export function getServerUrl(): string | null {
  return _cachedUrl ?? null
}

export function getApiBase(): string {
  return `${_cachedUrl ?? 'http://localhost:8002'}/api/v1`
}

export function getWsBase(): string {
  return (_cachedUrl ?? 'http://localhost:8002').replace(/^http/, 'ws')
}

// Build a WebSocket URL with the auth token attached (?token=). The backend
// gates every WS handshake on a valid JWT (see WSAuthMiddleware).
export function wsUrl(path: string): string {
  const sep = path.includes('?') ? '&' : '?'
  return `${getWsBase()}${path}${sep}token=${encodeURIComponent(getToken() ?? '')}`
}

export async function setServerUrl(url: string): Promise<void> {
  await window.electronAPI.setServerUrl(url.trim().replace(/\/$/, ''))
}
