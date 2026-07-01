# Millimore Streaming Engine (OBS-powered helper)

This is a **separate helper process** that runs the actual streaming on the **OBS engine**
(`obs-studio-node` / `libobs`) — native capture, GPU compositing, hardware H.264 encoding
and native RTMP. The closed-source Millimore app controls it over a local WebSocket.

It is a separate process (and its own GPL-licensed package) on purpose: it keeps the OBS
GPL code isolated from the closed-source app (license separation — see the plan). **Confirm
this arrangement with an IP lawyer before commercial release.**

---

## ⚠️ Phase 0 is a go/no-go gate

The hard part is not this JS — it's **provisioning the native OBS engine binaries** and
proving they run and stream on real hardware (especially **Intel Mac**). Until the spike
below streams to YouTube with "Good" health, we do not proceed to Phases 1–5.

## Provisioning `obs-studio-node` (OSN)

OSN is **not** on the public npm registry. It is distributed by Streamlabs as prebuilt
binaries **pinned to a specific Electron version**. Two supported ways:

1. **Prebuilt (recommended for the spike):** download the OSN release that matches the
   Electron version we ship (see `../package.json` → `electron`). Streamlabs publishes
   these; extract into `engine/node_modules/obs-studio-node`. The package must contain
   `libobs`, the `obs-plugins/`, `data/`, and the `obs_studio_client.node` addon built
   against **the same Electron ABI** we use.

2. **Build from source:** clone `stream-labs/obs-studio-node`, build against our Electron
   version (CMake + the OBS deps). Heavy; needed if no matching prebuilt exists.

Key constraint: the addon's **Electron ABI must match** our app's Electron. If they differ,
either bump our Electron to a supported one or rebuild OSN. Record the chosen versions in
the plan's "Electron version alignment" item.

The app currently targets **Electron ^31.4.0** (`../package.json`). Get the OSN build
that matches it. If no OSN prebuilt exists for Electron 31, **stop and tell the team** —
we'll align the app's Electron version to a supported OSN release (this is expected and
fine; it's the "align Electron" step from the plan).

## Run the Phase 0 spike

```bash
# 1) install root deps (provides Electron) and engine deps
npm install                         # in the repo root
cd engine && npm install            # installs `ws`

# 2) provision obs-studio-node into engine/node_modules/obs-studio-node  (see above)

# 3) check everything is ready — prints the exact command + criteria
npm run preflight

# 4) stream ~60s straight from the OBS engine to YouTube
YT_KEY="<your youtube stream key>" npm run spike     # runs under Electron-as-Node
```

`npm run spike` launches `spike.js` with the app's Electron binary in
`ELECTRON_RUN_AS_NODE` mode, because OSN's native addon is built for the **Electron
ABI**, not plain Node.

Success criteria (on an **Intel Mac**):
- YouTube Studio → Stream health shows **Good/Excellent**
- Audio is present on the watch page
- CPU usage is clearly lower than the current Electron pipeline

Report those three back. If green → we proceed to Phase 1 (wire the app UI to the
engine). If OSN can't be provisioned for our Electron → we align the Electron version.

## Control protocol (used by the app in Phase 1+)

`src/server.js` speaks JSON over WebSocket (default `ws://127.0.0.1:28112`). Messages:

- `{ type: "init" }` → boots the OBS engine
- `{ type: "setVideo", quality: "720p30" }`
- `{ type: "setScreen", sourceId }` / `{ type: "clearScreen" }`
- `{ type: "setCamera", deviceId }`
- `{ type: "setDestinations", targets: [{ url, key }] }`
- `{ type: "start" }` / `{ type: "stop" }`
- `{ type: "startRecording" }` / `{ type: "stopRecording" }`

The engine emits `{ type: "status", ... }` and `{ type: "stats", ... }` back.
