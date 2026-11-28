// SOURCING: after Capacities' object actions (an object type's actions listed on its objects) with Craft web's inline disclosure rows; the actions are the class's `theorem.operations` bindings and run through Theorem's `class_operation` tool (lib/objects/operations), which previews the bound call and keeps a receipt; ui/button and ui/input for the controls
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseRecordItemId } from '@/components/records/model'
import type { ObjectEntry } from '@/lib/objects/library'
import {
  operationRefusal,
  operationsOf,
  previewOperation,
  useOperationReceipts,
  useRunOperation,
} from '@/lib/objects/operations'
import type {
  OperationBinding,
  OperationReceipt,
} from '@/lib/objects/operations'
import { cn } from '@/lib/utils'

const recordIdOf = (entry: ObjectEntry) =>
  entry.record ? parseRecordItemId(entry.ref)?.recordId : undefined

/** The actions an object's class offers, each previewed before it runs. */
export function ObjectActions({
  entry,
  className,
}: {
  entry: ObjectEntry
  className?: string
}) {
  const bindings = operationsOf(entry.cls.type)
  const recordId = recordIdOf(entry)
  const [open, setOpen] = useState<string>()
  if (!bindings.length || !recordId) return null
  return (
    <ul aria-label="Actions" className={cn('flex flex-col', className)}>
      {bindings.map((binding) => (
        <li key={binding.key} className="flex flex-col">
          <button
            type="button"
            aria-expanded={open === binding.key}
            onClick={() =>
              setOpen((current) =>
                current === binding.key ? undefined : binding.key,
              )
            }
            className="flex min-h-7 items-center gap-2 rounded-md px-2 text-start text-sm outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
          >
            {binding.effect === 'write' ? (
              <Icon.Edit
                aria-hidden
                className="size-3.5 shrink-0 text-ink-faint"
              />
            ) : (
              <Icon.Play
                aria-hidden
                className="size-3.5 shrink-0 text-ink-faint"
              />
            )}
            <span className="min-w-0 flex-1 truncate">{binding.label}</span>
            <Icon.ChevronRight
              aria-hidden
              className={cn(
                'size-3.5 shrink-0 text-ink-faint transition-transform',
                open === binding.key && 'rotate-90',
              )}
            />
          </button>
          {open === binding.key && (
            <ActionRun
              binding={binding}
              objectTypeId={entry.cls.id}
              recordId={recordId}
            />
          )}
        </li>
      ))}
    </ul>
  )
}

function ActionRun({
  binding,
  objectTypeId,
  recordId,
}: {
  binding: OperationBinding
  objectTypeId: string
  recordId: string
}) {
  const [input, setInput] = useState<Record<string, unknown>>({})
  const target = { objectTypeId, operation: binding.key, recordId, input }
  const preview = useQuery({
    queryKey: [
      'theorem',
      'objects',
      'operation-preview',
      objectTypeId,
      binding.key,
      recordId,
      input,
    ],
    queryFn: () => previewOperation(target),
    retry: false,
  })
  const run = useRunOperation()
  return (
    <div className="flex flex-col gap-2 px-2 pt-1 pb-3">
      {binding.description && (
        <p className="text-xs text-ink-muted">{binding.description}</p>
      )}
      {(binding.inputs ?? []).map((field) => (
        <label key={field.key} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">
            {field.label}
          </span>
          {field.kind === 'boolean' ? (
            <input
              type="checkbox"
              aria-label={field.label}
              checked={input[field.key] === true}
              onChange={(event) =>
                setInput({ ...input, [field.key]: event.target.checked })
              }
              className="self-start"
            />
          ) : (
            <Input
              aria-label={field.label}
              inputMode={field.kind === 'number' ? 'decimal' : undefined}
              value={
                input[field.key] === undefined ? '' : String(input[field.key])
              }
              onChange={(event) => {
                const raw = event.target.value
                const next = { ...input }
                if (raw === '') delete next[field.key]
                else
                  next[field.key] =
                    field.kind === 'number' && Number.isFinite(Number(raw))
                      ? Number(raw)
                      : raw
                setInput(next)
              }}
            />
          )}
        </label>
      ))}
      {preview.error ? (
        <p role="alert" className="text-xs wrap-anywhere text-error-ink">
          {operationRefusal(preview.error)}
        </p>
      ) : preview.data ? (
        <div className="flex flex-col gap-1 rounded-md bg-frame p-2 text-xs">
          <p className="font-mono text-ink">{preview.data.tool}</p>
          <pre className="max-h-40 overflow-auto font-mono whitespace-pre-wrap text-ink-muted">
            {JSON.stringify(preview.data.arguments, null, 2)}
          </pre>
          <p className="text-ink-faint">
            {preview.data.effect === 'write' ? 'Changes things' : 'Reads only'}{' '}
            · revision {preview.data.target.revision}
          </p>
        </div>
      ) : (
        <p role="status" className="text-xs text-ink-faint">
          Loading…
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!preview.data || run.isPending}
          onClick={() => run.mutate(target)}
        >
          {run.isPending ? 'Running…' : 'Run'}
        </Button>
      </div>
      {run.error && (
        <p role="alert" className="text-xs wrap-anywhere text-error-ink">
          {operationRefusal(run.error)}
        </p>
      )}
      {run.data && (
        <div role="status" className="flex flex-col gap-1 text-xs">
          <time
            className="text-ink-faint"
            dateTime={new Date(run.data.receipt.at_ms).toISOString()}
          >
            Ran {new Date(run.data.receipt.at_ms).toLocaleString()}
          </time>
          <pre className="max-h-56 overflow-auto rounded-md bg-frame p-2 font-mono whitespace-pre-wrap">
            {JSON.stringify(run.data.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

/** The actions run on one object, newest first, each with what it called. */
export function OperationReceipts({ entry }: { entry: ObjectEntry }) {
  const recordId = recordIdOf(entry)
  const receipts = useOperationReceipts(
    operationsOf(entry.cls.type).length ? recordId : undefined,
  )
  if (!receipts.data?.length) return null
  return (
    <ol aria-label="Runs" className="flex flex-col gap-2 px-2">
      {receipts.data.map((receipt) => (
        <ReceiptRow key={receipt.id} receipt={receipt} />
      ))}
    </ol>
  )
}

function ReceiptRow({ receipt }: { receipt: OperationReceipt }) {
  const thread = receipt.origin?.thread_id
  return (
    <li className="flex flex-col text-sm">
      <span>
        {receipt.operation_label}{' '}
        <span className="font-mono text-xs text-ink-muted">{receipt.tool}</span>
      </span>
      {thread && (
        <span className="text-xs text-ink-muted">
          Run by Theorem in your conversation.{' '}
          <Link
            to="/c/$threadId"
            params={{ threadId: thread }}
            className="rounded-sm font-medium text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            See the conversation
          </Link>
        </span>
      )}
      <details className="text-xs">
        <summary className="cursor-default text-ink-faint">
          <time dateTime={new Date(receipt.at_ms).toISOString()}>
            {new Date(receipt.at_ms).toLocaleString()}
          </time>{' '}
          · revision {receipt.record_revision}
        </summary>
        <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-frame p-2 font-mono whitespace-pre-wrap">
          {JSON.stringify(
            { arguments: receipt.arguments, result: receipt.result },
            null,
            2,
          )}
        </pre>
      </details>
    </li>
  )
}
