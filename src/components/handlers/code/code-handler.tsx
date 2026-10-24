// SOURCING: @uiw/react-codemirror (CodeMirror 6 as a React component, with
// its light and dark themes) and @codemirror/language-data (the language for
// a file name, loaded on demand), each language loaded once through
// @tanstack/react-query. useTextFile saves; the desktop host opens the native
// editor. Running code is Phase 4's: it arrives as a CodeExtension, whose
// CodeMirror extensions join the editor's and whose Toolbar joins the
// panel's toolbar and the card's last-run slot.
import { useQuery } from '@tanstack/react-query'
import CodeMirror from '@uiw/react-codemirror'
import { useTheme } from 'next-themes'
import { basename } from 'pathe'
import { useMemo } from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { hostActions } from '@/lib/handlers/actions'
import { useTextFile } from '@/lib/handlers/file-sync'
import { useHandlerRegistry } from '@/lib/handlers/registry'
import type { FileCardProps, FileViewProps } from '@/lib/handlers/types'
import { FileMessage, FileStatusBar, textFileMessage } from '../file-status'
import { languageFor } from './language'

function useLanguage(path: string) {
  const description = languageFor(path)
  const support = useQuery({
    queryKey: ['codemirror', 'language', description?.name ?? null],
    queryFn: () => (description ? description.load() : null),
    staleTime: Infinity,
  })
  return { name: description?.name, support: support.data ?? undefined }
}

/** The CodeExtensions' toolbars, such as Run and its last result. */
function ExtensionToolbars(file: FileViewProps) {
  const extensions = useHandlerRegistry((s) => s.codeExtensions)
  return extensions.map(
    ({ id, Toolbar }) => Toolbar && <Toolbar key={id} {...file} />,
  )
}

export function CodePanel(file: FileViewProps) {
  const { client, path, entry } = file
  const text = useTextFile(file)
  const language = useLanguage(path)
  const { resolvedTheme } = useTheme()
  const codeExtensions = useHandlerRegistry((s) => s.codeExtensions)
  const extensions = useMemo(() => {
    const view = { client, path, entry }
    return [
      ...(language.support ? [language.support] : []),
      ...codeExtensions.flatMap((x) => x.extensions(view)),
    ]
  }, [client, path, entry, language.support, codeExtensions])
  const host = hostActions(file)

  const message = textFileMessage(text)
  if (message !== null) return <FileMessage>{message}</FileMessage>
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-separator px-2">
        <span className="me-auto ps-1 text-xs text-ink-faint">
          {language.name ?? 'Plain text'}
        </span>
        <ExtensionToolbars {...file} />
        {host && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void host.openInNativeEditor()}
          >
            <Icon.Ide />
            Open in native editor
          </Button>
        )}
      </div>
      <FileStatusBar file={text} />
      <CodeMirror
        value={text.text}
        onChange={text.setText}
        extensions={extensions}
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        height="100%"
        className="min-h-0 flex-1 overflow-hidden text-[13px]"
        aria-label={`${basename(path)}, ${language.name ?? 'text'}`}
      />
    </div>
  )
}

const PREVIEW_LINES = 14

/** A code file as a card: its name, its first lines, and the last run. */
export function CodeCard({ client, path, entry }: FileCardProps) {
  const text = useTextFile({ client, path })
  const language = languageFor(path)
  const message = textFileMessage(text)
  return (
    <div className="flex h-full min-h-0 flex-col bg-raised">
      <div className="flex shrink-0 items-baseline gap-2 border-b border-separator px-3 py-1.5">
        <span className="min-w-0 truncate text-sm font-medium text-ink">
          {basename(path)}
        </span>
        {language && (
          <span className="shrink-0 text-xs text-ink-faint">
            {language.name}
          </span>
        )}
      </div>
      <pre className="min-h-0 flex-1 overflow-hidden p-3 font-mono text-[11px] leading-snug text-ink-muted">
        {message ?? text.text?.split('\n').slice(0, PREVIEW_LINES).join('\n')}
      </pre>
      <div
        data-slot="last-run"
        className="nodrag flex shrink-0 items-center gap-1.5 border-t border-separator px-2 py-1 empty:hidden"
      >
        <ExtensionToolbars client={client} path={path} entry={entry} />
      </div>
    </div>
  )
}
