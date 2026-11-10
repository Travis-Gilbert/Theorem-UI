// SOURCING: @pierre/diffs/react MultiFileDiff in the code blocks' themes (as chat/delegation-parts), diff's diffLines for the plain-words summary beside it, next-themes
import { MultiFileDiff } from '@pierre/diffs/react'
import { diffLines } from 'diff'
import { useTheme } from 'next-themes'
import { useCodeThemes } from '@/lib/palette'

const count = (
  changes: ReturnType<typeof diffLines>,
  side: 'added' | 'removed',
) => changes.reduce((sum, change) => sum + (change[side] ? change.count : 0), 0)

const lines = (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`

/**
 * What changes between two texts: a unified diff, and the same in a sentence
 * for anyone the colours do not reach.
 */
export function TextDiff({
  before,
  after,
  name = 'text.md',
}: {
  before: string
  after: string
  name?: string
}) {
  const { resolvedTheme } = useTheme()
  const codeThemes = useCodeThemes()
  const changes = diffLines(before, after)
  const added = count(changes, 'added')
  const removed = count(changes, 'removed')
  if (!added && !removed)
    return <p className="text-sm text-ink-muted">No differences.</p>
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-ink-muted">
        {lines(added)} added, {lines(removed)} removed.
      </p>
      <div className="max-h-80 overflow-auto rounded-md border border-separator text-xs">
        <MultiFileDiff
          oldFile={{ name, contents: before }}
          newFile={{ name, contents: after }}
          options={{
            theme: codeThemes,
            themeType: resolvedTheme === 'dark' ? 'dark' : 'light',
            diffStyle: 'unified',
            disableFileHeader: true,
            overflow: 'wrap',
          }}
        />
      </div>
    </div>
  )
}
