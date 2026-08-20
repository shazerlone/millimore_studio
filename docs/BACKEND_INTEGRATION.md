# Millimore Desktop ⇄ Backend Integration

How the desktop streaming app (`shazerlone/millimore_studio`) connects to the
live Millimore backend (`shazerlone/tv_license_app`, AWS ECS) so a creator can:
**log in → connect Meta/YouTube → go live → place trades → trade cards + copy
system**, all synced with the mobile (Flutter) app.

Contract source of truth: `tv_license_app/docs/BACKEND_CONTRACT.md`.
Backend base URL: `https://mi-41bae9db1d7c40e2846cc32d8ac9f51f.ecs.us-west-2.on.aws/v1`
WebSocket: `wss://<same-host>/v1/ws?token=<JWT>`

---

## 1. Architecture — single ingest, backend simulcast

The desktop **no longer** streams directly to YouTube/Meta with pasted keys.
Instead:

```
Desktop capture+encode (our engine)
      │  ONE rtmps push
      ▼
POST /broadcasts → { ingestUrl, streamKey }      (backend / Cloudflare Stream Live)
      │  backend fans out (Outputs)
      ├──► YouTube
      ├──► Facebook / Instagram (Meta)
      └──► Millimore HLS (hlsUrl) → mobile viewers
```

Our engine already streams RTMPS to any URL, so this is a **target swap**, not a
rewrite: point the single output at `ingestUrl` + `streamKey`.

---

## 2. Endpoints the desktop will call (ALL already exist on the backend)

### Auth (§4.1)
- `POST /auth/login { email, password, twofaCode? }` → `{ token, user }`
- `POST /auth/otp/request { phone }` → `{ requestId, devCode? }`
- `POST /auth/otp/verify { requestId, code }` → `{ token, user }`
- `GET /me` → `{ user }`  (role must be `creator`, `creatorStatus: approved` to stream)

Store the JWT (Electron `safeStorage`), send `Authorization: Bearer <jwt>`.

### Broadcast lifecycle (§4.9)
- `POST /broadcasts { title }` → `Broadcast { id, ingestUrl, streamKey, hlsUrl, phase }`
- `POST /broadcasts/{id}/start` → `phase: "live"`  (call once RTMP is flowing)
- `POST /broadcasts/{id}/end` → summary
- `GET /broadcasts/{id}` → `Broadcast`

### Simulcast outputs — this is how Meta/YouTube attach (§ "M13")
- `GET  /broadcasts/{id}/outputs` → `[ { id, platform, enabled } ]`
- `POST /broadcasts/{id}/outputs { platform, streamKey, url? }` → output
- `PATCH /broadcasts/{id}/outputs/{outputId} { enabled }`
- `DELETE /broadcasts/{id}/outputs/{outputId}`

### YouTube OAuth (already built)
- `POST /youtube/connect` → `{ url }` (open in browser for Google consent)
- `GET  /youtube/status`, `POST /youtube/disconnect`
- `POST /broadcasts/{id}/destinations/youtube/connect`

### Chat + reactions (§4.11)
- `GET  /broadcasts/{id}/chat` → `[ LiveChatMessage ]`
- `POST /broadcasts/{id}/chat { text }`
- `POST /broadcasts/{id}/react`

### Realtime (§5) — WS envelope `{ ch, type, data }`
- Connect `wss://host/v1/ws?token=<JWT>`, `{ "op":"subscribe", "channels":["broadcast:<id>"] }`
- Receive: `type:"viewers"|"chat"|"reaction"|"trade"` on `ch:"broadcast:<id>"`
  → drive the on-stream overlay + live UI.

---

## 3. Desktop build phases

**Phase 1 — Auth + broadcast (stream through the backend).**
Add a login screen with **both** email/password (`POST /auth/login`) **and**
phone OTP (`POST /auth/otp/request` → `POST /auth/otp/verify`). Persist the JWT
in Electron `safeStorage`; on launch, `GET /me` to restore the session. On Go
Live: `createBroadcast(title)` → stream our engine to `ingestUrl`+`streamKey` →
`startBroadcast(id)`. On Stop: `endBroadcast(id)`. Keep the current capture,
compositor, overlays exactly as-is — only the RTMP target changes.

