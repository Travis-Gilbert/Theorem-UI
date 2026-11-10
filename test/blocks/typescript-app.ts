// A TypeScript App's HTML from its files, the way an App carries them.
import { SOURCE_TYPE } from '@/lib/blocks/app-source'

export function typescriptApp(
  files: Record<string, string>,
  options: { uses?: string; body?: string; entry?: string } = {},
): string {
  const scripts = Object.entries(files)
    .map(
      ([path, source]) =>
        `<script type="${SOURCE_TYPE}" data-path="${path}"${path === options.entry ? ' data-entry' : ''}>${source}</script>`,
    )
    .join('\n')
  const uses = options.uses
    ? `<meta name="theorem:uses" content='${options.uses}'>`
    : ''
  return `<!doctype html><html><head><title>App</title>${uses}</head><body>${options.body ?? '<div id="root"></div>'}\n${scripts}</body></html>`
}
