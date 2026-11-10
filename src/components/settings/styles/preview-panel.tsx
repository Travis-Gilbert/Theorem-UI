// SOURCING: lib/theorem/response-styles usePreviewMutation (a model answers a sample question under each variant; nothing is run), coss ui Input and Alert
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/coss/alert'
import { Input } from '@/components/coss/input'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import { problemCode, usePreviewMutation } from '@/lib/theorem/response-styles'
import type {
  PreviewRequest,
  ResponseStyleDetail,
  StyleDraft,
} from '@/lib/theorem/response-styles'

/**
 * A sample question answered twice: once under the saved style and once under
 * the draft in the editor, side by side. With nothing to compare (the style is
 * new, or the draft is the saved text) it answers once.
 */
export function PreviewPanel({
  saved,
  draft,
  dirty,
}: {
  /** Undefined for a style that is not saved yet. */
  saved: ResponseStyleDetail | undefined
  draft: StyleDraft
  dirty: boolean
}) {
  const [question, setQuestion] = useState('')
  const [previewedDraft, setPreviewedDraft] = useState('')
  const preview = usePreviewMutation()
  const result = preview.data
  const unavailable = preview.error
    ? problemCode(preview.error) === 'response_preview_unavailable'
    : false

  const run = () => {
    const variants: PreviewRequest['variants'] =
      saved && dirty
        ? [
            {
              label: 'Saved',
              style: { id: saved.id, revision: saved.revision },
            },
            { label: 'Draft', draft },
          ]
        : saved
          ? [
              {
                label: 'Saved',
                style: { id: saved.id, revision: saved.revision },
              },
            ]
          : [{ label: 'Draft', draft }]
    setPreviewedDraft(JSON.stringify(draft))
    preview.mutate({ question: question.trim(), variants })
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          if (question.trim()) run()
        }}
      >
        <Input
          aria-label="Sample question"
          placeholder="A question to try the style on"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!question.trim() || preview.isPending}
        >
          {preview.isPending ? 'Previewing' : 'Preview'}
        </Button>
      </form>
      {!saved || !dirty ? (
        <p className="text-xs text-ink-muted">
          {saved
            ? 'The draft matches the saved style, so the preview shows one answer. Change the text to compare the two.'
            : 'This style is not saved yet, so the preview shows the draft only.'}
        </p>
      ) : null}
      {preview.error && (
        <Alert variant={unavailable ? 'warning' : 'error'}>
          <AlertTitle>
            {unavailable ? 'Preview needs a chat model' : 'Preview failed'}
          </AlertTitle>
          <AlertDescription>{describeError(preview.error)}</AlertDescription>
        </Alert>
      )}
      {result && (
        <section aria-label="Preview" className="flex flex-col gap-2">
          <p className="text-xs text-ink-muted">
            Model-generated previews, text only. Written by {result.model}.
            Nothing was run: no tools, research or delegation.
          </p>
          {JSON.stringify(draft) !== previewedDraft && (
            <p role="status" className="text-xs text-ink-muted">
              The draft has changed since this preview.
            </p>
          )}
          <div
            className={
              result.variants.length > 1
                ? 'grid gap-3 sm:grid-cols-2'
                : 'grid gap-3'
            }
          >
            {result.variants.map((variant) => (
              <article
                key={variant.label}
                aria-label={variant.label}
                className="flex min-w-0 flex-col gap-1 rounded-lg border border-separator p-3"
              >
                <h4 className="text-xs font-medium text-ink-muted">
                  {variant.label}
                </h4>
                <p className="whitespace-pre-wrap text-sm wrap-anywhere">
                  {variant.text}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
