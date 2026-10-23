// SOURCING: @codemirror/state and @codemirror/view (a StateField of line-end
// widget decorations filled by a StateEffect, and a ViewPlugin that looks the
// values up), the shape of CodeMirror's own decoration examples. The layout is
// Margin Notes': each value at the end of the line that produced it. Values
// are kept by the hash of the source that produced them (last-run.ts), so an
// edited line shows nothing until the block runs again.
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import type { Extension, Text } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { sha256Hex } from '@/lib/blocks/compile'
import { fetchLastRun, onLastRun } from '@/lib/blocks/last-run'
import type { LastRun } from '@/lib/blocks/last-run'
import type { WorkspaceId } from '@/lib/workspace/types'

const showRun = StateEffect.define<LastRun | null>()

class ValueWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly failed: boolean,
  ) {
    super()
  }

  override eq(other: ValueWidget) {
    return other.text === this.text && other.failed === this.failed
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = this.failed
      ? 'cm-theorem-last-run cm-theorem-last-run-error'
      : 'cm-theorem-last-run'
    span.textContent = this.text
    span.title = this.text
    return span
  }
}

/** The values a run left, one widget at the end of each line. */
function decorations(doc: Text, run: LastRun | null): DecorationSet {
  if (!run) return Decoration.none
  const lines = new Map<number, { text: string; failed: boolean }>()
  for (const { line, text } of run.lines)
    if (line >= 1 && line <= doc.lines) lines.set(line, { text, failed: false })
  // The block's error, or its value when no line showed it, goes on the last line.
  const last = doc.lines
  if (run.status === 'error')
    lines.set(last, {
      text: `${run.error?.name ?? 'Error'}: ${run.error?.message ?? 'failed'}`,
      failed: true,
    })
  else if (run.value !== undefined && !lines.has(last))
    lines.set(last, { text: run.value, failed: false })
  const builder = new RangeSetBuilder<Decoration>()
  for (const [line, value] of [...lines].sort(([a], [b]) => a - b)) {
    const end = doc.line(line).to
    builder.add(
      end,
      end,
      Decoration.widget({
        widget: new ValueWidget(value.text, value.failed),
        side: 1,
      }),
    )
  }
  return builder.finish()
}

const runField = StateField.define<{ run: LastRun | null; set: DecorationSet }>(
  {
    create: () => ({ run: null, set: Decoration.none }),
    update(value, transaction) {
      let next = value
      // Values belong to the source that produced them: an edit takes them away.
      if (transaction.docChanged) next = { run: null, set: Decoration.none }
      for (const effect of transaction.effects)
        if (effect.is(showRun))
          next = {
            run: effect.value,
            set: decorations(transaction.state.doc, effect.value),
          }
      return next
    },
    provide: (field) =>
      EditorView.decorations.from(field, (value) => value.set),
  },
)

/** How long typing pauses before the values for the new source are looked up. */
const LOOKUP_DELAY_MS = 250

const lookup = (workspaceId: WorkspaceId) =>
  ViewPlugin.fromClass(
    class {
      private timer: ReturnType<typeof setTimeout> | undefined
      private hash: string | null = null
      private destroyed = false
      private readonly stop: () => void

      constructor(private readonly view: EditorView) {
        this.stop = onLastRun((run) => {
          if (run.sourceHash === this.hash) this.show(run)
        })
        this.schedule()
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.schedule()
      }

      private show(run: LastRun | null) {
        if (!this.destroyed) this.view.dispatch({ effects: showRun.of(run) })
      }

      private schedule() {
        clearTimeout(this.timer)
        this.hash = null
        const text = this.view.state.doc.toString()
        this.timer = setTimeout(() => {
          void sha256Hex(text).then(async (hash) => {
            if (this.destroyed || this.view.state.doc.toString() !== text)
              return
            this.hash = hash
            const run = await fetchLastRun(workspaceId, hash).catch(
              (error: unknown) => {
                console.error('[blocks] reading last-run values failed', error)
                return null
              },
            )
            if (run && this.hash === hash) this.show(run)
          })
        }, LOOKUP_DELAY_MS)
      }

      destroy() {
        this.destroyed = true
        clearTimeout(this.timer)
        this.stop()
      }
    },
  )

const theme = EditorView.baseTheme({
  '.cm-theorem-last-run': {
    marginInlineStart: '2ch',
    color: 'var(--color-ink-faint, #888)',
    fontStyle: 'italic',
    whiteSpace: 'pre',
    pointerEvents: 'none',
  },
  '.cm-theorem-last-run::before': { content: '"// "' },
  '.cm-theorem-last-run-error': { color: 'var(--color-error-ink, #c00)' },
})

/**
 * Last-run values beside a block's source: what each line produced the last
 * time this exact source ran, here or in any other view of it.
 */
export function lastRunMargin(workspaceId: WorkspaceId): Extension {
  return [runField, lookup(workspaceId), theme]
}
