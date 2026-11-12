import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import svgr from 'vite-plugin-svgr'

// `bun run deploy:cloudflare` builds for Workers; every other build is the Bun server.
const cloudflare = process.env.NITRO_PRESET === 'cloudflare_module'

// The Worker's routes leave out src/routes/desktop (D4: the web deployment
// never serves workspace or bridge routes, and their native addons cannot load
// in a Worker). That route tree is generated apart from the committed one, in
// TanStack's own ignored folder, and stands in for it in this build only.
const workerRouteTree = fileURLToPath(
  new URL('./.tanstack/routeTree.worker.gen.ts', import.meta.url),
)

// loro's base64 build compiles its wasm from bytes when it loads, which a
// Worker refuses. Its bundler build imports the .wasm instead, and nitro hands
// that to the Worker as a module (loro-dev/loro#440). The browser keeps base64.
const loroForWorkers: Plugin = {
  name: 'theorem:loro-for-workers',
  enforce: 'pre',
  applyToEnvironment: (environment) => environment.name !== 'client',
  resolveId(id, importer) {
    if (id === 'loro-crdt/base64')
      return this.resolve('loro-crdt/bundler', importer, { skipSelf: true })
  },
}
const serverOnlyPackages = ['trash', '@rustyreddb/node']

// Pierre's diffs build their wasm highlighter at import time, which no server
// bundle here survives: the import throws before a request is answered. A
// diff is only ever shown when a person opens a change row, in the browser,
// so servers get components that render nothing and the browser keeps the
// real package, lazily (delegation-parts).
const diffsServerStub: Plugin = {
  name: 'theorem:diffs-server-stub',
  enforce: 'pre',
  applyToEnvironment: (environment) => environment.name !== 'client',
  resolveId(id) {
    if (id === '@pierre/diffs/react') return '\0theorem:pierre-diffs-react'
  },
  load(id) {
    if (id === '\0theorem:pierre-diffs-react')
      return 'export const PatchDiff = () => null;\nexport const MultiFileDiff = () => null;\n'
  },
}

// The personal Theorem serves the API and is its OAuth issuer; it grants the
// theorem-ui client models:invoke.
const theoremVars = {
  THEOREM_API_URL: 'https://travis-theorem-personal.fly.dev',
  THEOREM_OAUTH_CLIENT_ID: 'theorem-ui',
}

const config = defineConfig({
  // The dev server's client dependency scan follows the route tree into the
  // desktop routes, and cannot pre-bundle these for the browser: rolldown
  // cannot load a .node file, and trash's globby needs unicorn-magic's Node
  // build. The client never imports them, so they are left out.
  optimizeDeps: { exclude: serverOnlyPackages },
  resolve: {
    tsconfigPaths: true,
    alias: cloudflare
      ? [{ find: /^\.\/routeTree\.gen$/, replacement: workerRouteTree }]
      : [],
  },
  plugins: [
    cloudflare && loroForWorkers,
    diffsServerStub,
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
    tanstackStart({
      router: cloudflare
        ? {
            routeFileIgnorePattern: '^desktop$',
            generatedRouteTree: workerRouteTree,
          }
        : {},
    }),
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
          vars: theoremVars,
          // Workers Builds deploys other branches with `wrangler preview`,
          // which takes its vars from here; Previews talk to the same Theorem.
          previews: { vars: theoremVars },
        },
      },
      publicAssets: [
        // The page a webview (the markdown preview) runs in, which Theia's
        // build puts beside the frontend for a backend to serve at /webview.
        // It comes before /theia, which dev otherwise answers with a 404.
        {
          baseURL: '/theia/webview',
          dir: fileURLToPath(
            new URL(
              './ide/applications/browser/lib/webview/pre',
              import.meta.url,
            ),
          ),
          maxAge: 0,
        },
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
        // Copied whole so each binary ships beside its module instead of
        // being lost to bundling.
        traceDeps: serverOnlyPackages.map((name) => `${name}*`),
      }),
    }),
    viteReact(),
  ],
})

export default config
