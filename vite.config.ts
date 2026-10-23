import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import svgr from 'vite-plugin-svgr'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // Noun icons are filled contours on a 100 viewBox with no declared fill.
    svgr({
      svgrOptions: {
        dimensions: false,
        svgProps: { 'data-icon': '', 'aria-hidden': 'true', focusable: 'false' },
      },
    }),
    tanstackStart(),
    // Self-hosted on Bun beside the Theorem authority; the proxy reaches it on localhost.
    nitro({
      preset: 'bun',
      // Desktop mode (docs/desktop/local-server.md). The plugin and every route
      // answer only when the desktop host started the server, so the web
      // deployment carries them inert.
      plugins: ['./src/server/desktop/plugin.ts'],
      routes: {
        '/desktop/session': {
          handler: './src/server/desktop/session.ts',
          method: 'GET',
        },
        '/desktop/host/rpc': {
          handler: './src/server/desktop/rpc.ts',
          method: 'POST',
        },
        '/desktop/host/events': {
          handler: './src/server/desktop/events.ts',
          method: 'GET',
        },
      },
    }),
    viteReact(),
  ],
})

export default config
