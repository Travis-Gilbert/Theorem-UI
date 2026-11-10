// SOURCING: lib/theorem/response-styles useDraftMutation (the draft route proposes, it never saves), coss ui Input and Alert, the text diff component
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/coss/alert'
import { Input } from '@/components/coss/input'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import { problemCode, useDraftMutation } from '@/lib/theorem/response-styles'
import { proseText } from './style-text'
import { TextDiff } from './text-diff'

type Prose = { name: string; description: string; body: string }

/**
 * Describe a change in a sentence; a model proposes it. The proposal is a
 * difference to read, not an edit: it reaches the editor only on Apply, and
 * the editor still has to be saved.
 */
export function DescribeChange({
  kind,
  current,
  onApply,
}: {
  kind: 'style' | 'framework'
  current: Prose
  onApply: (proposal: Prose) => void
}) {
  const [instruction, setInstruction] = useState('')
  const [applied, setApplied] = useState(false)
  const draft = useDraftMutation()
  const proposal = draft.data
  const error = draft.error
  const needsModel = error
    ? problemCode(error) === 'response_draft_unavailable'
    : false
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          if (!instruction.trim()) return
          setApplied(false)
          draft.mutate({ kind, current, instruction: instruction.trim() })
        }}
      >
        <Input
          aria-label="Describe a change"
          placeholder="For example: shorter answers, with a summary first"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!instruction.trim() || draft.isPending}
        >
          {draft.isPending ? 'Drafting' : 'Draft the change'}
        </Button>
      </form>
      {error && (
        <Alert variant={needsModel ? 'warning' : 'error'}>
          <AlertTitle>
            {needsModel ? 'Drafting needs a chat model' : 'Drafting failed'}
          </AlertTitle>
          <AlertDescription>{describeError(error)}</AlertDescription>
        </Alert>
      )}
      {proposal && (
        <section
          aria-label="Proposed change"
          className="flex flex-col gap-2 rounded-lg border border-separator p-3"
        >
          <p className="text-sm">
            Proposed by {proposal.model}. Nothing has changed yet: read it, then
            apply it to the editor or discard it.
          </p>
          <TextDiff
            before={proseText(current)}
            after={proseText(proposal.draft)}
            name={`${kind}.md`}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="xs"
              onClick={() => {
                onApply(proposal.draft)
                draft.reset()
                setInstruction('')
                setApplied(true)
              }}
            >
              Apply to editor
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                draft.reset()
                setApplied(false)
              }}
            >
              Discard
            </Button>
          </div>
        </section>
      )}
      {applied && !proposal && (
        <p role="status" className="text-sm text-ink-muted">
          Applied to the editor. It is not saved until you save.
        </p>
      )}
    </div>
  )
}
