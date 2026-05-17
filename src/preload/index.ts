import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getServerUrl: (): Promise<string | null> => ipcRenderer.invoke('settings:get-server-url'),
  setServerUrl: (url: string | null): Promise<boolean> => ipcRenderer.invoke('settings:set-server-url', url),
}

contextBridge.exposeInMainWorld('electronAPI', api)

declare global {
  interface Window {
    electronAPI: typeof api
  }
}
