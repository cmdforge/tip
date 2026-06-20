import { ElectronAPI } from '@electron-toolkit/preload'

type LaunchOptions = {
  serverUrl?: string
}

interface Api {
  getLaunchOptions(): Promise<LaunchOptions>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
