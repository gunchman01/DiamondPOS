import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// electron-vite builds three separate bundles:
//   main     -> the Node.js side (windows, database, store server, updates)
//   preload  -> the small, safe bridge between Node and the UI
//   renderer -> the React UI that runs inside the window
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})
