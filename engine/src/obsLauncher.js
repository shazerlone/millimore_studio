'use strict'

/**
 * Launches and configures OBS so the user never has to. Millimore owns the OBS
 * lifecycle: we locate the OBS binary (bundled inside the app in production, or
 * a local install during development), write its obs-websocket config so the
 * server is enabled on 127.0.0.1 with no manual toggling, start it in the
 * background, and wait for the socket to come up.
 *
 * The end-user only ever interacts with Millimore — OBS is the hidden engine.
 */
const { spawn } = require('node:child_process')
const net = require('node:net')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/** OBS user config root per platform. */
function obsConfigRoot() {
  const home = os.homedir()
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'obs-studio')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'obs-studio')
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'obs-studio')
}

/** obs-websocket plugin config path (under the OBS user config dir). */
function websocketConfigPath() {
  return path.join(obsConfigRoot(), 'plugin_config', 'obs-websocket', 'config.json')
}

/**
 * Seed OBS's global config on a machine that has never run OBS, so the hidden
 * engine skips the first-run wizard / EULA and starts minimised to tray. Only
 * writes if there's no config yet — never touches a real user's own OBS setup.
 */
function seedObsConfig() {
  const root = obsConfigRoot()
  const globalIni = path.join(root, 'global.ini')
  if (fs.existsSync(globalIni)) return // real OBS install or already seeded
  fs.mkdirSync(root, { recursive: true })
  const ini = [
    '[General]',
    'FirstRun=true',
    'LastVersion=503316483',
    '',
    '[BasicWindow]',
    'SysTrayEnabled=true',
    'SysTrayWhenStarted=true',
    'SysTrayMinimizeToTray=true',
    ''
  ].join('\n')
  fs.writeFileSync(globalIni, ini)
}

/** Candidate OBS binaries: explicit override (bundled) first, then known installs. */
function candidateBinaries() {
  const list = []
  if (process.env.MILLIMORE_OBS_BINARY) list.push(process.env.MILLIMORE_OBS_BINARY)
  if (process.platform === 'darwin') {
    list.push('/Applications/OBS.app/Contents/MacOS/OBS')
    list.push(path.join(os.homedir(), 'Applications', 'OBS.app', 'Contents', 'MacOS', 'OBS'))
  } else if (process.platform === 'win32') {
    list.push('C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe')
    list.push('C:\\Program Files (x86)\\obs-studio\\bin\\64bit\\obs64.exe')
  } else {
    list.push('/usr/bin/obs', '/usr/local/bin/obs')
  }
  return list
}

function findObsBinary() {
  for (const p of candidateBinaries()) {
    try {
      if (fs.existsSync(p)) return p
    } catch {
      /* keep looking */
    }
  }
  return null
}

/** True if something is already accepting connections on the port. */
function isPortOpen(port, host = '127.0.0.1', timeout = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (open) => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, host)
  })
}

async function waitForPort(port, { tries = 60, interval = 500 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (await isPortOpen(port)) return true
    await new Promise((r) => setTimeout(r, interval))
  }
  return false
}

/**
 * Ensure obs-websocket is enabled (no auth, localhost-only) before OBS starts,
 * so Millimore can connect without the user touching any OBS setting.
 */
function writeWebsocketConfig(port) {
  const file = websocketConfigPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  let cfg = {}
  try {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    /* first run — start fresh */
  }
  const next = {
    ...cfg,
    alerts_enabled: false,
    first_load: false,
    server_enabled: true,
    server_port: port,
    // Localhost-only; auth off so the app connects with zero user setup.
    auth_required: false
  }
  fs.writeFileSync(file, JSON.stringify(next, null, 4))
  return file
}

// The OBS process WE spawned (null if OBS was already running — that one is
// the user's own and we must never kill it).
let spawnedObs = null

/**
 * Make sure OBS is running with obs-websocket up on `port`.
 *
 * @returns {Promise<{ started: boolean, alreadyRunning: boolean, binary: string|null }>}
 */
async function ensureObs({ port = 4455 } = {}) {
  // Already up (user left OBS open, or a previous launch): just use it.
  if (await isPortOpen(port)) {
    return { started: false, alreadyRunning: true, binary: null }
  }

  const binary = findObsBinary()
  if (!binary) {
    throw new Error(
      'OBS engine not found. Install OBS Studio (dev), or bundle it and set ' +
        'MILLIMORE_OBS_BINARY (production). Looked in: ' + candidateBinaries().join(', ')
    )
  }

  seedObsConfig()
  writeWebsocketConfig(port)

  // Start OBS minimized/detached so it runs as a background engine, not a window
  // the user has to mind. Full invisibility (no dock icon) comes with the
  // bundled build's Info.plist; --minimize-to-tray keeps it out of the way here.
  const args = ['--minimize-to-tray', '--disable-shutdown-check']
  const child = spawn(binary, args, {
    detached: true,
    stdio: 'ignore',
    // OBS resolves its data relative to the binary; run from its own dir.
    cwd: path.dirname(binary)
  })
  child.unref()
  spawnedObs = child

  const up = await waitForPort(port, { tries: 60, interval: 500 })
  if (!up) throw new Error('OBS started but its WebSocket never came up on port ' + port)

  return { started: true, alreadyRunning: false, binary }
}

/**
 * Stop the OBS we spawned (no-op if OBS was the user's own instance). The
 * hidden engine has no dock icon or window, so if we don't kill it on exit it
 * would run forever with no way for the user to quit it.
 */
function stopObs() {
  if (!spawnedObs) return false
  try {
    process.kill(spawnedObs.pid, 'SIGTERM')
  } catch {
    /* already gone */
  }
  spawnedObs = null
  return true
}

module.exports = { ensureObs, stopObs, findObsBinary, websocketConfigPath, obsConfigRoot }
