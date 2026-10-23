import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import svgr from 'vite-plugin-svgr'

// `bun run deploy:cloudflare` builds for Workers; every other build is the Bun server.
const cloudflare = process.env.NITRO_PRESET === 'cloudflare_module'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // Noun icons are filled contours on a 100 viewBox with no declared fill.
    svgr({
      svgrOptions: {
        dimensions: false,
        svgProps: {
          'data-icon': '',
          'aria-hidden': 'true',
          focusable: 'false',
        },
      },
    }),
    tanstackStart(),
    // Self-hosted on Bun beside the Theorem authority, or the theorem-ui Worker
    // on theorem.rs. The IDE frame is the browser-only Theia build in ide/,
    // served beside the app so it shares this origin, its proxy and its session.
    nitro({
      preset: cloudflare ? 'cloudflare_module' : 'bun',
      cloudflare: {
        deployConfig: true,
        nodeCompat: true,
        // Secrets are set with `wrangler secret put`; see README.
        wrangler: {
          name: 'theorem-ui',
          compatibility_date: '2026-10-01',
          routes: [{ pattern: 'theorem.rs', custom_domain: true }],
          // Also reachable at theorem-ui.<account>.workers.dev.
          workers_dev: true,
          vars: { THEOREM_API_URL: 'https://theoremweb.com' },
        },
      },
      publicAssets: [
        {
          baseURL: '/theia',
          dir: fileURLToPath(
            new URL('./ide/applications/browser/lib/frontend', import.meta.url),
          ),
          maxAge: 0,
          // Workers cap a static asset at 25 MiB; Theia's source maps exceed it.
          ignore: cloudflare ? ['**/*.map', '**/*.map.gz'] : undefined,
        },
      ],
    }),
    viteReact(),
  ],
})

export default config
