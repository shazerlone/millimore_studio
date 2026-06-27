import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // Keep node_modules (ffmpeg-static, electron-store, socket.io-client)
    // external so they resolve from node_modules at runtime and are packaged
    // — and asar-unpacked — correctly by electron-builder.
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.js') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.js') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        '@theme': resolve(__dirname, 'src/renderer/theme'),
        '@components': resolve(__dirname, 'src/renderer/components'),
        '@screens': resolve(__dirname, 'src/renderer/screens')
      }
    },
    plugins: [react()]
  }
})