**Phase 2 — Connect Meta + YouTube (OAuth).**
- YouTube: call `POST /youtube/connect` → open `url` in the system browser → done.
- Meta: **OAuth only** (product decision) → **blocked on backend R1**. The
  desktop shows a "Connect Meta" button that calls `POST /facebook/connect`
  (opens consent), then `POST /broadcasts/{id}/destinations/facebook/connect`.
  The manual-stream-key path is NOT used.

**Phase 3 — Place trades → backend → overlay + copy.**
Wire "Place a trade" to `POST /broadcasts/{id}/orders` (see §4). The backend
executes on the creator's MT account, broadcasts `type:"trade"` over WS, and
propagates to copiers. The desktop overlay renders the trade from the WS event
(single source of truth = what viewers see).

**Phase 4 — Live UI over WS.**
Viewers, aggregated chat (incl. YouTube), reactions, and closed-trade P/L shown
live on the desktop, fed by the `broadcast:<id>` channel.

---

## 4. BACKEND REQUIREMENTS (gaps the backend Claude must implement)

Everything in §2 exists. These do **not** yet and block Phases 2–3.

### R1 — Meta (Facebook/Instagram) connect, OAuth (parallel to YouTube) — REQUIRED
Product decision: Meta ships via OAuth only (no manual stream key). This blocks
the desktop's "Connect Meta" button.
```
POST /facebook/connect            → { url }         # FB OAuth consent URL
GET  /facebook/status             → { connected, pageName?, igUsername? }
POST /facebook/disconnect
POST /broadcasts/{id}/destinations/facebook/connect
      { target: "page"|"instagram", pageId? }
      → backend creates the FB/IG Live via Graph API, gets its RTMP URL+key,
        and adds it as an Output on this broadcast; returns { output }.
```
Env: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` (already listed in contract §7).
Scopes: Live Video API (`publish_video`, `pages_manage_posts`, IG equivalents).
Note: needs a Facebook app with Live Video permissions (App Review) — start that
approval early, it gates Meta go-live.

### R2 — Live orders (on-stream trade placement → MT bridge → WS + copiers)
Currently the Flutter app's `placeLiveOrder` is a local demo (no API call).
Needed so a trade placed on desktop actually executes and reaches copiers:
```
POST /broadcasts/{id}/orders
      { symbol, isBuy, orderType:"market"|"limit", lots, sl?, tp?, limitPrice? }
      → LiveTrade { id, symbol, isBuy, orderType, entryPrice, lots, sl, tp, status, openedAt }
POST /broadcasts/{id}/orders/{tradeId}/close → ClosedTrade { ..., exitPrice, pnl, closedAt }
GET  /broadcasts/{id}/orders   → [ LiveTrade ]   (open + pending)
GET  /broadcasts/{id}/history  → [ ClosedTrade ]
```
On place/close the backend MUST:
1. Execute on the creator's connected trade-enabled MT account (MetaAPI/EA bridge).
2. Broadcast over WS: `{ ch:"broadcast:<id>", type:"trade", data: LiveTrade }`.
3. Fan the trade to copiers who have `autoCopy` on for this creator (existing
   copy engine), and expose it for manual copy via
   `POST /copy/live/{broadcastId}/{tradeId} { accountId }` (contract §4.7).

### R3 — Confirm ingest protocol on `Broadcast`
Confirm `ingestUrl` is a full `rtmps://host:port/app` and `streamKey` is
appended as the stream name (FFmpeg: `-f flv "<ingestUrl>/<streamKey>"`), or
document the exact concatenation. (Cloudflare Live = `rtmps://live.cloudflare.com:443/live/` + key.)

### R4 — Creator gating
Confirm which endpoints require `role:creator` + `creatorStatus:approved`, and
what `POST /broadcasts` returns if the caller isn't an approved creator (so the
desktop shows the right "apply to become a creator" state).

---

## 5. Decisions (locked)
1. **Meta connect:** OAuth only (backend R1). No manual stream-key path.
2. **Desktop login:** both email/password AND phone OTP.
3. **Streaming:** fully switch to the backend single-ingest broadcast flow; the
   old "paste YouTube key + local tee" path is retired for the creator flow.

## 6. Blocking order
- Backend delivers **R1** (Meta OAuth) and **R2** (live orders) — the two
  gaps — plus confirms **R3/R4**.
- Desktop builds Phase 1 (auth + broadcast) against existing endpoints in
  parallel; Phase 2 Meta lands when R1 is ready; Phase 3 trades land when R2 is
  ready.
