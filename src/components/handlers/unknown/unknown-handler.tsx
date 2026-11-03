// SOURCING: pretty-bytes (the size) and Intl.DateTimeFormat (the date) over
// the workspace entry, the MIME type from the registry, and OpenWith for the
// other views, Finder and the system's app. The fallback for files no other
// handler opens (plan D13).
import { basename } from 'pathe'
import prettyBytes from 'pretty-bytes'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  FALLBACK_HANDLER_ID,
  extensionOf,
  mimeOf,
} from '@/lib/handlers/registry'
import type { FileCardProps, FileViewProps } from '@/lib/handlers/types'
import { OpenWith } from '../open-with'

const modified = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** What kind of file this is, as far as its name says. */
function kindOf(path: string) {
  const extension = extensionOf(path)
  return mimeOf(path) ?? (extension ? `.${extension} file` : 'File')
}

export function UnknownPanel(file: FileViewProps) {
  const { entry, path } = file
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <Icon.File className="size-10 text-ink-faint" />
        <h3 className="max-w-full truncate text-base font-medium" title={path}>
          {basename(path)}
        </h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-start text-sm">
          <dt className="text-ink-faint">Kind</dt>
          <dd className="truncate">{kindOf(path)}</dd>
          <dt className="text-ink-faint">Size</dt>
          <dd>{prettyBytes(entry.size)}</dd>
          <dt className="text-ink-faint">Modified</dt>
          <dd>{modified.format(entry.mtimeMs)}</dd>
        </dl>
        <OpenWith
          file={file}
          current={FALLBACK_HANDLER_ID}
          render={<Button variant="outline" size="sm" />}
        >
          Open with…
        </OpenWith>
      </div>
    </div>
  )
}

/** The file's name, kind and size, with "Open with". */
export function UnknownCard({ client, path, entry }: FileCardProps) {
  return (
    <div className="flex h-full min-h-0 items-center gap-3 overflow-hidden bg-raised p-3">
      <Icon.File className="size-6 shrink-0 text-ink-faint" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">
          {basename(path)}
        </div>
        <div className="truncate text-xs text-ink-faint">
          {kindOf(path)}, {prettyBytes(entry.size)}
        </div>
      </div>
      <OpenWith
        file={{ client, path, entry }}
        current={FALLBACK_HANDLER_ID}
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Open with"
            className="nodrag shrink-0"
          />
        }
      >
        <Icon.More />
      </OpenWith>
    </div>
  )
}
