// SOURCING: none — the page skeleton both notebook forms are hosted in, and
// the escaping that lets JSON and compiled code sit inside it. Five lines of
// string escaping; a library would add a dependency for less than it saves.
import { themeRule } from '@/lib/blocks/sandbox/theme'
import type { ThemeState } from '@/lib/blocks/sandbox/theme'
import frameStyle from './notebook-frame.css?raw'

export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!,
  )

/** JSON that can sit in an inline script: no `</script>` or `<!--` survives. */
export const scriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c')

/** Compiled code that can sit in an inline script. */
export const inlineCode = (code: string) =>
  code.replace(/<\/(script)/gi, '<\\/$1').replaceAll('<!--', '<\\x21--')

/**
 * A notebook's page before the host adds its policy and bridge: the
 * notebook surface, the theme it opens with (so the first paint is already in
 * theme), and the form's own head and body.
 */
export function notebookPage(page: {
  title: string
  form: 'observable' | 'marimo'
  theme: ThemeState
  style?: string
  head?: string
  main: string
  scripts?: string
}): string {
  return `<!doctype html>
<html class="${page.theme.mode === 'dark' ? 'dark' : ''}"><head><meta charset="utf-8">
<title>${escapeHtml(page.title)}</title>
<style>${page.style ?? ''}\n${frameStyle}</style>
<style data-theorem-theme>${themeRule(page.theme)}</style>
${page.head ?? ''}
</head><body>
<main class="theorem-notebook" data-form="${page.form}">${page.main}</main>
${page.scripts ?? ''}
</body></html>`
}
