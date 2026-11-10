// SOURCING: @theoremharness/sdk (assistant-ui adapter: the patched text part)
import { expect, test } from 'bun:test'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import type { Theorem } from './client'

type StoredPart = Theorem.Message['parts'][number]
const content = (parts: StoredPart[]) => toAssistantMessages([{
  schema: 'theorem.chat.message.v1', messageId: 'm', tenantId: 'tenant',
  threadId: 'thread', originBranchId: 'branch', role: 'assistant', createdAtMs: 1, parts,
} satisfies Theorem.Message])[0].content as readonly Record<string, unknown>[]

test('a text part keeps its purpose, segment and status as provider metadata', () => {
  const [text] = content([
    { partId: 't0', type: 'text', payload: { text: 'On it.', purpose: 'commentary', segment: 0, status: 'complete' } },
  ])
  expect(text).toEqual({
    type: 'text', id: 't0', text: 'On it.',
    providerMetadata: { theorem: { purpose: 'commentary', segment: 0, status: 'complete' } },
  })
})

test('a text part from before purposes carries no metadata, and so is an answer', () => {
  const [text] = content([{ partId: 't', type: 'text', payload: { text: 'Denver gets 300 days of sun.' } }])
  expect(text).toEqual({ type: 'text', id: 't', text: 'Denver gets 300 days of sun.' })
})

test('values outside the contract are dropped rather than passed on', () => {
  const [text] = content([
    { partId: 't', type: 'text', payload: { text: 'x', purpose: 'aside', segment: '1', status: 'weird' } },
  ])
  expect(text).toEqual({ type: 'text', id: 't', text: 'x' })
})

test('reasoning does not take the text metadata', () => {
  const [reasoning] = content([
    { partId: 'r', type: 'reasoning', payload: { text: 'thinking', purpose: 'commentary' } },
  ])
  expect(reasoning).toEqual({ type: 'reasoning', id: 'r', text: 'thinking' })
})

test('segments stay separate parts in event order, with tool work between them', () => {
  const kinds = content([
    { partId: 't0', type: 'text', payload: { text: 'On it.', purpose: 'commentary', segment: 0 } },
    { partId: 'c', type: 'tool_call', payload: { toolCallId: 'a', toolName: 'web_search', safeArguments: {} } },
    { partId: 'r', type: 'tool_result', payload: { toolCallId: 'a', status: 'complete', safeOutput: {} } },
    { partId: 't1', type: 'text', payload: { text: 'Done.', purpose: 'answer', segment: 1 } },
  ]).map((part) => part.type)
  expect(kinds).toEqual(['text', 'tool-call', 'text'])
})

test('completion and limits arrive as data parts the renderers can pick up', () => {
  const limits = { maxOutputTokensPerCall: { value: 8000, source: 'request' } }
  const parts = content([
    { partId: 'run:limits', type: 'limits', payload: { limits } },
    { partId: 'run:completion', type: 'completion', payload: { stopReason: 'max_output_tokens', limits } },
  ])
  expect(parts).toEqual([
    { type: 'data', name: 'theorem-limits', data: { limits } },
    { type: 'data', name: 'theorem-completion', data: { stopReason: 'max_output_tokens', limits } },
  ])
})
