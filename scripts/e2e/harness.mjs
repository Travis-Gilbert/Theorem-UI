// Serves one of the pages under scripts/e2e/ with Vite, for a scenario that
// needs the app's own modules in a browser and no Theorem server.
//
// By default the page is served as the dev server serves it. With `--built`
// it is built as for production first and the build is served: a worker or a
// wasm module the bundler drops or misplaces shows up only there.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build, createServer, preview } from 'vite'

const root = resolve(import.meta.dirname, '../..')

const config = {
  root,
  configFile: false,
  logLevel: 'error',
  resolve: {
    tsconfigPaths: true,
    // The server's request storage is left out of the app's client build;
    // these pages are served without that build.
    alias: {
      '@tanstack/start-storage-context': resolve(
        root,
        'scripts/e2e/start-storage.ts',
      ),
    },
  },
}

/** Serves `scripts/e2e/<name>/index.html`. Returns its address and how to stop. */
export async function servePage(name) {
  const path = `scripts/e2e/${name}/index.html`
  const built = process.argv.includes('--built')
  if (!built) {
    const server = await createServer({
      ...config,
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()
    const { port } = server.httpServer.address()
    return {
      built,
      url: `http://127.0.0.1:${port}/${path}`,
      close: () => server.close(),
    }
  }
  const outDir = mkdtempSync(join(tmpdir(), `theorem-e2e-${name}-`))
  await build({
    ...config,
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2022',
      rollupOptions: { input: resolve(root, path) },
    },
  })
  const server = await preview({
    ...config,
    build: { outDir },
    preview: { host: '127.0.0.1', port: 0 },
  })
  const { port } = server.httpServer.address()
  return {
    built,
    url: `http://127.0.0.1:${port}/${path}`,
    close: async () => {
      await server.close()
      rmSync(outDir, { recursive: true, force: true })
    },
  }
}
