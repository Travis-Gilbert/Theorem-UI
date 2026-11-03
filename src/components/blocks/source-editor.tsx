// SOURCING: @uiw/react-codemirror (CodeMirror 6 as a React component with its
// light and dark themes, as the code handler uses it), @codemirror/lang-javascript,
// lang-yaml and lang-html (a block's or an app's language), next-themes (the
// app's theme). A live block's source, with its last-run values in the margin.
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { yaml } from '@codemirror/lang-yaml'
import CodeMirror from '@uiw/react-codemirror'
import { useTheme } from 'next-themes'
import { useMemo } from 'react'
import type { WorkspaceId } from '@/lib/workspace/types'
import { lastRunMargin } from './last-run-margin'

const TYPESCRIPT = new Set(['ts', 'tsx', 'typescript'])
const JSX = new Set(['tsx', 'jsx'])

/** The CodeMirror language for a fence's language word, or `html` for an app. */
function languageOf(lang: string) {
  if (lang === 'query' || lang === 'agent') return yaml()
  if (lang === 'html') return html()
  return javascript({ jsx: JSX.has(lang), typescript: TYPESCRIPT.has(lang) })
}

const SETUP = {
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
}

export function SourceEditor({
  value,
  onChange,
  lang,
  workspaceId,
  readOnly = false,
  label,
}: {
  value: string
  onChange?: (value: string) => void
  /** The fence's language word: `tsx`, `query`, `agent`. */
  lang: string
  /** Shows last-run values when set: code that runs. */
  workspaceId?: WorkspaceId
  readOnly?: boolean
  label: string
}) {
  const { resolvedTheme } = useTheme()
  const extensions = useMemo(
    () => [
      languageOf(lang),
      ...(workspaceId ? [lastRunMargin(workspaceId)] : []),
    ],
    [lang, workspaceId],
  )
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      readOnly={readOnly}
      editable={!readOnly}
      basicSetup={SETUP}
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      aria-label={label}
      className="text-xs"
    />
  )
}
