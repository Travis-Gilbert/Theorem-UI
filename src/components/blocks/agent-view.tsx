// SOURCING: agent.ts (the block's YAML body, read with yaml and zod) and the
// app's tokens. An agent block as plan D9 describes it: its prompt, inputs,
// trigger and output, and the latest run's status and result.
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { parseAgent } from '@/lib/blocks/agent'
import type { AgentSpec } from '@/lib/blocks/agent'
import type { CellState } from '@/lib/blocks/runtime'
import type { RunRequestResult } from '@/lib/blocks/sandbox/protocol'
import { BlockMessage } from './block-status'

function readAgent(source: string): AgentSpec | null {
  try {
    return parseAgent(source)
  } catch {
    // The session fails the block with the same message; the view shows it.
    return null
  }
}

const isRunResult = (value: unknown): value is RunRequestResult =>
  typeof value === 'object' &&
  value !== null &&
  'status' in value &&
  'message' in value

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  )
}

/** What an agent block asks for, and what its latest run said. */
export function AgentView({
  source,
  state,
}: {
  source: string
  state: CellState | null
}) {
  const agent = useMemo(() => readAgent(source), [source])
  const result = isRunResult(state?.value) ? state.value : null
  return (
    <div className="space-y-1.5 py-1.5">
      {agent && (
        <dl className="space-y-1 px-3 text-xs">
          <Field label="Prompt">
            <p className="line-clamp-3 whitespace-pre-wrap">{agent.prompt}</p>
          </Field>
          {agent.inputs.length > 0 && (
            <Field label="Inputs">
              <span className="flex flex-wrap gap-1">
                {agent.inputs.map((input) => (
                  <code
                    key={input}
                    className="rounded bg-raised px-1 py-0.5 text-ink-muted"
                  >
                    {input}
                  </code>
                ))}
              </span>
            </Field>
          )}
          <Field label="Trigger">
            {agent.trigger === 'manual'
              ? 'When Run is pressed, or a block calls run()'
              : `On the schedule ${agent.trigger.schedule}`}
          </Field>
          {agent.output && (
            <Field label="Output">
              <code className="text-ink-muted">{agent.output}</code>
            </Field>
          )}
        </dl>
      )}
      {result && (
        <BlockMessage>
          <span className="font-medium text-ink">
            {result.status === 'queued' ? 'Queued' : 'Not run'}:
          </span>{' '}
          {result.message}
        </BlockMessage>
      )}
    </div>
  )
}
