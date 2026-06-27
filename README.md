# millimore desktop ✦

Professional live streaming for traders. Stream your screen + camera to
**Millimore, YouTube, Instagram and Facebook simultaneously**, with trade cards
that appear automatically on stream the moment MT5 fires a position. No OBS
needed — this app replaces it.

Built with Electron + React. One codebase, Mac + Windows.

---

## Quick start

```bash
npm install          # install dependencies
npm run dev          # launch the app in development (hot reload)
npm run build        # build production bundles into out/
npm run package:mac  # build a distributable .app  (electron-builder)
npm run package:win  # build a distributable .exe
```

> The first `npm install` downloads the Electron and FFmpeg binaries. If you are
> on a restricted network and only need to compile the bundles, run
> `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install` then `npm run build`.

---

## Architecture

```
src/
  main/                Electron main process (Node)
    index.js           window + IPC wiring, safeStorage key vault, settings
    ffmpeg.js          multistream engine — single encode, tee fan-out to all RTMP targets
    mt5.js             read-only MT5 connection (investor password) + trade event polling
    overlay.js         trade-card coordinator: on-stream overlay + Socket.io relay to mobile
  preload/
    index.js           secure contextBridge surface (window.millimore.*)
  renderer/            React UI
    screens/           Login, Dashboard, GoLive, OverlayDesigner, MT5Connection, Analytics, Settings
    components/         Sidebar, TradeCard, StreamPreview, StatsCard, Logo, Icons, shared UI kit
    lib/               compositor (screen + camera → canvas → raw frames), quality presets
    theme/             colors, typography, global styles
    store.jsx          app state (auth, live status, overlay config)
```

### How a stream flows

1. The renderer composites the **screen capture** (Electron `desktopCapturer`)
   and the **camera** (`getUserMedia`) into one canvas, picture-in-picture, in
   `lib/compositor.js`.
2. Raw RGBA frames are pushed over IPC to the main process.
3. `main/ffmpeg.js` encodes **once** with `libx264` and uses FFmpeg's `tee`
   muxer to fan the same stream out to every enabled RTMP destination at once.

### How a trade reaches the overlay

1. `main/mt5.js` connects with the **investor (read-only) password** and polls
   open positions — it can never place or modify a trade.
2. On an open/close it emits a normalized trade event.
3. `main/overlay.js` shows the animated card on stream **and** relays it over
   Socket.io so Millimore mobile viewers see the same card. Cards auto-fade
   after 10 seconds.

### Stream keys

YouTube / Instagram / Facebook keys are entered once and stored locally with
Electron's `safeStorage` (OS keychain). They never leave the trader's PC.

---

## Brand

| Token        | Value     |
| ------------ | --------- |
| Primary blue | `#2563EB` |
| Background   | `#FFFFFF` |
| Dark         | `#0F172A` |
| Slate        | `#64748B` |
| Border       | `#F1F5F9` |
| Font         | Inter     |
| Card radius  | 12px      |
| Button radius| 8px       |

---

## Status

All seven screens are built with real, branded UI and wired navigation. The
multistream engine, MT5 connection and trade-overlay systems are implemented in
the main process; the MT5 transport ships with a deterministic simulator so the
full pipeline (overlay → relay → UI) runs without a live broker. Swap
`MT5Manager._openBridge` / `_pollPositions` for a real MetaApi or local-terminal
bridge to go fully live.
