// SOURCING: smol-toml parses OpenIDEA's own language definitions (`languages/*.toml`), which are
// the same files its Rust backend loads for the `languages` command; the table is built from
// them at bundle time, not rewritten. A language server or debugger section is read for the two
// flags the frontend shows; none runs here.

import { parse } from 'smol-toml'
import type { LanguageInfo_Serialize } from '@/bindings'
import { sources } from './language-sources'

interface Definition {
  id: string
  name: string
  extensions?: string[]
  filenames?: string[]
  'first-line'?: string
  'line-comment'?: string
  'block-comment'?: [string, string]
  indent?: { 'tab-size': number; 'insert-spaces': boolean }
  'ui-mode'?: string
  'language-servers'?: { name: string }[]
  debugger?: unknown
}

function describe(definition: Definition): LanguageInfo_Serialize {
  const info: LanguageInfo_Serialize = {
    id: definition.id,
    name: definition.name,
    extensions: definition.extensions ?? [],
    uiMode: definition['ui-mode'] ?? null,
    lineComment: definition['line-comment'] ?? null,
    blockComment: definition['block-comment'] ?? null,
    indent: definition.indent
      ? { tabSize: definition.indent['tab-size'], insertSpaces: definition.indent['insert-spaces'] }
      : null,
  }
  if (definition.debugger) info.debuggable = true
  if (definition['language-servers']?.length) info.languageServers = definition['language-servers'].map((s) => s.name)
  if (definition.filenames?.length) info.filenames = definition.filenames
  if (definition['first-line']) info.firstLine = definition['first-line']
  return info
}

export const LANGUAGES: readonly LanguageInfo_Serialize[] = [
  ...Object.values(sources).map((source) => describe(parse(source) as unknown as Definition)),
  { id: 'plaintext', name: 'Plain Text', extensions: ['txt'], uiMode: null, lineComment: null, blockComment: null, indent: null },
].sort((a, b) => a.name.localeCompare(b.name))

/** The language of a file by exact name, then extension, then first line; `plaintext` when none. */
export function languageOf(path: string, firstLine = ''): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const lower = name.toLowerCase()
  const byName = LANGUAGES.find((l) => l.filenames?.some((f) => f === name || f.toLowerCase() === lower))
  if (byName) return byName.id
  const dot = name.lastIndexOf('.')
  if (dot > 0 || (dot === 0 && name.length > 1)) {
    const ext = name.slice(dot + 1).toLowerCase()
    const byExtension = LANGUAGES.find((l) => l.extensions.includes(ext))
    if (byExtension) return byExtension.id
  }
  const byFirstLine = LANGUAGES.find((l) => {
    if (!l.firstLine) return false
    try {
      return new RegExp(l.firstLine).test(firstLine)
    } catch {
      return false
    }
  })
  return byFirstLine?.id ?? 'plaintext'
}
