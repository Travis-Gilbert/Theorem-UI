import { fileURLToPath } from 'node:url'
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
    // The IDE frame is the browser-only Theia build in ide/, served beside the
    // app so it shares this origin, its proxy and its session.
    nitro({
      preset: 'bun',
      publicAssets: [
        {
          baseURL: '/theia',
          dir: fileURLToPath(
            new URL('./ide/applications/browser/lib/frontend', import.meta.url),
          ),
          maxAge: 0,
        },
      ],
    }),
    viteReact(),
  ],
})

export default config
