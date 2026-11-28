// SOURCING: the schema register's `theorem.operations` extension (rustyred-thg-schema operations.rs) and Theorem's `class_operation` native tool, called through callTool (lib/theorem/native); @tanstack/react-query for the receipts and the run. Nothing here decides whether an action may run: the bound tool's own owner does, as for any other caller.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ObjectType } from '@/components/records/contract'
import { callTool, NativeToolError } from '@/lib/theorem/native'

export const OPERATIONS_EXTENSION = 'theorem.operations'

export type OperationEffect = 'read' | 'write'
export type OperationInputKind = 'text' | 'number' | 'boolean'

export type OperationInput = {
  key: string
  label: string
  kind?: OperationInputKind
  required?: boolean
}

/** One action a class offers, bound to an existing tool. */
export type OperationBinding = {
  key: string
  label: string
  description?: string
  tool: string
  arguments?: Record<string, unknown>
  effect?: OperationEffect
  inputs?: OperationInput[]
}

export type OperationPreview = {
  operation: OperationBinding
  tool: string
  arguments: Record<string, unknown>
  effect: OperationEffect
  target: { object_type_id: string; record_id: string; revision: number }
}

export type OperationReceipt = {
  id: string
  object_type_id: string
  record_id: string
  record_revision: number
  operation: string
  operation_label: string
  effect: OperationEffect
  tool: string
  arguments: Record<string, unknown>
  result: unknown
  result_truncated?: boolean
  actor?: string | null
  origin?: { kind?: string; thread_id?: string | null } | null
  at_ms: number
}

const isBinding = (value: unknown): value is OperationBinding =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as OperationBinding).key === 'string' &&
  typeof (value as OperationBinding).tool === 'string'

/** The actions `type` declares, in its order. */
export function operationsOf(
  type: Pick<ObjectType, 'extensions'>,
): OperationBinding[] {
  const value = type.extensions?.[OPERATIONS_EXTENSION]
  return Array.isArray(value) ? value.filter(isBinding) : []
}

/** `type`'s extensions with its actions replaced; none removes the key. */
export function withOperations(
  type: Pick<ObjectType, 'extensions'>,
  bindings: OperationBinding[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...type.extensions }
  if (bindings.length) next[OPERATIONS_EXTENSION] = bindings
  else delete next[OPERATIONS_EXTENSION]
  return next
}

/** A key for an action named `label`: snake_case, as the register requires. */
export const operationKey = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .replace(/^(\d)/u, '_$1') || 'action'

/** What the tool said when it refused, in its own words. */
export function operationRefusal(error: unknown): string {
  if (error instanceof NativeToolError) {
    const answer = error.answer as { message?: unknown } | undefined
    if (typeof answer?.message === 'string') return answer.message
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}

type Target = {
  objectTypeId: string
  operation: string
  recordId: string
  input: Record<string, unknown>
}

const args = (action: 'preview' | 'run', target: Target) => ({
  action,
  object_type_id: target.objectTypeId,
  operation: target.operation,
  record_id: target.recordId,
  input: target.input,
})

export const previewOperation = async (target: Target) =>
  (
    await callTool<{ preview: OperationPreview }>(
      'class_operation',
      args('preview', target),
    )
  ).preview

export const runOperation = (target: Target) =>
  callTool<{ receipt: OperationReceipt; result: unknown }>(
    'class_operation',
    args('run', target),
  )

const receiptsKey = (recordId: string | undefined) => [
  'theorem',
  'objects',
  'operation-receipts',
  recordId,
]

/** The actions run on one object, newest first. */
export function useOperationReceipts(recordId: string | undefined) {
  return useQuery({
    queryKey: receiptsKey(recordId),
    queryFn: async () =>
      (
        await callTool<{ receipts: OperationReceipt[] }>('class_operation', {
          action: 'receipts',
          record_id: recordId,
        })
      ).receipts,
    enabled: !!recordId,
  })
}

/** Run an action; a run that succeeded shows in the object's receipts. */
export function useRunOperation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: runOperation,
    onSuccess: (_, target) =>
      client.invalidateQueries({ queryKey: receiptsKey(target.recordId) }),
  })
}
