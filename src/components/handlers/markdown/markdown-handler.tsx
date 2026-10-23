// SOURCING: the Markdown handler's views (plan D13): Crepe for the body
// (editor.tsx), the properties list for the frontmatter, react-markdown
// (NoteExcerpt) for a card below the canvas's edit zoom. useTextFile keeps
// them bound to the file.
import { basename, extname } from 'pathe'
import { EDIT_ZOOM } from '@/components/canvas/zoom'
import { NoteExcerpt } from '@/components/notes/note-excerpt'
import { useTextFile } from '@/lib/handlers/file-sync'
import type { FileCardProps, FileViewProps } from '@/lib/handlers/types'
import { FileMessage, FileStatusBar, textFileMessage } from '../file-status'
import { MarkdownEditor } from './editor'
import { readProperties, splitFrontmatter, writeProperty } from './frontmatter'
import { PropertiesEditor } from './properties'

const titleOf = (path: string) => basename(path, extname(path))

export function MarkdownPanel(file: FileViewProps) {
  const text = useTextFile(file)
  const message = textFileMessage(text)
  if (message !== null || text.text === undefined)
    return <FileMessage>{message}</FileMessage>

  const { head, yaml, body } = splitFrontmatter(text.text)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <FileStatusBar file={text} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PropertiesEditor
          properties={readProperties(yaml)}
          onChange={(key, value) =>
            text.setText(writeProperty({ head, yaml }, key, value) + body)
          }
        />
        <MarkdownEditor
          // A new file is a new editor.
          key={`${file.client.workspace.id}:${file.path}`}
          file={file}
          body={body}
          onBody={(next) => text.setText(head + next)}
        />
      </div>
    </div>
  )
}

/**
 * A note on a canvas: the live editor once the canvas is zoomed in enough to
 * read it, an excerpt below that.
 */
export function MarkdownCard({ zoom, ...file }: FileCardProps) {
  const text = useTextFile(file)
  const message = textFileMessage(text)
  if (message !== null || text.text === undefined)
    return <FileMessage className="text-xs">{message}</FileMessage>

  const { head, body } = splitFrontmatter(text.text)
  if (zoom >= EDIT_ZOOM)
    return (
      <div className="nodrag nowheel nopan flex h-full min-h-0 flex-col">
        <FileStatusBar file={text} />
        <MarkdownEditor
          key={`${file.client.workspace.id}:${file.path}`}
          file={file}
          body={body}
          onBody={(next) => text.setText(head + next)}
          className="theorem-note-card min-h-0 flex-1 overflow-y-auto"
        />
      </div>
    )
  return (
    <div className="flex h-full min-h-0 flex-col gap-1 overflow-hidden p-3">
      <span className="truncate text-sm font-medium text-ink">
        {titleOf(file.path)}
      </span>
      <NoteExcerpt
        markdown={body}
        className="min-h-0 flex-1 overflow-hidden text-ink-muted"
      />
    </div>
  )
}
