import { existsSync } from 'node:fs'
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
// Provisioning is opt-in so a preview or a Worker account without R2 can
// still deploy. The local test uses the same binding, backed by Miniflare.
const q8Bucket = process.env.THEOREM_SEMANTIC_Q8_R2_BUCKET?.trim()

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

// The App graph database and the workbench's device checkpoint keep their
// records in @rustyreddb/browser: a dedicated worker of the page, on the origin
// private file system. No server opens one — a Worker has neither OPFS nor a
// page Worker — but the lazy imports in blocks/app-db and workbench/layout/
// checkpoint still pull its wasm into the server bundle. The vendored 0.2.0
// tarball grew that wasm to ~16.5 MiB, which alone pushed the Worker past
// Cloudflare's 63.9 MiB uncompressed limit and failed every deploy (code
// 10027). Servers get inert stubs; the browser keeps the real package, lazily.
const rustyredServerStub: Plugin = {
  name: 'theorem:rustyred-server-stub',
  enforce: 'pre',
  applyToEnvironment: (environment) => environment.name !== 'client',
  resolveId(id) {
    if (id === '@rustyreddb/browser' || id.startsWith('@rustyreddb/browser/'))
      return '\0theorem:rustyred-browser'
  },
  load(id) {
    if (id === '\0theorem:rustyred-browser')
      return `const unavailable = () =>
  Promise.reject(new Error('RustyRedDB runs in a browser worker, not on the server.'))
export const open = unavailable
export const inMemory = unavailable
export default ''
`
  },
}

// The personal Theorem serves the API and is its OAuth issuer; it grants the
// theorem-ui client models:invoke.
const theoremVars = {
  THEOREM_API_URL: 'https://travis-theorem-personal.fly.dev',
  THEOREM_OAUTH_CLIENT_ID: 'theorem-ui',
  // The iOS app's sign-in callback on theorem.rs (mobile/docs/sign-in.md).
  THEOREM_IOS_APP_IDS: 'K5CTABMVHN.rs.theorem.app',
}

// The browser Q8 producer's code assets (scripts/semantic-q8/stage.mjs) are
// small, pinned, and ship with the build as public assets. Its model weights
// are not: they exceed a Worker asset's 25 MiB, so src/server/semantic-q8.ts
// streams them. This directory is the code-only stage and never holds a model
// (stage.mjs refuses to write one there), so no ignore glob keeps a weight out
// of the build. Without it the build carries no Q8 assets and the browser's
// producer refuses with runtime_unavailable. The assets mount one directory at
// a time, never /semantic/q8/v1 itself: Nitro answers 404 for any path under a
// public asset's baseURL that is not one of its files, which would shadow the
// model route.
const semanticQ8Dir = fileURLToPath(
  new URL('./.semantic-q8/public', import.meta.url),
)
const semanticQ8Staged = existsSync(`${semanticQ8Dir}/manifest.json`)

const config = defineConfig({
  // Oracle harnesses and their captured DOM are not application sources.
  // Their writes must not hot-reload another concurrent browser check.
  server: {
    watch: {
      ignored: [
        /[/\\]docs[/\\]plans[/\\]composable-appearance[/\\]evidence[/\\]/,
        /[/\\](?:scripts|tests)[/\\]design-oracles[/\\]/,
      ],
    },
  },
  // The dev server's client dependency scan follows the route tree into the
  // desktop routes, and cannot pre-bundle these for the browser: rolldown
  // cannot load a .node file, and trash's globby needs unicorn-magic's Node
  // build. The client never imports them, so they are left out.
  optimizeDeps: { exclude: serverOnlyPackages },
  // The composer's language detector imports its model weights (a .bin) as
  // an inlined asset in the chunk it loads on first use (chat/code-language).
  assetsInclude: ['**/*.bin'],
  resolve: {
    tsconfigPaths: true,
    alias: cloudflare
      ? [{ find: /^\.\/routeTree\.gen$/, replacement: workerRouteTree }]
      : [],
  },
  plugins: [
    cloudflare && loroForWorkers,
    diffsServerStub,
    rustyredServerStub,
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
      minify: cloudflare,
      // The dictation WebSocket upgrades through the Bun preset's crossws
      // adapter; the fetch proxy alone drops the upgrade header.
      features: { websocket: true },
      // Keep dependencies of the lazy Neon Auth routes out of eagerly loaded
      // library chunks. The browser adapter generates a UUID on module load.
      ...(cloudflare && {
        rolldownConfig: {
          output: { codeSplitting: { includeDependenciesRecursively: false } },
        },
      }),
      cloudflare: {
        deployConfig: true,
        nodeCompat: true,
        // Secrets are set with `wrangler secret put`; see README.
        wrangler: {
          name: 'theorem-ui',
          compatibility_date: '2026-10-01',
          // Link previews use the public Internet boundary, including same-zone URLs.
          compatibility_flags: ['global_fetch_strictly_public'],
          routes: [{ pattern: 'theorem.rs', custom_domain: true }],
          // Also reachable at theorem-ui.<account>.workers.dev.
          workers_dev: true,
          vars: theoremVars,
          ...(q8Bucket && {
            r2_buckets: [{ binding: 'THEOREM_Q8_MODELS', bucket_name: q8Bucket }],
          }),
          // Workers Builds deploys other branches with `wrangler preview`,
          // which takes its vars from here; Previews talk to the same Theorem.
          previews: { vars: theoremVars },
        },
      },
      publicAssets: [
        ...(semanticQ8Staged
          ? [
              ...['producer', 'transformers', 'runtime'].map((name) => ({
                baseURL: `/semantic/q8/v1/${name}`,
                dir: `${semanticQ8Dir}/${name}`,
                maxAge: 31536000,
              })),
            ]
          : []),
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
      routes: {
        // Q8 weights stream from the staged directory on Bun, or private R2
        // behind the signed-in session on Cloudflare.
        '/semantic/q8/v1/models/**': {
          handler: './src/server/semantic-q8.ts',
        },
        ...(cloudflare && {
          '/api/files/v1/**': { handler: './src/server/files-proxy.ts' },
          '/api/project-files/v1/**': {
            handler: './src/server/files-proxy.ts',
          },
        }),
        // Dictation upgrades to a WebSocket on both hosts: the fetch proxy
        // drops the upgrade header, so this nitro route hands it to crossws
        // (the Bun adapter locally, the cloudflare_module adapter on the
        // Worker).
        '/api/chat/v1/dictation': {
          handler: './src/server/dictation-proxy.ts',
          method: 'GET',
        },
        ...(!cloudflare && {
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
        }),
      },
      ...(!cloudflare && {
        plugins: ['./src/server/desktop/plugin.ts'],
        // Copied whole so each binary ships beside its module instead of
        // being lost to bundling.
        traceDeps: serverOnlyPackages.map((name) => `${name}*`),
      }),
    }),
    viteReact(),
  ],
})

export default config
