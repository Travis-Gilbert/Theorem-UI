import { readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const path = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url))

/**
 * Serves /stories.json: one entry per src/stories/<id>.story.tsx. Stories and their
 * fixture film stay out of a production build: the fixture app is not the product.
 */
function storiesManifest(): Plugin {
  let production = false
  const manifest = () =>
    JSON.stringify(
      readdirSync(path('./src/stories'))
        .filter((file) => file.endsWith('.story.tsx'))
        .map((file) => file.replace('.story.tsx', ''))
        .sort()
        .map((id) => ({ id, url: `/story/${id}` })),
      null,
      2,
    )
  return {
    name: 'stories-manifest',
    configResolved(config) {
      production = config.mode === 'production'
    },
    closeBundle() {
      if (production)
        rmSync(path('./dist/film/fixture'), { recursive: true, force: true })
    },
    configureServer(server) {
      server.middlewares.use('/stories.json', (_request, response) => {
        response.setHeader('content-type', 'application/json; charset=utf-8')
        response.end(manifest())
      })
    },
    generateBundle() {
      if (production) return
      this.emitFile({
        type: 'asset',
        fileName: 'stories.json',
        source: manifest(),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), storiesManifest()],
  resolve: {
    alias: {
      '@': path('./src'),
      // The Life rule, patterns and energy model are the app's own, shared untouched.
      '@life': path('../src/lib/life'),
    },
  },
  server: { fs: { allow: ['..'] } },
})
