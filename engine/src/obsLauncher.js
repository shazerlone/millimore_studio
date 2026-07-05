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
const { spawn, execSync } = require('node:child_process')
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

/** Merge key=value entries into one section of an ini file (create if needed). */
function mergeIni(file, section, entries) {
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    /* new file */
  }
  const lines = text ? text.split(/\r?\n/) : []
  const header = `[${section}]`
  let start = lines.findIndex((l) => l.trim() === header)
  if (start === -1) {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('')
    lines.push(header)
    for (const [k, v] of Object.entries(entries)) lines.push(`${k}=${v}`)
  } else {
    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\[.+\]$/.test(lines[i].trim())) {
        end = i
        break
      }
    }
    for (const [k, v] of Object.entries(entries)) {
      let found = false
      for (let i = start + 1; i < end; i++) {
        if (lines[i].split('=')[0].trim() === k) {
          lines[i] = `${k}=${v}`
          found = true
          break
        }
      }
      if (!found) {
        let at = end
        while (at > start + 1 && lines[at - 1].trim() === '') at-- // keep blanks after the section
        lines.splice(at, 0, `${k}=${v}`)
        end++
      }
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, lines.join('\n'))
}

/**
 * Prepare OBS's global config so the engine runs invisibly: skip the first-run
 * wizard on fresh machines, and disable the tray/menu-bar icon — the window is
 * hidden at launch (macOS `open -j`), so with the tray off there is NOTHING of
 * OBS for the user to see.
 */
function seedObsConfig() {
  const globalIni = path.join(obsConfigRoot(), 'global.ini')
  if (!fs.existsSync(globalIni)) {
    mergeIni(globalIni, 'General', { FirstRun: 'true', LastVersion: '503316483' })
  }
  mergeIni(globalIni, 'BasicWindow', {
    SysTrayEnabled: 'false',
    SysTrayWhenStarted: 'false'
  })
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

  // Launch OBS truly invisibly. On macOS, `open -j` starts the app in the
  // OS-level "hidden" state (like Cmd+H): no window on screen — and with the
  // tray disabled (seedObsConfig) and LSUIElement set on the bundled copy
  // (no dock icon, no app switcher), nothing of OBS is visible at all.
  const macAppBundle =
    process.platform === 'darwin' ? binary.replace(/\/Contents\/MacOS\/[^/]+$/, '') : null
  if (macAppBundle && macAppBundle !== binary) {
    spawn('open', ['-n', '-g', '-j', '-a', macAppBundle, '--args', '--disable-shutdown-check'], {
      stdio: 'ignore'
    })
  } else {
    // Windows/Linux (and bare mac binaries): spawn directly, minimized.
    const child = spawn(binary, ['--minimize-to-tray', '--disable-shutdown-check'], {
      detached: true,
      stdio: 'ignore',
      // OBS resolves its data relative to the binary; run from its own dir.
      cwd: path.dirname(binary)
    })
    child.unref()
  }
  spawnedObs = { binary }

  const up = await waitForPort(port, { tries: 60, interval: 500 })
  if (!up) throw new Error('OBS started but its WebSocket never came up on port ' + port)

  return { started: true, alreadyRunning: false, binary }
}

/**
 * Stop the OBS we spawned (no-op if OBS was the user's own instance). The
 * hidden engine has no window, dock icon or tray, so if we don't kill it on
 * exit it would run forever with no way for the user to quit it.
 */
function stopObs() {
  if (!spawnedObs) return false
  const { binary } = spawnedObs
  spawnedObs = null
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /IM ${JSON.stringify(path.basename(binary))}`, { stdio: 'ignore' })
    } else {
      // Kill by full binary path — matches only the copy we launched.
      execSync(`pkill -f ${JSON.stringify(binary)}`, { stdio: 'ignore' })
    }
  } catch {
    /* already gone */
  }
  return true
}

module.exports = { ensureObs, stopObs, findObsBinary, websocketConfigPath, obsConfigRoot }
