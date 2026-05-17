// Reads the configured Seraph server URL from Electron settings.
// Falls back to localhost for dev convenience.
let _cachedUrl: string | null | undefined = undefined

export async function initServerUrl(): Promise<void> {
  _cachedUrl = await window.electronAPI.getServerUrl()
}

export function getServerUrl(): string | null {
  return _cachedUrl ?? null
}

export function getApiBase(): string {
  return `${_cachedUrl ?? 'http://localhost:8000'}/api/v1`
}

export function getWsBase(): string {
  return (_cachedUrl ?? 'http://localhost:8000').replace(/^http/, 'ws')
}

export async function setServerUrl(url: string): Promise<void> {
  await window.electronAPI.setServerUrl(url.trim().replace(/\/$/, ''))
}
