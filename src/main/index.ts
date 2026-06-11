import { app, BrowserWindow, ipcMain, net, shell } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'

// ── Settings ──────────────────────────────────────────────────────────────────

interface Settings {
  serverUrl: string | null
  windowWidth: number
  windowHeight: number
  windowX: number | null
  windowY: number | null
  useLocalOllama: boolean
  localOllamaUrl: string
  localOllamaModel: string
}

const SETTINGS_DEFAULTS: Settings = {
  serverUrl: null,
  windowWidth: 1280,
  windowHeight: 800,
  windowX: null,
  windowY: null,
  useLocalOllama: false,
  localOllamaUrl: 'http://localhost:11434',
  localOllamaModel: '',
}

const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

function loadSettings(): Settings {
  try {
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) }
  } catch {
    return { ...SETTINGS_DEFAULTS }
  }
}

function saveSettings(s: Settings): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2), 'utf-8')
}

let settings = loadSettings()

// ── Window ────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: settings.windowWidth,
    height: settings.windowHeight,
    x: settings.windowX ?? undefined,
    y: settings.windowY ?? undefined,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.on('moved', () => {
    if (!mainWindow) return
    const [x, y] = mainWindow.getPosition()
    settings.windowX = x
    settings.windowY = y
    saveSettings(settings)
  })

  mainWindow.on('resized', () => {
    if (!mainWindow) return
    const [w, h] = mainWindow.getSize()
    settings.windowWidth = w
    settings.windowHeight = h
    saveSettings(settings)
  })

  // Open external links in the system browser, not the app window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── IPC ───────────────────────────────────────────────────────────────────────

function ollamaBase(): string {
  return (settings.localOllamaUrl || 'http://localhost:11434').replace(/\/$/, '')
}

function setupIPC(): void {
  ipcMain.handle('settings:get-server-url', () => settings.serverUrl)

  ipcMain.handle('settings:set-server-url', (_, url: string | null) => {
    settings.serverUrl = url
    saveSettings(settings)
    mainWindow?.webContents.reload()
    return true
  })

  // ── Local Ollama ──────────────────────────────────────────────────────────

  ipcMain.handle('ollama:get-settings', () => ({
    useLocalOllama: settings.useLocalOllama,
    localOllamaUrl: settings.localOllamaUrl,
    localOllamaModel: settings.localOllamaModel,
  }))

  ipcMain.handle('ollama:set-settings', (_, s: { useLocalOllama: boolean; localOllamaUrl: string; localOllamaModel: string }) => {
    settings.useLocalOllama = s.useLocalOllama
    settings.localOllamaUrl = s.localOllamaUrl.trim().replace(/\/$/, '') || 'http://localhost:11434'
    settings.localOllamaModel = s.localOllamaModel
    saveSettings(settings)
    return true
  })

  ipcMain.handle('ollama:models', async () => {
    const url = `${ollamaBase()}/v1/models`
    const res = await net.fetch(url)
    if (!res.ok) throw new Error(`Ollama ${res.status}`)
    const data = await res.json() as { data?: Array<{ id: string }> }
    return (data.data || []).map(m => m.id)
  })

  ipcMain.handle('ollama:chat', async (_, { messages, model }: { messages: Array<{ role: string; content: string }>; model?: string }) => {
    const url = `${ollamaBase()}/v1/chat/completions`
    const m = model || settings.localOllamaModel
    if (!m) throw new Error('No local Ollama model configured')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300_000) // 5 min
    try {
      const res = await net.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m, messages, stream: false }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Ollama ${res.status}: ${txt}`)
      }
      const data = await res.json() as { choices: Array<{ message: { content: string } }> }
      return data.choices[0].message.content
    } finally {
      clearTimeout(timeout)
    }
  })
}

// ── Backend TLS trust ───────────────────────────────────────────────────────
// The Seraph backend can be served over HTTPS with a self-signed / mkcert
// certificate (see seraph/setup-https.sh). Chromium rejects it because the
// client machine doesn't trust that CA ("No matching issuer found"). Rather than
// installing the CA on every client, we trust the cert ONLY for the exact host
// the user configured as their backend — every other origin is still verified
// normally.
function configuredHost(): string | null {
  const raw = settings.serverUrl
  if (!raw) return null
  try {
    return new URL(raw).host
  } catch {
    // serverUrl may have been entered without a scheme (e.g. "10.0.0.5:8000").
    try {
      return new URL(`https://${raw}`).host
    } catch {
      return null
    }
  }
}

function setupCertificateTrust(): void {
  app.on('certificate-error', (event, _webContents, url, _error, _certificate, callback) => {
    let host: string
    try {
      host = new URL(url).host
    } catch {
      callback(false)
      return
    }
    const allowed = configuredHost()
    if (allowed && host === allowed) {
      // Trust the user's own Seraph backend cert.
      event.preventDefault()
      callback(true)
    } else {
      callback(false)
    }
  })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  setupCertificateTrust()
  setupIPC()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
