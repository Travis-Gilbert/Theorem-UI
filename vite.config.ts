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
      // Desktop mode (docs/desktop/local-server.md) lives in the Bun server
      // only: it loads native addons a Worker cannot run. The plugin and every
      // route answer only when the desktop host started the server, so the Bun
      // build for the web carries them inert.
      ...(!cloudflare && {
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
        // trash runs a helper binary and @rustyreddb/node loads a native addon,
        // each sitting beside its module; copied whole so the binary ships
        // with it instead of being lost to bundling.
        traceDeps: ['trash*', '@rustyreddb/node*'],
      }),
    }),
    viteReact(),
  ],
})

export default config
