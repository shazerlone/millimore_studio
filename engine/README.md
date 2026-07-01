# Millimore Streaming Engine (bundled OBS, controlled over obs-websocket)

This is a **separate helper process** that runs the actual streaming on **OBS
Studio** — native capture, GPU compositing, hardware H.264 encoding and native
RTMP. Millimore **bundles OBS inside the app** and launches it hidden/portable,
then drives it over OBS's own **WebSocket API** (obs-websocket v5, built into
OBS since 28). The end-user installs **only Millimore** — nothing else.

Why this and not `obs-studio-node` (OSN/libobs): there is **no modern public
OSN prebuilt** (the last one targets Electron 5, 2019). Loading the npm stub
fails with `dlopen … not a valid mach-o file`. Controlling a real bundled OBS
over its socket gives us the same OBS engine without linking GPL code into our
process — and keeps that GPL code in a separate process (license separation).
**Confirm the bundling/GPL arrangement with an IP lawyer before commercial
release.**

---

## ⚠️ Phase 0 is a go/no-go gate

The control layer (this JS) is the same whether OBS is bundled or already
installed, so we prove **control + performance first**, then do the packaging
work of bundling OBS into the installer. Until the spike below streams to
YouTube with "Good" health and audio on an **Intel Mac**, we do not proceed to
bundling / wiring the UI.

For the spike you need OBS installed **once on the dev machine** with
obs-websocket enabled — purely to validate the control layer. Production bundles
OBS so end-users install nothing.

## Enable obs-websocket (dev machine, one time)

1. Install OBS Studio 28+ (obs-websocket v5 is built in).
2. OBS → **Tools → WebSocket Server Settings**.
3. **Enable WebSocket Server**. Note the **Server Port** (default `4455`) and
   click **Show Connect Info** for the **Password**.

## Run the Phase 0 spike

```bash
# 1) install engine deps (pure Node — no native addon, no Electron needed)
cd engine && npm install

# 2) check the environment + that OBS is reachable; prints the exact command
OBS_WS_PASSWORD="<obs password>" npm run preflight

# 3) stream ~60s straight from OBS to YouTube
YT_KEY="<your youtube stream key>" OBS_WS_PASSWORD="<obs password>" npm run spike
```

The spike connects to OBS, builds the `Millimore` scene (display capture +
webcam), points OBS at YouTube, streams for ~60s while printing congestion/
skipped-frame stats, then stops.

Success criteria (on an **Intel Mac**):
- YouTube Studio → Stream health shows **Good/Excellent**
- Audio is present on the watch page
- CPU usage is clearly lower than the current Electron/FFmpeg pipeline

Report those three back. If green → we bundle OBS into the installer and wire
the app UI to the engine.

## Control protocol (used by the app after Phase 0)

`src/server.js` speaks JSON over WebSocket (default `ws://127.0.0.1:28112`),
and translates each message into obs-websocket calls:

- `{ type: "init" }` → connect to OBS, ensure the `Millimore` scene
- `{ type: "setVideo", quality: "720p30" }`
- `{ type: "setScreen", display?, window? }` / `{ type: "clearScreen" }`
- `{ type: "setCamera", deviceId }`
- `{ type: "setOverlay", url }` → adds our transparent overlay page as a Browser Source
- `{ type: "overlayEvent", payload }` → pushes trade/scene/ticker state to the overlay
- `{ type: "setDestinations", targets: [{ url, key }] }`
- `{ type: "start" }` / `{ type: "stop" }`
- `{ type: "startRecording" }` / `{ type: "stopRecording" }`
- `{ type: "stats" }` → returns congestion/skipped frames for the health indicator

The engine emits `{ type: "status", ... }`, `{ type: "stats", ... }` and
`{ type: "error", ... }` back.

## Connecting the app to bundled OBS

The app sets these env vars when it launches the helper:

- `MILLIMORE_OBS_URL` — OBS websocket URL (default `ws://127.0.0.1:4455`)
- `MILLIMORE_OBS_PASSWORD` — the password the app configured on the bundled OBS
- `MILLIMORE_ENGINE_PORT` — the app↔engine control port (default `28112`)
