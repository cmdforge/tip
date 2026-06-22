import { ElectronAPI } from '@electron-toolkit/preload'

type LaunchOptions = {
  serverUrl?: string
}

type DaemonInfo = {
  pid: number
  url: string
}

interface Api {
  getLaunchOptions(): Promise<LaunchOptions>
  getManagerDaemonInfo(): Promise<DaemonInfo | null>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
