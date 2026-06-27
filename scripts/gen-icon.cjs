/**
 * Generates the Millimore Desktop app icon (build/icon.png, 1024×1024) with no
 * external image tooling — a pure-Node PNG encoder. Draws the blue 4-point
 * Millimore star on the dark brand background. electron-builder converts this
 * single PNG into .icns / .ico at package time.
 *
 * Run: node scripts/gen-icon.cjs
 */
const zlib = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')

const SIZE = 1024
const center = SIZE / 2

// Brand colors
const BG = [15, 23, 42, 255] // #0F172A
const STAR = [37, 99, 235, 255] // #2563EB

function hypotAngle(dx, dy) {
  return { r: Math.hypot(dx, dy), t: Math.atan2(dy, dx) }
}

// 4-point sparkle: max radius along the axes, deep concave valleys at 45°.
function starRadius(theta, R) {
  return R * (1 - 0.84 * Math.abs(Math.sin(2 * theta)))
}

function buildPixels() {
  const R = SIZE * 0.4
  const buf = Buffer.alloc(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const { r, t } = hypotAngle(x - center, y - center)
      const edge = starRadius(t, R)
      // Antialias the star edge over a 2px band.
      const aa = Math.max(0, Math.min(1, edge - r + 1))
      const px = blend(BG, STAR, aa)
      const i = (y * SIZE + x) * 4
      buf[i] = px[0]
      buf[i + 1] = px[1]
      buf[i + 2] = px[2]
      buf[i + 3] = 255
    }
  }
  return buf
}

function blend(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ]
}

// ---- minimal PNG encoder ----
function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePNG(rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // rows with filter byte 0 prefix
  const stride = SIZE * 4
  const raw = Buffer.alloc((stride + 1) * SIZE)
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const out = path.join(__dirname, '..', 'build', 'icon.png')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, encodePNG(buildPixels()))
console.log('Wrote', out)
