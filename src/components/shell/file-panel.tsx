// SOURCING: the assistant-ui SyntaxHighlighter element (react-shiki, github themes; the language is the file's extension, which Shiki resolves through its own aliases), @tanstack/react-query via lib/theorem/project-files
import { useQuery } from '@tanstack/react-query'
import { SyntaxHighlighter } from '@/components/assistant-ui/elements/shiki-highlighter'
import { describeError } from '@/lib/theorem/client'
import { fileContentQuery } from '@/lib/theorem/project-files'

/** A project file, read-only, as the server holds it now. */
export function FilePanel({
  projectId,
  path,
}: {
  projectId: string
  path: string
}) {
  const content = useQuery(fileContentQuery(projectId, path))
  const extension = /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase()

  return (
    <div className="flex h-full flex-col bg-artifact">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-separator px-3 font-mono text-xs text-ink-muted">
        <span className="min-w-0 truncate">{path}</span>
        {content.data && (
          <span className="ms-auto shrink-0 text-ink-faint">
            {content.data.byteLen.toLocaleString()} bytes
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {content.isPending ? (
          <p className="p-4 text-sm text-ink-muted">Reading {path}…</p>
        ) : content.error ? (
          <p className="p-4 text-sm text-error-ink">
            {describeError(content.error)}
          </p>
        ) : (
          <SyntaxHighlighter
            code={content.data.text}
            language={extension ?? 'text'}
            className="[&_pre]:min-h-full [&_pre]:rounded-none! [&_pre]:border-0! [&_pre]:bg-transparent!"
          />
        )}
      </div>
    </div>
  )
}
