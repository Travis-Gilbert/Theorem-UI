// SOURCING: the upstream OpenIDEA vite.config.ts (React plugin, the `@` alias, the Tauri core
// alias) is the model. What differs is only what the browser build must answer differently: the
// Tauri modules resolve to the browser host in src/host, the editor's history commands resolve
// to the session-aware ones, and two native-window components are replaced by empty ones.
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { workspaceStandIn } from './dev/vite-stand-in'

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const openidea = at('./vendor/openidea/src')
const host = at('./src/host')

/**
 * `workbench/TitleBar` and `workbench/Workbench` import the caption buttons and the frameless
 * window resize handles by relative path; a browser tab has neither, so those two imports
 * resolve to empty components. Nothing else about the vendored files changes.
 */
function replaceNativeWindowChrome(): Plugin {
  const replacements: Record<string, string> = {
    './WindowControls': `${host}/stubs/WindowControls.tsx`,
    './WindowResizeHandles': `${host}/stubs/WindowResizeHandles.tsx`,
  }
  return {
    name: 'theorem-ide-cm:native-window-chrome',
    enforce: 'pre',
    resolveId(source, importer) {
      const target = replacements[source]
      return target && importer?.startsWith(`${openidea}/workbench/`) ? target : null
    },
  }
}

export default defineConfig({
  // Relative, so the same build serves from `/`, `/ide-cm/` or wherever Theorem UI mounts it.
  base: './',
  plugins: [replaceNativeWindowChrome(), react(), workspaceStandIn()],
  publicDir: at('./vendor/openidea/public'),
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${openidea}/` },
      { find: /^@host\//, replacement: `${host}/` },
      { find: /^@tauri-apps\/api\/core$/, replacement: `${openidea}/platform/tauriCore.ts` },
      { find: /^@tauri-apps\/api\/event$/, replacement: `${host}/tauri-event.ts` },
      { find: /^@tauri-apps\/api\/path$/, replacement: `${host}/tauri-path.ts` },
      { find: /^@tauri-apps\/api\/(?:window|webview|webviewWindow)$/, replacement: `${host}/tauri-window.ts` },
      { find: /^@tauri-apps\/plugin-dialog$/, replacement: `${host}/plugin-dialog.ts` },
      { find: /^@tauri-apps\/plugin-opener$/, replacement: `${host}/plugin-opener.ts` },
      // Undo and redo go to the shared session when the editor's document has one.
      { find: /^@codemirror\/commands$/, replacement: `${host}/cm-commands.ts` },
    ],
  },
  server: { port: 1430, strictPort: true, fs: { allow: [at('.'), at('..')] } },
  preview: { port: 1431, strictPort: true },
  build: { target: 'safari16', sourcemap: true },
})
