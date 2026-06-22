import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ensureManagerRunning, restartManager, type DaemonInfo } from '@cmdforge/tip-manager/server'

type LaunchOptions = {
  serverUrl?: string
}

type StartupState = {
  daemonInfo: DaemonInfo | null
}

function getLaunchOptions(argv: string[]): LaunchOptions {
  let serverUrl: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--server') {
      serverUrl = argv[index + 1]
      break
    }
  }

  return { serverUrl }
}

const launchOptions = getLaunchOptions(process.argv)
let startupState: StartupState = {
  daemonInfo: null
}

function resolveWindowIcon(): string | undefined {
  const candidates = [
    join(app.getAppPath(), 'resources', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
    join(process.resourcesPath, 'resources', 'icon.png'),
    join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'icon.png')
  ]

  return candidates.find((candidate) => existsSync(candidate))
}

function createWindow(): void {
  const icon = resolveWindowIcon()

  // Create the browser window.
  const versions = process.versions;
  const mainWindow = new BrowserWindow({
    title: `electron v${versions.electron}, chromium v${versions.chrome}, node v${versions.node}`,
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' && icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('io.github.cmdforge.tip-ui')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))
  ipcMain.handle('get-launch-options', () => launchOptions)
  ipcMain.handle('get-manager-daemon-info', () => startupState.daemonInfo)
  ipcMain.handle('refresh-manager', async () => {
    try {
      const info = await restartManager();
      startupState = { daemonInfo: info };
      return { success: true, info };
    } catch (error) {
      console.error('Failed to restart manager daemon:', error);
      return { success: false, error: String(error ?? 'unknown') };
    }
  });

  try {
    startupState = {
      daemonInfo: await ensureManagerRunning()
    }
  } catch (error) {
    console.error('Failed to start tip manager daemon:', error)
    startupState = {
      daemonInfo: null
    }
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
