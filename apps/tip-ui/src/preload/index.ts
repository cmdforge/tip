/// <reference types="./index" />

import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type DaemonInfo = {
  pid: number
  url: string
}

function makeApi(): Window['api'] {
  return {
    getLaunchOptions() {
      return ipcRenderer.invoke('get-launch-options')
    },
    getManagerDaemonInfo() {
      return ipcRenderer.invoke('get-manager-daemon-info') as Promise<DaemonInfo | null>
    },
    refreshManager() {
      return ipcRenderer.invoke('refresh-manager') as Promise<{ success: boolean; info?: DaemonInfo; error?: string }>
    }
  }
}

// Custom APIs for renderer
const api = makeApi();

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
